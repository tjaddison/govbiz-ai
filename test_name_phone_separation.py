#!/usr/bin/env python3
"""
Test the name and phone separation logic
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simple_sam_downloader import SimpleSAMDownloader

def test_name_phone_separation():
    """Test that names and phone numbers are properly separated"""
    
    downloader = SimpleSAMDownloader()
    
    test_cases = [
        {
            "name": "Concatenated name and phone",
            "input_name": "JENNY WALLACE614-816-4111",
            "input_phone": "",
            "expected_name": "JENNY WALLACE",
            "expected_phone": "614-816-4111"
        },
        {
            "name": "Name with phone in parentheses format",
            "input_name": "JOHN SMITH(555) 123-4567",
            "input_phone": "",
            "expected_name": "JOHN SMITH",
            "expected_phone": "(555) 123-4567"
        },
        {
            "name": "Name with phone using dots",
            "input_name": "MARY JONES555.987.6543",
            "input_phone": "",
            "expected_name": "MARY JONES",
            "expected_phone": "555.987.6543"
        },
        {
            "name": "Name with 10-digit phone no separators",
            "input_name": "BOB BROWN5551234567",
            "input_phone": "",
            "expected_name": "BOB BROWN",
            "expected_phone": "5551234567"
        },
        {
            "name": "Name only - no phone concatenated",
            "input_name": "ALICE COOPER",
            "input_phone": "",
            "expected_name": "ALICE COOPER",
            "expected_phone": ""
        },
        {
            "name": "Separate name and phone fields both provided",
            "input_name": "DAVID WILLIAMS",
            "input_phone": "555-555-5555",
            "expected_name": "DAVID WILLIAMS",
            "expected_phone": "555-555-5555"
        },
        {
            "name": "Concatenated name but phone field already has value",
            "input_name": "SARAH JOHNSON614-816-4111",
            "input_phone": "555-999-8888",
            "expected_name": "SARAH JOHNSON",
            "expected_phone": "555-999-8888"  # Should keep existing phone field
        },
        {
            "name": "Empty name field",
            "input_name": "",
            "input_phone": "555-123-4567",
            "expected_name": "",
            "expected_phone": "555-123-4567"
        }
    ]
    
    print("Testing name and phone separation logic...")
    print("=" * 70)
    
    all_passed = True
    
    for test_case in test_cases:
        print(f"\nTest: {test_case['name']}")
        print(f"Input Name: '{test_case['input_name']}'")
        print(f"Input Phone: '{test_case['input_phone']}'")
        
        # Test the separation function
        actual_name, actual_phone = downloader._separate_name_and_phone(
            test_case['input_name'],
            test_case['input_phone']
        )
        
        print(f"Expected Name: '{test_case['expected_name']}'")
        print(f"Actual Name: '{actual_name}'")
        print(f"Expected Phone: '{test_case['expected_phone']}'")
        print(f"Actual Phone: '{actual_phone}'")
        
        if actual_name == test_case['expected_name'] and actual_phone == test_case['expected_phone']:
            print("✅ PASSED")
        else:
            print("❌ FAILED")
            all_passed = False
    
    print("\n" + "=" * 70)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print("Name and phone separation logic is working correctly!")
    else:
        print("❌ SOME TESTS FAILED")
        print("Name and phone separation logic needs fixing!")
    
    return all_passed

if __name__ == "__main__":
    success = test_name_phone_separation()
    sys.exit(0 if success else 1)