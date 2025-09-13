# Testing Directory

This directory contains temporary testing scripts and validation tools for the GovBizAI system.

## Test Scripts

### `test_embedding.py`
**Purpose**: Validates Phase 4 - Embedding Generation and Vector Storage functionality

**Features**:
- Tests embedding generation for opportunities and companies
- Validates semantic search capabilities
- Tests hybrid search functionality combining semantic and keyword approaches
- Comprehensive error handling and result validation

**Usage**:
```bash
cd /Users/terrance/Projects/govbiz-ai/testing
python3 test_embedding.py
```

**Requirements**:
- AWS credentials configured
- Phase 4 infrastructure deployed
- boto3 library installed

## Directory Structure

```
testing/
├── README.md                   # This file
├── test_embedding.py          # Phase 4 validation script
└── [future test scripts]      # Additional testing scripts as needed
```

## Guidelines

- All temporary testing code should be placed in this directory
- Each test script should have clear documentation of its purpose
- Test scripts should include proper error handling
- Use descriptive filenames (e.g., `test_[phase/component]_[functionality].py`)
- Clean up test data after running scripts when applicable

## Note

This directory is for development and validation purposes only. Production code should be organized in the appropriate directories (`infrastructure/`, `lambda/`, etc.).