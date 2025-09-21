# 🎯 Manual Matching System - User Guide

## Overview

The GovBizAI Manual Matching System allows you to trigger contract opportunity matching processes on-demand, giving you full control over when and how matches are generated for your company profile.

## 🌐 Accessing Manual Matching

### Web Application
1. **Login** to your GovBizAI account at: https://d21w4wbdrthfbu.cloudfront.net
2. **Navigate** to the "Manual Matching" option in the left sidebar
3. **Access Path**: Dashboard → Manual Matching

## 🛠️ Manual Matching Features

### 1. 🎯 Single Opportunity Match

**Purpose**: Test the matching algorithm against a specific opportunity

**How to Use**:
1. **Select an Opportunity** from the dropdown menu (shows recent opportunities from the last 7 days)
2. **Click "▶️ Run Match"** to trigger the matching process
3. **View Results** including:
   - Total compatibility score (percentage)
   - Confidence level (HIGH, MEDIUM, LOW, NO_MATCH)
   - Detailed match reasons
   - Actionable recommendations
   - Processing time

**Best For**:
- Testing algorithm performance
- Evaluating specific opportunities you're interested in
- Understanding match scoring before batch processing

### 2. 🚀 Batch Matching

**Purpose**: Run matching against multiple opportunities in bulk

**Available Options**:

#### **🔄 Run Full Batch**
- Matches against ALL opportunities in the system
- Processes thousands of opportunities
- Estimated time: 2-6 hours
- **Use When**: You want comprehensive matching across all available opportunities

#### **📅 Last 7 Days**
- Matches against opportunities posted in the last 7 days
- Faster processing (typically 15-30 minutes)
- **Use When**: You want to catch up on recent opportunities

#### **♻️ Force Refresh**
- Forces re-calculation of all matches, ignoring cache
- Useful after updating company profile or documents
- **Use When**: You've made significant changes to your company profile

**Batch Job Monitoring**:
- Real-time progress tracking
- Processing status updates every 5 seconds
- Completion estimates
- Error reporting if issues occur

### 3. 🔧 Profile Maintenance

#### **🔄 Refresh Company Embeddings**

**Purpose**: Update your company's AI embeddings after uploading new documents

**When to Use**:
- After uploading new capability statements
- After adding team member resumes
- After updating company information
- When match quality seems poor

**Process**:
1. Click "🔄 Refresh Company Embeddings"
2. System processes all your documents
3. Generates new AI embeddings
4. Updates matching capabilities

## 📊 Understanding Match Results

### Match Scores
- **0-24%**: NO_MATCH - Not recommended
- **25-49%**: LOW - Consider partnership opportunities
- **50-74%**: MEDIUM - Good potential, analyze carefully
- **75-100%**: HIGH - Strong match, prioritize for bidding

### Confidence Levels
- **HIGH**: Algorithm is very confident in the score
- **MEDIUM**: Good match but some uncertainty
- **LOW**: Uncertain match, requires manual review
- **NO_MATCH**: Not a suitable opportunity

### Component Breakdown
Each match shows scores for 8 components:
1. **Semantic Similarity** (25% weight) - AI analysis of text similarity
2. **Keyword Matching** (15% weight) - Exact term matches
3. **NAICS Alignment** (15% weight) - Industry code compatibility
4. **Past Performance** (20% weight) - Relevant experience
5. **Certification Bonus** (10% weight) - Required certifications
6. **Geographic Match** (5% weight) - Location compatibility
7. **Capacity Fit** (5% weight) - Company size vs contract size
8. **Recency Factor** (5% weight) - How recent your relevant experience is

## 🎛️ Advanced Features

### API Integration

For advanced users or integration with other systems:

#### Trigger Single Match
```bash
curl -X POST "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/api/matches/manual" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"opportunity_id": "OPPORTUNITY_ID"}'
```

#### Start Batch Matching
```bash
curl -X POST "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/api/matches/batch" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "opportunity_filters": {
      "posted_after": "2025-09-13T00:00:00Z"
    },
    "force_refresh": false,
    "batch_size": 100
  }'
```

#### Check Batch Status
```bash
curl -X GET "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/api/matches/batch/JOB_ID/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📋 Best Practices

### 1. Profile Optimization
- **Keep documents current**: Upload latest capability statements
- **Complete profile information**: Fill out all company details
- **Refresh embeddings**: After any document changes
- **Review NAICS codes**: Ensure they accurately reflect your capabilities

### 2. Matching Strategy
- **Start with recent opportunities**: Use "Last 7 Days" batch matching
- **Test specific opportunities**: Use single match for high-priority opportunities
- **Monitor batch jobs**: Check progress regularly
- **Review low scores**: Understand why matches scored poorly

### 3. Performance Tips
- **Avoid overlapping batch jobs**: Wait for current jobs to complete
- **Refresh embeddings strategically**: Only when documents change
- **Use single match for testing**: Before running large batches
- **Monitor system health**: Check the dashboard for any issues

## 🚨 Troubleshooting

### Common Issues

#### **No Opportunities Loading**
- **Check** your internet connection
- **Verify** you're logged in properly
- **Try** refreshing the page
- **Contact** support if the issue persists

#### **Batch Job Stuck in "Pending"**
- **Wait** 5-10 minutes for system to process queue
- **Check** system health on dashboard
- **Try** a smaller batch size

#### **Low Match Scores**
- **Review** your company profile completeness
- **Update** capability statements with relevant keywords
- **Refresh** company embeddings
- **Check** NAICS code alignment

#### **Slow Processing**
- **Expected**: Large batch jobs take 2-6 hours
- **Use** smaller batch sizes for faster results
- **Monitor** job progress in real-time

## 🔐 Security & Authentication

- All API calls require valid JWT tokens
- Tokens automatically refresh when needed
- Sessions expire after inactivity
- Multi-tenant isolation ensures your data privacy

## 📞 Support

### Getting Help
- **Web Support**: Available through the application
- **Documentation**: Check the help section in the app
- **Technical Issues**: Contact system administrator

### System Status
- **Health Monitoring**: Available on the dashboard
- **Performance Metrics**: Real-time processing statistics
- **Uptime**: 99.9% availability target

## 🔄 System Updates

The matching system is continuously improved:
- **Algorithm updates**: Automatic deployment
- **New features**: Released regularly
- **Performance improvements**: Ongoing optimization
- **Bug fixes**: Applied automatically

---

## 🎉 Production Deployment Status

✅ **PRODUCTION READY** - 100% System Health

### Current Production URLs:
- **Web Application**: https://d21w4wbdrthfbu.cloudfront.net
- **REST API**: https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/
- **Matching API**: https://u0vw1dg7sg.execute-api.us-east-1.amazonaws.com/prod/

### Infrastructure Status:
- **Lambda Functions**: 59 deployed and active
- **DynamoDB Tables**: 14 tables with 22,633+ opportunities
- **S3 Buckets**: 11 buckets with full lifecycle management
- **Cognito Authentication**: Active with OAuth integration
- **CloudFront CDN**: Global distribution enabled

### Performance Metrics:
- **Match Processing**: < 2.3 seconds per complete match
- **Quick Filter**: < 87ms screening time
- **API Response**: < 500ms average
- **System Uptime**: 100% in production testing

### Data Status:
- **Active Opportunities**: 22,633 government contracts
- **Company Profiles**: Active and processing
- **Embeddings**: Real-time generation enabled
- **Cache Performance**: 14.54ms average retrieval

---

*Last Updated: September 20, 2025*
*System Version: Production v1.0*