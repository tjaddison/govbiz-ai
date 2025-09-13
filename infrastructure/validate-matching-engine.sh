#!/bin/bash

# Phase 7 Matching Engine Validation Script
# Tests all matching engine components individually and as a system

set -e

echo "🚀 Starting Phase 7 Matching Engine Validation"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=9

# Function to run test and check result
run_test() {
    local function_name=$1
    local test_file=$2
    local test_name=$3
    local expected_keys=$4

    echo -e "\n🧪 Testing: ${YELLOW}$test_name${NC}"

    # Check if function exists
    if ! aws lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
        echo -e "❌ ${RED}FAILED${NC}: Function $function_name not found"
        ((TESTS_FAILED++))
        return 1
    fi

    # Check function state
    local state=$(aws lambda get-function --function-name "$function_name" --query "Configuration.State" --output text)
    if [ "$state" != "Active" ]; then
        echo -e "⏳ ${YELLOW}PENDING${NC}: Function $function_name is in state: $state"
        return 2
    fi

    # Invoke function
    local response_file="${function_name}-response.json"
    if aws lambda invoke \
        --function-name "$function_name" \
        --cli-binary-format raw-in-base64-out \
        --payload "file://$test_file" \
        "$response_file" >/dev/null 2>&1; then

        # Check if response contains expected structure
        if [ -n "$expected_keys" ]; then
            for key in $expected_keys; do
                if ! jq -e ".$key" "$response_file" >/dev/null 2>&1; then
                    echo -e "❌ ${RED}FAILED${NC}: Missing key '$key' in response"
                    ((TESTS_FAILED++))
                    return 1
                fi
            done
        fi

        echo -e "✅ ${GREEN}PASSED${NC}: $test_name"
        ((TESTS_PASSED++))

        # Show sample response
        echo "   Response preview:"
        jq '.' "$response_file" | head -10 | sed 's/^/   /'

    else
        echo -e "❌ ${RED}FAILED${NC}: Function invocation failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Semantic Similarity Calculator
run_test "govbizai-semantic-similarity" \
         "test-semantic-similarity.json" \
         "Semantic Similarity Calculator" \
         ""

# Test 2: Keyword Matching Algorithm
run_test "govbizai-keyword-matching" \
         "test-keyword-matching.json" \
         "Keyword Matching Algorithm" \
         ""

# Test 3: NAICS Code Alignment Scorer
run_test "govbizai-naics-alignment" \
         "test-naics-alignment.json" \
         "NAICS Code Alignment Scorer" \
         ""

# Test 4: Past Performance Analyzer
run_test "govbizai-past-performance" \
         "test-past-performance.json" \
         "Past Performance Analyzer" \
         ""

# Test 5: Certification Bonus Calculator
run_test "govbizai-certification-bonus" \
         "test-certification-bonus.json" \
         "Certification Bonus Calculator" \
         ""

# Test 6: Geographic Match Calculator
run_test "govbizai-geographic-match" \
         "test-geographic-match.json" \
         "Geographic Match Calculator" \
         ""

# Test 7: Capacity Fit Calculator
run_test "govbizai-capacity-fit" \
         "test-capacity-fit.json" \
         "Capacity Fit Calculator" \
         ""

# Test 8: Recency Factor Calculator
run_test "govbizai-recency-factor" \
         "test-recency-factor.json" \
         "Recency Factor Calculator" \
         ""

# Test 9: Quick Filter System
run_test "govbizai-quick-filter" \
         "test-quick-filter.json" \
         "Quick Filter System" \
         ""

# Summary
echo -e "\n📊 Test Results Summary"
echo "======================"
echo -e "✅ Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "❌ Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "📊 Total Tests: $TOTAL_TESTS"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}ALL TESTS PASSED!${NC} Phase 7 deployment is successful."
    exit 0
else
    echo -e "\n⚠️  ${YELLOW}Some tests failed or are pending.${NC} Check the output above."
    exit 1
fi