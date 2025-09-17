# Utility Scripts

This folder contains utility scripts for managing and maintaining the GovBiz AI system.

## Scripts

### `backfill_14_days.py`
**Purpose**: Performs a 14-day historical backfill of government contract opportunities from SAM.gov

**Usage**:
```bash
python3 backfill_14_days.py
```

**Features**:
- Processes opportunities for the last 14 days (excluding current day)
- Uses the existing CSV processor Lambda function via API calls
- Provides detailed progress logging and summary statistics
- Saves results to `/tmp/backfill_results.json`
- Includes error handling and retry logic

**Dependencies**: boto3, AWS CLI configured

---

### `clear_dynamodb.py`
**Purpose**: Clears all data from DynamoDB tables for testing/development

**Usage**:
```bash
python3 clear_dynamodb.py
```

**Features**:
- Scans and deletes all items from govbizai DynamoDB tables
- Handles complex key schemas (hash + range keys)
- Provides progress logging and item count tracking
- Safe error handling for missing tables

**Dependencies**: boto3, AWS CLI configured

⚠️ **Warning**: This script deletes ALL data. Use only in development/testing environments.

---

### `setup_bedrock_kb.py`
**Purpose**: Sets up and configures Amazon Bedrock Knowledge Bases for semantic search

**Usage**:
```bash
python3 setup_bedrock_kb.py
```

**Features**:
- Creates knowledge base for opportunity embeddings
- Configures S3 data source connections
- Sets up vector search capabilities
- Handles OpenSearch Serverless configuration
- Provides comprehensive error handling and status reporting

**Dependencies**: boto3, AWS CLI configured

**Requirements**:
- S3 buckets with embeddings data
- Proper IAM permissions for Bedrock
- OpenSearch Serverless permissions

---

## Common Requirements

All scripts require:
- Python 3.8+
- boto3 library (`pip install boto3`)
- AWS CLI configured with appropriate credentials
- Proper IAM permissions for the resources being accessed

## Directory Structure

```
scripts/utilities/
├── README.md
├── backfill_14_days.py
├── clear_dynamodb.py
└── setup_bedrock_kb.py
```

## Usage Notes

- Run scripts from the project root directory for best results
- Check AWS credentials and permissions before running
- Review script output for any errors or warnings
- Some scripts may take several minutes to complete for large datasets

## Support

For issues or questions about these utilities, refer to the main project documentation or contact the development team.