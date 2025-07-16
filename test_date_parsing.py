#!/usr/bin/env python3
"""
Test date parsing functionality
"""

import re
from datetime import datetime, timezone

def test_date_parsing():
    """Test various date formats"""
    
    def parse_date(date_str: str):
        """Parse date string into datetime object"""
        if not date_str or date_str.strip() == '':
            return None
        
        date_str = date_str.strip()
        
        # Try ISO format with timezone first (most common in SAM data)
        try:
            # Handle ISO format with timezone offset
            if 'T' in date_str and ('+' in date_str or date_str.count('-') >= 3):
                # This handles formats like: 2025-03-27T18:10:00-08:00
                # Replace timezone offset format for Python parsing
                # Convert -08:00 to -0800 format
                tz_pattern = r'([+-])(\d{2}):(\d{2})$'
                if re.search(tz_pattern, date_str):
                    date_str = re.sub(tz_pattern, r'\1\2\3', date_str)
                
                # Try parsing with timezone
                parsed = datetime.strptime(date_str, '%Y-%m-%dT%H:%M:%S%z')
                # Convert to UTC
                return parsed.astimezone(timezone.utc)
        except ValueError:
            pass
        
        # Common date formats in SAM data (fallback)
        date_formats = [
            '%Y-%m-%d',
            '%m/%d/%Y',
            '%m-%d-%Y',
            '%Y/%m/%d',
            '%m/%d/%y',
            '%Y-%m-%d %H:%M:%S',
            '%m/%d/%Y %H:%M:%S',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S%z',
            '%m/%d/%Y %H:%M:%S%z'
        ]
        
        for fmt in date_formats:
            try:
                parsed = datetime.strptime(date_str, fmt)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                else:
                    # Convert timezone-aware datetime to UTC
                    parsed = parsed.astimezone(timezone.utc)
                return parsed
            except ValueError:
                continue
        
        # Try parsing with more flexible approach for edge cases
        try:
            # Handle dates with timezone info like "2018-11-06 11:25:12-05"
            # Check if it has timezone info without colon
            tz_pattern = r'([+-])(\d{2})$'
            if re.search(tz_pattern, date_str):
                date_str = re.sub(tz_pattern, r'\1\2:00', date_str)
                parsed = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S%z')
                return parsed.astimezone(timezone.utc)
        except ValueError:
            pass
        
        # If all else fails, silently return None to avoid log spam
        return None
    
    # Test cases
    test_dates = [
        "2025-03-27T18:10:00-08:00",
        "2018-11-06 11:25:12-05",
        "2018-11-15T14:00:00-05:00",
        "2025-01-01",
        "01/15/2025",
        "2025-01-15 10:30:00",
        "2025-01-15T10:30:00",
        "",
        None
    ]
    
    print("Testing date parsing:")
    print("=" * 50)
    
    for test_date in test_dates:
        try:
            result = parse_date(test_date)
            if result:
                print(f"✓ '{test_date}' -> {result} (UTC)")
            else:
                print(f"✗ '{test_date}' -> Failed to parse")
        except Exception as e:
            print(f"✗ '{test_date}' -> Error: {e}")
    
    print("\nAll tests completed!")

if __name__ == "__main__":
    test_date_parsing()