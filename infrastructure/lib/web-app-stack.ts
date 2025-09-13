import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export interface WebAppStackProps extends cdk.StackProps {
  domainName?: string;
  hostedZoneId?: string;
}

export class WebAppStack extends cdk.Stack {
  public readonly webAppBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly webAppUrl: string;

  constructor(scope: Construct, id: string, props?: WebAppStackProps) {
    super(scope, id, props);

    // S3 Bucket for hosting the React app
    this.webAppBucket = new s3.Bucket(this, 'govbizai-web-app-bucket', {
      bucketName: `govbizai-web-app-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          id: 'delete-old-versions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    // CloudFront Origin Access Identity for S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'govbizai-oai', {
      comment: 'Origin Access Identity for GovBiz AI Web App',
    });

    // Grant read access to CloudFront
    this.webAppBucket.grantRead(originAccessIdentity);

    // WAF Web ACL for protection
    const webAcl = new wafv2.CfnWebACL(this, 'govbizai-web-acl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      name: 'govbizai-web-acl',
      description: 'Web ACL for GovBiz AI Web Application',
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'govbizai-web-acl',
      },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 10000,
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
        {
          name: 'CommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        {
          name: 'KnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSetMetric',
          },
        },
      ],
    });

    // SSL Certificate (if domain is provided)
    let certificate: certificatemanager.ICertificate | undefined;
    if (props?.domainName) {
      certificate = new certificatemanager.Certificate(this, 'govbizai-cert', {
        domainName: props.domainName,
        subjectAlternativeNames: [`www.${props.domainName}`],
        validation: certificatemanager.CertificateValidation.fromDns(),
      });
    }

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'govbizai-distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.webAppBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: new cloudfront.CachePolicy(this, 'govbizai-spa-cache-policy', {
          cachePolicyName: 'govbizai-spa-cache-policy',
          comment: 'Cache policy for SPA with API calls',
          defaultTtl: cdk.Duration.hours(24),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        }),
      },
      additionalBehaviors: {
        '/static/*': {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.webAppBucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
      },
      domainNames: props?.domainName ? [props.domainName, `www.${props.domainName}`] : undefined,
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      webAclId: webAcl.attrArn,
    });

    // Route 53 Records (if domain is provided)
    if (props?.domainName && props?.hostedZoneId) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'govbizai-hosted-zone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName,
      });

      new route53.ARecord(this, 'govbizai-a-record', {
        zone: hostedZone,
        target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.distribution)),
      });

      new route53.ARecord(this, 'govbizai-www-a-record', {
        zone: hostedZone,
        recordName: 'www',
        target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.distribution)),
      });
    }

    // Deploy the React build to S3
    new s3deploy.BucketDeployment(this, 'govbizai-web-deployment', {
      sources: [s3deploy.Source.asset('../web-app/build')],
      destinationBucket: this.webAppBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true,
      retainOnDelete: false,
    });

    // Set the web app URL
    this.webAppUrl = props?.domainName
      ? `https://${props.domainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Outputs
    new cdk.CfnOutput(this, 'WebAppBucketName', {
      value: this.webAppBucket.bucketName,
      description: 'Name of the S3 bucket hosting the web application',
      exportName: 'govbizai-web-app-bucket-name',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: 'govbizai-cloudfront-distribution-id',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: 'govbizai-cloudfront-domain-name',
    });

    new cdk.CfnOutput(this, 'WebApplicationUrl', {
      value: this.webAppUrl,
      description: 'Web application URL',
      exportName: 'govbizai-web-app-url',
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'WAF Web ACL ARN',
      exportName: 'govbizai-web-acl-arn',
    });

    // Security headers for CloudFront
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'govbizai-security-headers', {
      responseHeadersPolicyName: 'govbizai-security-headers',
      comment: 'Security headers for GovBiz AI web application',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.govbiz-ai.com wss://api.govbiz-ai.com https://*.amazonaws.com",
          override: true,
        },
      },
    });

    // Apply security headers to the distribution
    (this.distribution.node.defaultChild as cloudfront.CfnDistribution).addPropertyOverride(
      'DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
      responseHeadersPolicy.responseHeadersPolicyId
    );

    // Tags
    cdk.Tags.of(this).add('Project', 'GovBizAI');
    cdk.Tags.of(this).add('Component', 'WebApplication');
    cdk.Tags.of(this).add('Environment', 'Development');
  }
}