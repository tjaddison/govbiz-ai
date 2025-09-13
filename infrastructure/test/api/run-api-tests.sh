#!/bin/bash

# GovBizAI API Test Runner Script
# This script runs comprehensive API tests for Phase 10 implementation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
API_BASE_URL=""
WEBSOCKET_URL=""
AWS_REGION="us-east-1"
STACK_NAME="InfrastructureStack"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -a, --api-url URL          API Gateway base URL"
    echo "  -w, --websocket-url URL    WebSocket API URL"
    echo "  -r, --region REGION        AWS region (default: us-east-1)"
    echo "  -s, --stack-name NAME      CloudFormation stack name (default: InfrastructureStack)"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --api-url https://abc123.execute-api.us-east-1.amazonaws.com/prod"
    echo "  $0 --auto-discover         Automatically discover URLs from CloudFormation"
    echo ""
}

# Function to auto-discover API URLs from CloudFormation
auto_discover_urls() {
    print_status "Auto-discovering API URLs from CloudFormation stack: $STACK_NAME"

    # Get REST API URL
    REST_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='RestApiUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")

    # Get WebSocket API URL
    WEBSOCKET_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='WebSocketApiUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")

    if [ -n "$REST_API_URL" ]; then
        API_BASE_URL="$REST_API_URL"
        print_success "Discovered REST API URL: $API_BASE_URL"
    else
        print_error "Could not discover REST API URL from CloudFormation stack"
        return 1
    fi

    if [ -n "$WEBSOCKET_API_URL" ]; then
        WEBSOCKET_URL="$WEBSOCKET_API_URL"
        print_success "Discovered WebSocket API URL: $WEBSOCKET_URL"
    else
        print_warning "Could not discover WebSocket API URL from CloudFormation stack"
    fi

    return 0
}

# Function to validate prerequisites
validate_prerequisites() {
    print_status "Validating prerequisites..."

    # Check if Python is available
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is required but not installed"
        return 1
    fi

    # Check if pip is available
    if ! command -v pip3 &> /dev/null; then
        print_error "pip3 is required but not installed"
        return 1
    fi

    # Check if AWS CLI is available (for auto-discovery)
    if ! command -v aws &> /dev/null; then
        print_warning "AWS CLI not found. Auto-discovery will not work."
    fi

    # Check if required Python packages are installed
    python3 -c "import requests, websocket" 2>/dev/null || {
        print_status "Installing required Python packages..."
        pip3 install requests websocket-client
    }

    print_success "Prerequisites validated"
    return 0
}

# Function to run the API tests
run_api_tests() {
    print_status "Starting API test suite..."
    print_status "API Base URL: $API_BASE_URL"
    if [ -n "$WEBSOCKET_URL" ]; then
        print_status "WebSocket URL: $WEBSOCKET_URL"
    fi

    # Create results directory if it doesn't exist
    mkdir -p "$SCRIPT_DIR/results"

    # Run the Python test suite
    cd "$SCRIPT_DIR"

    if [ -n "$WEBSOCKET_URL" ]; then
        python3 api-test-suite.py "$API_BASE_URL" "$WEBSOCKET_URL"
    else
        python3 api-test-suite.py "$API_BASE_URL"
    fi

    TEST_EXIT_CODE=$?

    # Move results to results directory
    mv api_test_results_*.json results/ 2>/dev/null || true

    return $TEST_EXIT_CODE
}

# Function to generate test report
generate_report() {
    print_status "Generating test report..."

    # Find the latest results file
    LATEST_RESULT=$(ls -t "$SCRIPT_DIR/results/api_test_results_"*.json | head -n 1 2>/dev/null || echo "")

    if [ -z "$LATEST_RESULT" ]; then
        print_warning "No test results found"
        return 1
    fi

    # Extract summary from JSON results
    TOTAL_TESTS=$(python3 -c "import json; data=json.load(open('$LATEST_RESULT')); print(data['summary']['total_tests'])")
    PASSED_TESTS=$(python3 -c "import json; data=json.load(open('$LATEST_RESULT')); print(data['summary']['passed_tests'])")
    FAILED_TESTS=$(python3 -c "import json; data=json.load(open('$LATEST_RESULT')); print(data['summary']['failed_tests'])")
    SUCCESS_RATE=$(python3 -c "import json; data=json.load(open('$LATEST_RESULT')); print(data['summary']['success_rate_percent'])")

    echo ""
    echo "============================================================================"
    echo "                         GOVBIZAI API TEST RESULTS"
    echo "============================================================================"
    echo "Test Date: $(date)"
    echo "API URL: $API_BASE_URL"
    echo "WebSocket URL: ${WEBSOCKET_URL:-N/A}"
    echo ""
    echo "SUMMARY:"
    echo "  Total Tests: $TOTAL_TESTS"
    echo "  Passed: $PASSED_TESTS"
    echo "  Failed: $FAILED_TESTS"
    echo "  Success Rate: $SUCCESS_RATE%"
    echo ""
    echo "Detailed results: $LATEST_RESULT"
    echo "============================================================================"

    # Generate HTML report if possible
    if command -v python3 &> /dev/null; then
        cat > "$SCRIPT_DIR/generate_html_report.py" << 'EOF'
import json
import sys
from datetime import datetime

def generate_html_report(json_file):
    with open(json_file, 'r') as f:
        data = json.load(f)

    html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>GovBizAI API Test Results</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }}
        .summary {{ background: #ecf0f1; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .suite {{ margin: 20px 0; border: 1px solid #bdc3c7; border-radius: 5px; }}
        .suite-header {{ background: #34495e; color: white; padding: 10px; }}
        .test {{ padding: 10px; border-bottom: 1px solid #ecf0f1; }}
        .test.passed {{ background: #d5f4e6; }}
        .test.failed {{ background: #ffeaa7; }}
        .recommendations {{ background: #74b9ff; color: white; padding: 15px; margin: 20px 0; border-radius: 5px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>GovBizAI API Test Results</h1>
        <p>Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>

    <div class="summary">
        <h2>Test Summary</h2>
        <p><strong>Total Tests:</strong> {data['summary']['total_tests']}</p>
        <p><strong>Passed:</strong> {data['summary']['passed_tests']}</p>
        <p><strong>Failed:</strong> {data['summary']['failed_tests']}</p>
        <p><strong>Success Rate:</strong> {data['summary']['success_rate_percent']}%</p>
        <p><strong>Total Duration:</strong> {data['summary']['total_duration_ms']:.1f}ms</p>
    </div>
"""

    for suite_name, suite_data in data['suite_results'].items():
        status_color = '#27ae60' if suite_data['status'] == 'PASSED' else '#e74c3c'
        html += f"""
    <div class="suite">
        <div class="suite-header" style="background: {status_color};">
            <h3>{suite_name.replace('_', ' ').title()} - {suite_data['status']}</h3>
        </div>
"""

        for test in suite_data.get('tests', []):
            test_class = 'passed' if test['passed'] else 'failed'
            html += f"""
        <div class="test {test_class}">
            <strong>{test['name']}</strong>: {test['message']}
            <span style="float: right;">({test['duration_ms']:.1f}ms)</span>
        </div>
"""

        html += "    </div>"

    if data.get('recommendations'):
        html += """
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
"""
        for rec in data['recommendations']:
            html += f"            <li>{rec}</li>"

        html += """
        </ul>
    </div>
"""

    html += """
</body>
</html>
"""

    return html

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 generate_html_report.py <json_file>")
        sys.exit(1)

    html_content = generate_html_report(sys.argv[1])
    html_file = sys.argv[1].replace('.json', '.html')

    with open(html_file, 'w') as f:
        f.write(html_content)

    print(f"HTML report generated: {html_file}")
EOF

        python3 "$SCRIPT_DIR/generate_html_report.py" "$LATEST_RESULT"
        rm "$SCRIPT_DIR/generate_html_report.py"
    fi

    return 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--api-url)
            API_BASE_URL="$2"
            shift 2
            ;;
        -w|--websocket-url)
            WEBSOCKET_URL="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -s|--stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --auto-discover)
            AUTO_DISCOVER=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution flow
main() {
    print_status "Starting GovBizAI API Test Suite"

    # Validate prerequisites
    if ! validate_prerequisites; then
        print_error "Prerequisites validation failed"
        exit 1
    fi

    # Auto-discover URLs if requested or if no URL provided
    if [ "$AUTO_DISCOVER" = true ] || [ -z "$API_BASE_URL" ]; then
        if ! auto_discover_urls; then
            print_error "Failed to auto-discover API URLs"
            if [ -z "$API_BASE_URL" ]; then
                print_error "No API URL provided and auto-discovery failed"
                show_usage
                exit 1
            fi
        fi
    fi

    # Validate that we have at least the API base URL
    if [ -z "$API_BASE_URL" ]; then
        print_error "API base URL is required"
        show_usage
        exit 1
    fi

    # Run the API tests
    if run_api_tests; then
        print_success "API tests completed successfully"
        generate_report
        exit 0
    else
        print_error "API tests failed"
        generate_report
        exit 1
    fi
}

# Run main function
main "$@"