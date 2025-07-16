#!/usr/bin/env python3
"""
Test the archive date logic to ensure active is set to false when archive date has passed
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simple_sam_downloader import SimpleSAMDownloader
from datetime import datetime, timezone, timedelta

def test_archive_date_logic():
    """Test that active is set to false when archive date has passed"""
    
    downloader = SimpleSAMDownloader()
    
    # Create test data with different scenarios
    current_time = datetime.now(timezone.utc)
    
    test_cases = [
        {
            "name": "Active opportunity - future archive date",
            "data": {
                "NoticeId": "test123",
                "Active": "Yes",
                "ArchiveDate": (current_time + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "ResponseDeadLine": (current_time + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Department/Ind.Agency": "TEST AGENCY",
                "Title": "Test Opportunity",
                "Type": "Sources Sought",
                "SetASide": "",
                "Description": "Test description",
                "PrimaryContactFullname": "John Doe",
                "PrimaryContactEmail": "john@test.gov",
                "PrimaryContactPhone": "555-1234",
                "PostedDate": current_time.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Office": "Test Office",
                "NaicsCode": "123456",
                "Award$": "1000000"
            },
            "expected_active": True,
            "expected_status": "active"
        },
        {
            "name": "Archived opportunity - past archive date",
            "data": {
                "NoticeId": "test456",
                "Active": "Yes",  # Even though CSV says Yes, should be False due to archive date
                "ArchiveDate": (current_time - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "ResponseDeadLine": (current_time - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Department/Ind.Agency": "TEST AGENCY",
                "Title": "Archived Opportunity",
                "Type": "Sources Sought",
                "SetASide": "",
                "Description": "Test description",
                "PrimaryContactFullname": "Jane Doe",
                "PrimaryContactEmail": "jane@test.gov",
                "PrimaryContactPhone": "555-5678",
                "PostedDate": (current_time - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Office": "Test Office",
                "NaicsCode": "123456",
                "Award$": "500000"
            },
            "expected_active": False,
            "expected_status": "archived"
        },
        {
            "name": "Expired opportunity - past response deadline but future archive date",
            "data": {
                "NoticeId": "test789",
                "Active": "Yes",
                "ArchiveDate": (current_time + timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "ResponseDeadLine": (current_time - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Department/Ind.Agency": "TEST AGENCY",
                "Title": "Expired Opportunity",
                "Type": "Sources Sought",
                "SetASide": "",
                "Description": "Test description",
                "PrimaryContactFullname": "Bob Smith",
                "PrimaryContactEmail": "bob@test.gov",
                "PrimaryContactPhone": "555-9999",
                "PostedDate": (current_time - timedelta(days=15)).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "Office": "Test Office",
                "NaicsCode": "123456",
                "Award$": "250000"
            },
            "expected_active": True,  # Should keep CSV active status for expired items
            "expected_status": "expired"
        }
    ]
    
    print("Testing archive date logic...")
    print("=" * 60)
    
    all_passed = True
    
    for test_case in test_cases:
        print(f"\nTest: {test_case['name']}")
        print(f"Archive Date: {test_case['data']['ArchiveDate']}")
        print(f"CSV Active: {test_case['data']['Active']}")
        
        # Transform the test data
        opportunity = downloader._transform_csv_row(test_case['data'])
        
        if opportunity:
            actual_active = opportunity.get('active')
            actual_status = opportunity.get('status')
            
            print(f"Expected Active: {test_case['expected_active']}")
            print(f"Actual Active: {actual_active}")
            print(f"Expected Status: {test_case['expected_status']}")
            print(f"Actual Status: {actual_status}")
            
            if actual_active == test_case['expected_active'] and actual_status == test_case['expected_status']:
                print("✅ PASSED")
            else:
                print("❌ FAILED")
                all_passed = False
        else:
            print("❌ FAILED - No opportunity returned")
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print("Archive date logic is working correctly!")
    else:
        print("❌ SOME TESTS FAILED")
        print("Archive date logic needs fixing!")
    
    return all_passed

if __name__ == "__main__":
    success = test_archive_date_logic()
    sys.exit(0 if success else 1)