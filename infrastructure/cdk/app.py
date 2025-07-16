#!/usr/bin/env python3
"""
GovBiz.ai - AWS CDK Application for Multi-Agent Government Contracting Platform
Production-ready infrastructure deployment for dev environment
"""

import aws_cdk as cdk
from aws_cdk import (
    Stack,
    Environment,
    Tags,
    Duration,
    aws_lambda as _lambda,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_events as events,
    aws_events_targets as targets,
    aws_iam as iam,
    aws_sns as sns,
    aws_sns_subscriptions as subscriptions,
    aws_s3 as s3,
    aws_secretsmanager as secretsmanager,
    aws_ses as ses,
    aws_cloudwatch as cloudwatch,
    aws_logs as logs,
    aws_apigateway as apigateway,
    aws_cognito as cognito,
    CfnOutput,
    RemovalPolicy
)
from datetime import datetime, timedelta
from constructs import Construct
import json


class GovBizAiStack(Stack):
    """
    Main infrastructure stack for GovBiz.ai multi-agent system
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Environment and naming configuration
        self.env_name = "dev"
        self.project_name = "govbiz-ai"
        self.naming_prefix = f"{self.project_name}-{self.env_name}"
        
        # Common tags for all resources
        common_tags = {
            "Project": self.project_name,
            "Environment": self.env_name,
            "ManagedBy": "aws-cdk",
            "Team": "contracting-ai",
            "Purpose": "multi-agent-system"
        }
        
        # Apply tags to all resources in the stack
        for key, value in common_tags.items():
            Tags.of(self).add(key, value)

        # Create core infrastructure
        self.create_storage_layer()
        self.create_messaging_layer()
        self.create_security_layer()
        self.create_compute_layer()
        self.create_web_layer()
        self.create_monitoring_layer()
        self.create_email_layer()

    def create_storage_layer(self):
        """Create DynamoDB tables for multi-agent data storage"""
        
        # Opportunities table - stores discovered government opportunities
        self.opportunities_table = dynamodb.Table(
            self, "OpportunitiesTable",
            table_name=f"{self.naming_prefix}-opportunities",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,  # For dev environment
            point_in_time_recovery=True,
            stream=dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        )
        
        # Add GSI for notice_id lookups
        self.opportunities_table.add_global_secondary_index(
            index_name="notice-id-index",
            partition_key=dynamodb.Attribute(
                name="notice_id",
                type=dynamodb.AttributeType.STRING
            )
        )
        
        # Add GSI for agency lookups
        self.opportunities_table.add_global_secondary_index(
            index_name="agency-index",
            partition_key=dynamodb.Attribute(
                name="agency",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Companies table - stores company profiles and capabilities
        self.companies_table = dynamodb.Table(
            self, "CompaniesTable",
            table_name=f"{self.naming_prefix}-companies",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )

        # Responses table - stores generated responses and submissions
        self.responses_table = dynamodb.Table(
            self, "ResponsesTable",
            table_name=f"{self.naming_prefix}-responses",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )
        
        # Add GSI for opportunity_id lookups
        self.responses_table.add_global_secondary_index(
            index_name="opportunity-id-index",
            partition_key=dynamodb.Attribute(
                name="opportunity_id",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Contacts table - stores government POCs and relationships
        self.contacts_table = dynamodb.Table(
            self, "ContactsTable",
            table_name=f"{self.naming_prefix}-contacts",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )
        
        # Add GSI for email lookups
        self.contacts_table.add_global_secondary_index(
            index_name="email-index",
            partition_key=dynamodb.Attribute(
                name="email",
                type=dynamodb.AttributeType.STRING
            )
        )
        
        # Add GSI for agency lookups
        self.contacts_table.add_global_secondary_index(
            index_name="agency-index",
            partition_key=dynamodb.Attribute(
                name="agency",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Events table - event sourcing for immutable audit log
        self.events_table = dynamodb.Table(
            self, "EventsTable",
            table_name=f"{self.naming_prefix}-events",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )
        
        # Add GSI for aggregate_id and timestamp queries
        self.events_table.add_global_secondary_index(
            index_name="aggregate-id-timestamp-index",
            partition_key=dynamodb.Attribute(
                name="aggregate_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Approvals table - stores human-in-the-loop approvals
        self.approvals_table = dynamodb.Table(
            self, "ApprovalsTable",
            table_name=f"{self.naming_prefix}-approvals",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )

        # Search indices storage bucket
        self.search_indices_bucket = s3.Bucket(
            self, "SearchIndicesBucket",
            bucket_name=f"{self.naming_prefix}-search-indices-{self.account}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED
        )

        # Document storage bucket
        self.documents_bucket = s3.Bucket(
            self, "DocumentsBucket",
            bucket_name=f"{self.naming_prefix}-documents-{self.account}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED
        )

    def create_messaging_layer(self):
        """Create SQS queues for agent communication"""
        
        # Dead letter queue for failed messages
        self.dlq = sqs.Queue(
            self, "DeadLetterQueue",
            queue_name=f"{self.naming_prefix}-dlq",
            retention_period=Duration.days(14)
        )

        # Opportunity Finder Agent Queue
        self.opportunity_finder_queue = sqs.Queue(
            self, "OpportunityFinderQueue",
            queue_name=f"{self.naming_prefix}-opportunity-finder-queue",
            visibility_timeout=Duration.minutes(15),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

        # Analyzer Agent Queue
        self.analyzer_queue = sqs.Queue(
            self, "AnalyzerQueue",
            queue_name=f"{self.naming_prefix}-analyzer-queue",
            visibility_timeout=Duration.minutes(15),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

        # Response Generator Agent Queue
        self.response_generator_queue = sqs.Queue(
            self, "ResponseGeneratorQueue",
            queue_name=f"{self.naming_prefix}-response-generator-queue",
            visibility_timeout=Duration.minutes(10),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

        # Relationship Manager Agent Queue
        self.relationship_manager_queue = sqs.Queue(
            self, "RelationshipManagerQueue",
            queue_name=f"{self.naming_prefix}-relationship-manager-queue",
            visibility_timeout=Duration.minutes(10),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

        # Email Manager Agent Queue
        self.email_manager_queue = sqs.Queue(
            self, "EmailManagerQueue",
            queue_name=f"{self.naming_prefix}-email-manager-queue",
            visibility_timeout=Duration.minutes(10),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

        # Human Loop Queue for human-in-the-loop interactions
        self.human_loop_queue = sqs.Queue(
            self, "HumanLoopQueue",
            queue_name=f"{self.naming_prefix}-human-loop-queue",
            visibility_timeout=Duration.minutes(5),
            retention_period=Duration.days(14),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq
            )
        )

    def create_security_layer(self):
        """Create IAM roles and secrets management"""
        
        # Secrets for API keys and sensitive configuration
        self.api_keys_secret = secretsmanager.Secret(
            self, "ApiKeysSecret",
            secret_name=f"{self.naming_prefix}-api-keys",
            description="API keys and secrets for GovBiz.ai agents",
            generate_secret_string=secretsmanager.SecretStringGenerator(
                secret_string_template=json.dumps({
                    "anthropic_api_key": "",
                    "slack_bot_token": "",
                    "slack_signing_secret": "",
                    "sam_gov_api_key": "",
                    "google_oauth_client_id": "",
                    "google_oauth_client_secret": "",
                    "nextauth_secret": "",
                    "nextauth_url": ""
                }),
                generate_string_key="anthropic_api_key"
            )
        )

        # Lambda execution role with comprehensive permissions
        self.lambda_execution_role = iam.Role(
            self, "LambdaExecutionRole",
            role_name=f"{self.naming_prefix}-lambda-execution-role",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AWSXRayDaemonWriteAccess"
                )
            ]
        )

        # DynamoDB permissions
        self.lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:BatchGetItem",
                    "dynamodb:BatchWriteItem"
                ],
                resources=[
                    self.opportunities_table.table_arn,
                    self.companies_table.table_arn,
                    self.responses_table.table_arn,
                    self.contacts_table.table_arn,
                    self.events_table.table_arn,
                    self.approvals_table.table_arn,
                    f"{self.opportunities_table.table_arn}/index/*",
                    f"{self.companies_table.table_arn}/index/*",
                    f"{self.responses_table.table_arn}/index/*",
                    f"{self.contacts_table.table_arn}/index/*",
                    f"{self.events_table.table_arn}/index/*",
                    f"{self.approvals_table.table_arn}/index/*"
                ]
            )
        )

        # SQS permissions
        self.lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "sqs:SendMessage",
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl"
                ],
                resources=[
                    self.opportunity_finder_queue.queue_arn,
                    self.analyzer_queue.queue_arn,
                    self.response_generator_queue.queue_arn,
                    self.relationship_manager_queue.queue_arn,
                    self.email_manager_queue.queue_arn,
                    self.human_loop_queue.queue_arn,
                    self.dlq.queue_arn
                ]
            )
        )

        # Secrets Manager permissions
        self.lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret"
                ],
                resources=[self.api_keys_secret.secret_arn]
            )
        )

        # S3 permissions
        self.lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject",
                    "s3:ListBucket"
                ],
                resources=[
                    self.search_indices_bucket.bucket_arn,
                    f"{self.search_indices_bucket.bucket_arn}/*",
                    self.documents_bucket.bucket_arn,
                    f"{self.documents_bucket.bucket_arn}/*"
                ]
            )
        )

        # SES permissions for email functionality
        self.lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "ses:SendEmail",
                    "ses:SendRawEmail",
                    "ses:GetSendQuota",
                    "ses:GetSendStatistics"
                ],
                resources=["*"]
            )
        )

    def create_compute_layer(self):
        """Create Lambda functions for agent compute"""
        
        # Common environment variables for all Lambda functions
        common_env = {
            "ENVIRONMENT": self.env_name,
            "PROJECT_NAME": self.project_name,
            "SECRETS_ARN": self.api_keys_secret.secret_arn,
            "OPPORTUNITIES_TABLE": self.opportunities_table.table_name,
            "COMPANIES_TABLE": self.companies_table.table_name,
            "RESPONSES_TABLE": self.responses_table.table_name,
            "CONTACTS_TABLE": self.contacts_table.table_name,
            "EVENTS_TABLE": self.events_table.table_name,
            "APPROVALS_TABLE": self.approvals_table.table_name,
            "SEARCH_INDICES_BUCKET": self.search_indices_bucket.bucket_name,
            "DOCUMENTS_BUCKET": self.documents_bucket.bucket_name,
            "PYTHONPATH": "/var/runtime:/var/task:/opt/python"
        }

        # Opportunity Finder Agent Lambda
        self.opportunity_finder_lambda = _lambda.Function(
            self, "OpportunityFinderLambda",
            function_name=f"{self.naming_prefix}-opportunity-finder-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.opportunity_finder_lambda.lambda_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(15),
            memory_size=1024,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # Analyzer Agent Lambda
        self.analyzer_lambda = _lambda.Function(
            self, "AnalyzerLambda",
            function_name=f"{self.naming_prefix}-analyzer-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.all_lambda_handlers.analyzer_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(15),
            memory_size=2048,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # Response Generator Agent Lambda
        self.response_generator_lambda = _lambda.Function(
            self, "ResponseGeneratorLambda",
            function_name=f"{self.naming_prefix}-response-generator-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.all_lambda_handlers.response_generator_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(10),
            memory_size=2048,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # Relationship Manager Agent Lambda
        self.relationship_manager_lambda = _lambda.Function(
            self, "RelationshipManagerLambda",
            function_name=f"{self.naming_prefix}-relationship-manager-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.all_lambda_handlers.relationship_manager_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(10),
            memory_size=1024,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # Email Manager Agent Lambda
        self.email_manager_lambda = _lambda.Function(
            self, "EmailManagerLambda",
            function_name=f"{self.naming_prefix}-email-manager-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.all_lambda_handlers.email_manager_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(10),
            memory_size=1024,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # Human Loop Agent Lambda
        self.human_loop_lambda = _lambda.Function(
            self, "HumanLoopLambda",
            function_name=f"{self.naming_prefix}-human-loop-agent",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.agents.all_lambda_handlers.human_loop_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.minutes(5),
            memory_size=512,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE,
            retry_attempts=2
        )

        # API Gateway Lambda
        self.api_lambda = _lambda.Function(
            self, "ApiLambda",
            function_name=f"{self.naming_prefix}-api",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="src.api.lambda_server.lambda_handler",
            code=_lambda.Code.from_asset("../../"),
            role=self.lambda_execution_role,
            timeout=Duration.seconds(30),
            memory_size=1024,
            environment=common_env,
            tracing=_lambda.Tracing.ACTIVE
        )

        # Set up SQS event sources for agent lambdas
        self.opportunity_finder_lambda.add_event_source(
            _lambda.SqsEventSource(self.opportunity_finder_queue, batch_size=1)
        )
        
        self.analyzer_lambda.add_event_source(
            _lambda.SqsEventSource(self.analyzer_queue, batch_size=1)
        )
        
        self.response_generator_lambda.add_event_source(
            _lambda.SqsEventSource(self.response_generator_queue, batch_size=1)
        )
        
        self.relationship_manager_lambda.add_event_source(
            _lambda.SqsEventSource(self.relationship_manager_queue, batch_size=1)
        )
        
        self.email_manager_lambda.add_event_source(
            _lambda.SqsEventSource(self.email_manager_queue, batch_size=1)
        )
        
        self.human_loop_lambda.add_event_source(
            _lambda.SqsEventSource(self.human_loop_queue, batch_size=1)
        )

        # EventBridge rules for scheduled agent triggers
        self.create_scheduled_triggers()

    def create_scheduled_triggers(self):
        """Create EventBridge rules for time-based agent triggers"""
        
        # Daily opportunity discovery at 8 AM EST (1 PM UTC)
        self.opportunity_discovery_rule = events.Rule(
            self, "OpportunityDiscoveryRule",
            rule_name=f"{self.naming_prefix}-opportunity-discovery-schedule",
            description="Daily opportunity discovery at 8 AM EST",
            schedule=events.Schedule.cron(
                minute="0",
                hour="13",  # 8 AM EST = 1 PM UTC
                day="*",
                month="*",
                year="*"
            )
        )
        
        self.opportunity_discovery_rule.add_target(
            targets.LambdaFunction(self.opportunity_finder_lambda)
        )

        # Weekly relationship follow-up on Mondays at 9 AM EST
        self.relationship_followup_rule = events.Rule(
            self, "RelationshipFollowupRule",
            rule_name=f"{self.naming_prefix}-relationship-followup-schedule",
            description="Weekly relationship follow-up on Mondays at 9 AM EST",
            schedule=events.Schedule.cron(
                minute="0",
                hour="14",  # 9 AM EST = 2 PM UTC
                day="*",
                month="*",
                year="*",
                week_day="MON"
            )
        )
        
        self.relationship_followup_rule.add_target(
            targets.LambdaFunction(self.relationship_manager_lambda)
        )

    def create_web_layer(self):
        """Create API Gateway and Cognito for web application"""
        
        # Cognito User Pool for authentication
        self.user_pool = cognito.UserPool(
            self, "UserPool",
            user_pool_name=f"{self.naming_prefix}-user-pool",
            sign_in_aliases=cognito.SignInAliases(email=True),
            self_sign_up_enabled=True,
            user_verification=cognito.UserVerification(
                email_subject="GovBiz.ai - Verify your email",
                email_body="Please verify your email address by clicking the link: {##Verify Email##}"
            ),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=True
            ),
            removal_policy=RemovalPolicy.DESTROY
        )

        # Cognito User Pool Client
        self.user_pool_client = cognito.UserPoolClient(
            self, "UserPoolClient",
            user_pool=self.user_pool,
            user_pool_client_name=f"{self.naming_prefix}-client",
            generate_secret=False,  # Required for web applications
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True,
                admin_user_password=True
            ),
            oauth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(
                    authorization_code_grant=True
                ),
                scopes=[
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE
                ],
                callback_urls=[
                    f"https://{self.naming_prefix}-web.vercel.app/api/auth/callback/cognito",
                    "http://localhost:3000/api/auth/callback/cognito"
                ]
            )
        )

        # API Gateway
        self.api_gateway = apigateway.RestApi(
            self, "ApiGateway",
            rest_api_name=f"{self.naming_prefix}-api",
            description="GovBiz.ai Multi-Agent API",
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=["*"],
                allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allow_headers=["Content-Type", "Authorization"]
            )
        )

        # API Gateway integration with Lambda
        lambda_integration = apigateway.LambdaIntegration(
            self.api_lambda,
            request_templates={"application/json": '{"statusCode": "200"}'}
        )

        # API Gateway resources
        self.api_gateway.root.add_method("ANY", lambda_integration)
        
        proxy_resource = self.api_gateway.root.add_resource("{proxy+}")
        proxy_resource.add_method("ANY", lambda_integration)

    def create_email_layer(self):
        """Create SES configuration for email capabilities"""
        
        # SES Configuration Set
        self.ses_configuration_set = ses.ConfigurationSet(
            self, "SesConfigurationSet",
            configuration_set_name=f"{self.naming_prefix}-email-config"
        )

        # Note: Domain verification must be done manually in AWS console
        # or through separate CDK stack for production use

    def create_monitoring_layer(self):
        """Create CloudWatch alarms and SNS topics for monitoring"""
        
        # SNS topic for error notifications
        self.error_notification_topic = sns.Topic(
            self, "ErrorNotificationTopic",
            topic_name=f"{self.naming_prefix}-error-notifications",
            display_name="GovBiz.ai Error Notifications"
        )

        # Email subscription for error notifications (replace with actual email)
        self.error_notification_topic.add_subscription(
            subscriptions.EmailSubscription("admin@govbiz.ai")
        )

        # CloudWatch alarms for each Lambda function
        self.create_lambda_alarms()

    def create_lambda_alarms(self):
        """Create CloudWatch alarms for Lambda functions"""
        
        lambdas = [
            ("OpportunityFinder", self.opportunity_finder_lambda),
            ("Analyzer", self.analyzer_lambda),
            ("ResponseGenerator", self.response_generator_lambda),
            ("RelationshipManager", self.relationship_manager_lambda),
            ("EmailManager", self.email_manager_lambda),
            ("HumanLoop", self.human_loop_lambda),
            ("Api", self.api_lambda)
        ]

        for name, lambda_function in lambdas:
            # Error alarm
            cloudwatch.Alarm(
                self, f"{name}ErrorAlarm",
                alarm_name=f"{self.naming_prefix}-{name.lower()}-errors",
                alarm_description=f"Alert when {name} function has errors",
                metric=lambda_function.metric_errors(),
                threshold=1,
                evaluation_periods=2,
                period=Duration.minutes(5),
                statistic="Sum"
            ).add_alarm_action(
                cloudwatch.AlarmAction(
                    sns.TopicActionArn(self.error_notification_topic.topic_arn)
                )
            )

            # Duration alarm
            cloudwatch.Alarm(
                self, f"{name}DurationAlarm",
                alarm_name=f"{self.naming_prefix}-{name.lower()}-duration",
                alarm_description=f"Alert when {name} function exceeds duration threshold",
                metric=lambda_function.metric_duration(),
                threshold=Duration.minutes(10).to_milliseconds(),
                evaluation_periods=2,
                period=Duration.minutes(5),
                statistic="Average"
            ).add_alarm_action(
                cloudwatch.AlarmAction(
                    sns.TopicActionArn(self.error_notification_topic.topic_arn)
                )
            )

        # DynamoDB throttling alarms
        self.create_dynamodb_alarms()

    def create_dynamodb_alarms(self):
        """Create CloudWatch alarms for DynamoDB tables"""
        
        tables = [
            ("Opportunities", self.opportunities_table),
            ("Companies", self.companies_table),
            ("Responses", self.responses_table),
            ("Contacts", self.contacts_table),
            ("Events", self.events_table),
            ("Approvals", self.approvals_table)
        ]

        for name, table in tables:
            # User errors alarm
            cloudwatch.Alarm(
                self, f"{name}TableUserErrorsAlarm",
                alarm_name=f"{self.naming_prefix}-{name.lower()}-table-user-errors",
                alarm_description=f"Alert when {name} table has user errors",
                metric=table.metric_user_errors(),
                threshold=1,
                evaluation_periods=2,
                period=Duration.minutes(5),
                statistic="Sum"
            ).add_alarm_action(
                cloudwatch.AlarmAction(
                    sns.TopicActionArn(self.error_notification_topic.topic_arn)
                )
            )

        # Add outputs for key resources
        self.add_outputs()

    def add_outputs(self):
        """Add CloudFormation outputs for key resources"""
        
        CfnOutput(
            self, "ApiGatewayUrl",
            value=self.api_gateway.url,
            description="API Gateway URL"
        )

        CfnOutput(
            self, "UserPoolId",
            value=self.user_pool.user_pool_id,
            description="Cognito User Pool ID"
        )

        CfnOutput(
            self, "UserPoolClientId",
            value=self.user_pool_client.user_pool_client_id,
            description="Cognito User Pool Client ID"
        )

        CfnOutput(
            self, "SecretsArn",
            value=self.api_keys_secret.secret_arn,
            description="API Keys Secret ARN"
        )

        CfnOutput(
            self, "OpportunitiesTableName",
            value=self.opportunities_table.table_name,
            description="Opportunities DynamoDB Table Name"
        )

        CfnOutput(
            self, "SearchIndicesBucketName",
            value=self.search_indices_bucket.bucket_name,
            description="Search Indices S3 Bucket Name"
        )


# CDK App
app = cdk.App()

# Deploy to dev environment
GovBizAiStack(
    app, 
    "GovBizAiDevStack",
    env=Environment(
        account=app.account,
        region=app.region
    ),
    description="GovBiz.ai Multi-Agent Government Contracting Platform - Development Environment"
)

app.synth()