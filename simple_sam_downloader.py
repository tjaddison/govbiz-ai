#!/usr/bin/env python3
"""
Simple SAM CSV downloader that directly downloads and processes SAM data
without the complex agent system to avoid circular import issues.
"""

import asyncio
import csv
import io
import json
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Any, Optional

import aiohttp
import boto3
from botocore.exceptions import ClientError


class SimpleSAMDownloader:
    """Simple SAM CSV downloader and processor"""
    
    def __init__(self):
        self.csv_url = "https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv"
        self.region = "us-east-1"
        self.table_name = "govbiz-ai-dev-opportunities"
        self.batch_size = 1000
        
        # Initialize DynamoDB
        self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
        self.opportunities_table = self.dynamodb.Table(self.table_name)
        
        print(f"Initialized SAM downloader with:")
        print(f"  - CSV URL: {self.csv_url}")
        print(f"  - DynamoDB table: {self.table_name}")
        print(f"  - Batch size: {self.batch_size}")
    
    async def download_csv(self) -> str:
        """Download the CSV file from SAM.gov"""
        print(f"Downloading CSV from {self.csv_url}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.csv_url) as response:
                    if response.status == 200:
                        # Get raw bytes first
                        content_bytes = await response.read()
                        print(f"Downloaded CSV file: {len(content_bytes)} bytes")
                        
                        # Try different encodings to handle special characters
                        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
                        
                        for encoding in encodings:
                            try:
                                content = content_bytes.decode(encoding)
                                print(f"Successfully decoded with {encoding} encoding")
                                return content
                            except UnicodeDecodeError:
                                print(f"Failed to decode with {encoding}, trying next encoding...")
                                continue
                        
                        # If all encodings fail, use utf-8 with error handling
                        print("All encodings failed, using utf-8 with error replacement")
                        content = content_bytes.decode('utf-8', errors='replace')
                        return content
                    else:
                        raise Exception(f"Failed to download CSV: HTTP {response.status}")
        except Exception as e:
            print(f"Error downloading CSV: {e}")
            raise
    
    def parse_csv_content(self, csv_content: str) -> List[Dict[str, Any]]:
        """Parse CSV content into structured data"""
        print("Parsing CSV content...")
        
        opportunities = []
        errors = 0
        
        try:
            # Clean up any problematic characters that might cause CSV parsing issues
            csv_content_cleaned = csv_content.replace('\x00', '')  # Remove null bytes
            
            csv_reader = csv.DictReader(io.StringIO(csv_content_cleaned))
            
            for row_num, row in enumerate(csv_reader, 1):
                try:
                    opportunity = self._transform_csv_row(row)
                    if opportunity:
                        opportunities.append(opportunity)
                    
                    if row_num % 10000 == 0:
                        print(f"Processed {row_num} rows...")
                        
                except Exception as e:
                    errors += 1
                    if errors <= 10:  # Only log first 10 errors to avoid spam
                        print(f"Error processing row {row_num}: {e}")
                    continue
            
            print(f"Parsed {len(opportunities)} opportunities from {row_num} rows")
            if errors > 0:
                print(f"Encountered {errors} errors during parsing")
                
        except Exception as e:
            print(f"Error parsing CSV content: {e}")
            # Try to process with a more robust approach
            opportunities = self._parse_csv_robust(csv_content)
            
        return opportunities
    
    def _parse_csv_robust(self, csv_content: str) -> List[Dict[str, Any]]:
        """Robust CSV parsing with more error handling"""
        print("Using robust CSV parsing...")
        
        opportunities = []
        errors = 0
        
        try:
            # Split into lines and process manually if needed
            lines = csv_content.split('\n')
            print(f"Processing {len(lines)} lines manually...")
            
            if len(lines) > 0:
                # Get header
                header_line = lines[0]
                headers = [h.strip('"') for h in header_line.split(',')]
                
                # Process data lines
                for line_num, line in enumerate(lines[1:], 2):
                    try:
                        if line.strip():
                            # Simple CSV parsing - might not be perfect but more robust
                            values = line.split(',')
                            if len(values) >= len(headers):
                                row = dict(zip(headers, values))
                                opportunity = self._transform_csv_row(row)
                                if opportunity:
                                    opportunities.append(opportunity)
                    except Exception as e:
                        errors += 1
                        if errors <= 10:
                            print(f"Error processing line {line_num}: {e}")
                        continue
                        
            print(f"Robust parsing completed: {len(opportunities)} opportunities, {errors} errors")
            
        except Exception as e:
            print(f"Robust parsing also failed: {e}")
            
        return opportunities
    
    def _transform_csv_row(self, row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """Transform a CSV row into our opportunity data model"""
        
        # Helper function to safely get and clean string values
        def safe_get(key: str, default: str = '', allow_empty: bool = True) -> str:
            value = row.get(key, default)
            if value is None:
                return default if allow_empty else None
            cleaned = str(value).strip().strip('"')
            # For indexed fields, return None for empty strings to avoid DynamoDB issues
            # For non-indexed fields, return empty string
            if not cleaned:
                return default if allow_empty else None
            return cleaned
        
        notice_id = safe_get('NoticeId')
        if not notice_id:
            return None
        
        # Parse dates
        posted_date = self._parse_date(safe_get('PostedDate'))
        archive_date = self._parse_date(safe_get('ArchiveDate'))
        response_deadline = self._parse_date(safe_get('ResponseDeadLine'))
        
        # Determine status and active flag
        current_date = datetime.now(timezone.utc)
        csv_active = safe_get('Active', default='no').lower() == 'yes'
        
        if archive_date and current_date >= archive_date:
            status = "archived"
            active = False  # Set to false if archive date has passed
        elif response_deadline and current_date > response_deadline:
            status = "expired"
            active = csv_active  # Keep CSV active status for expired items
        elif csv_active:
            status = "active"
            active = True
        else:
            status = "inactive"
            active = False
        
        # Extract NAICS codes
        naics_codes = []
        naics_raw = safe_get('NaicsCode')
        if naics_raw:
            naics_codes = [code.strip() for code in naics_raw.split(';') if code.strip()]
        
        # Parse award amount
        award_amount = self._parse_currency(safe_get('Award$'))
        
        # Separate name and phone if they're concatenated
        contact_name, contact_phone = self._separate_name_and_phone(
            safe_get('PrimaryContactFullname'),
            safe_get('PrimaryContactPhone')
        )
        
        # Build the opportunity object
        opportunity = {
            'id': notice_id,
            'notice_id': notice_id,
            'title': safe_get('Title'),
            'agency': safe_get('Department/Ind.Agency', default='UNKNOWN', allow_empty=False),  # Indexed field
            'office': safe_get('Office'),
            'posted_date': posted_date.isoformat() if posted_date else None,
            'archive_date': archive_date.isoformat() if archive_date else None,
            'response_deadline': response_deadline.isoformat() if response_deadline else None,
            'notice_type': safe_get('Type'),
            'set_aside': safe_get('SetASide'),
            'naics_codes': naics_codes,
            'description': safe_get('Description'),
            'primary_contact': {
                'name': contact_name,
                'email': safe_get('PrimaryContactEmail'),
                'phone': contact_phone
            },
            'award_amount': award_amount,
            'status': status,
            'active': active,
            'processed_at': datetime.now(timezone.utc).isoformat(),
            'source': 'sam_csv_simple'
        }
        
        # Remove any fields with None values that might cause DynamoDB issues
        opportunity = {k: v for k, v in opportunity.items() if v is not None}
        
        return opportunity
    
    def _parse_date(self, date_str: str) -> Optional[datetime]:
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
    
    def _parse_currency(self, amount_str: str) -> Optional[Decimal]:
        """Parse currency string into Decimal (required for DynamoDB)"""
        if not amount_str or amount_str.strip() == '':
            return None
        
        # Remove common currency symbols and formatting
        cleaned = amount_str.strip().replace('$', '').replace(',', '').replace(' ', '')
        
        # Handle empty string after cleaning
        if not cleaned:
            return None
        
        try:
            # Handle common decimal issues
            if cleaned.count('.') > 1:
                # Multiple decimal points - take the first part
                cleaned = cleaned.split('.')[0] + '.' + cleaned.split('.')[1]
            
            return Decimal(cleaned)
        except (ValueError, TypeError, Exception):
            # Return None for any invalid currency values to avoid errors
            return None
    
    def _separate_name_and_phone(self, name_field: str, phone_field: str) -> tuple[str, str]:
        """Separate name and phone when they're concatenated in the name field"""
        if not name_field:
            return '', phone_field or ''
        
        name_field = name_field.strip()
        phone_field = (phone_field or '').strip()
        
        # Enhanced phone number pattern that matches various formats:
        # - 614-816-4111, (614) 816-4111, 614.816.4111
        # - 6148164111 (10 digits)
        # - With spaces: "Alex Bonner 717-604-4237"
        # - Extensions: (210) 617-5300 x246260
        phone_patterns = [
            r'(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s*x\d+)?)',  # Standard phone with optional extension
            r'(\d{10})',  # 10 digits no separators
        ]
        
        # Try each pattern
        for pattern in phone_patterns:
            # Look for phone number anywhere in the name field
            match = re.search(pattern, name_field)
            
            if match:
                phone_number = match.group(1)
                # Remove the phone number from the name
                clean_name = name_field[:match.start()].strip()
                
                # Also remove any trailing text after the phone number
                remaining_text = name_field[match.end():].strip()
                if remaining_text and not clean_name:
                    # Phone was at the beginning, keep the remaining text as name
                    clean_name = remaining_text
                
                # If we don't already have a phone number, use the extracted one
                if not phone_field:
                    phone_field = phone_number
                
                return clean_name, phone_field
        
        # No phone number found in name field, return as-is
        return name_field, phone_field
    
    async def process_opportunities_batch(self, opportunities: List[Dict[str, Any]]) -> Dict[str, int]:
        """Process a batch of opportunities and update DynamoDB"""
        stats = {
            'inserted': 0,
            'updated': 0,
            'errors': 0
        }
        
        for opportunity in opportunities:
            try:
                # Check if opportunity already exists
                existing_item = await self._get_existing_opportunity(opportunity['id'])
                
                if existing_item:
                    # Update existing opportunity
                    updated = await self._update_opportunity(opportunity, existing_item)
                    if updated:
                        stats['updated'] += 1
                else:
                    # Insert new opportunity
                    await self._insert_opportunity(opportunity)
                    stats['inserted'] += 1
                    
            except Exception as e:
                print(f"Error processing opportunity {opportunity.get('id', 'unknown')}: {e}")
                stats['errors'] += 1
                continue
        
        return stats
    
    async def _get_existing_opportunity(self, opportunity_id: str) -> Optional[Dict[str, Any]]:
        """Get existing opportunity from DynamoDB"""
        try:
            response = self.opportunities_table.get_item(Key={'id': opportunity_id})
            return response.get('Item')
        except ClientError as e:
            print(f"Error getting opportunity {opportunity_id}: {e}")
            return None
    
    async def _insert_opportunity(self, opportunity: Dict[str, Any]) -> None:
        """Insert new opportunity into DynamoDB"""
        opportunity['created_at'] = datetime.now(timezone.utc).isoformat()
        opportunity['updated_at'] = opportunity['created_at']
        
        try:
            self.opportunities_table.put_item(Item=opportunity)
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == 'ValidationException':
                print(f"Validation error for opportunity {opportunity.get('id', 'unknown')}: {e}")
                # Try to identify the problematic field
                self._debug_opportunity_data(opportunity)
            else:
                print(f"DynamoDB error inserting opportunity {opportunity.get('id', 'unknown')}: {e}")
            raise
    
    async def _update_opportunity(self, new_data: Dict[str, Any], existing_data: Dict[str, Any]) -> bool:
        """Update existing opportunity if there are changes"""
        
        # Check if there are meaningful changes
        fields_to_compare = [
            'title', 'status', 'response_deadline', 'archive_date', 'description',
            'primary_contact', 'award_amount', 'active'
        ]
        
        has_changes = False
        for field in fields_to_compare:
            if new_data.get(field) != existing_data.get(field):
                has_changes = True
                break
        
        if not has_changes:
            return False
        
        # Update the opportunity
        new_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        new_data['created_at'] = existing_data.get('created_at', new_data['updated_at'])
        
        try:
            self.opportunities_table.put_item(Item=new_data)
            return True
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == 'ValidationException':
                print(f"Validation error updating opportunity {new_data.get('id', 'unknown')}: {e}")
                self._debug_opportunity_data(new_data)
            else:
                print(f"DynamoDB error updating opportunity {new_data.get('id', 'unknown')}: {e}")
            raise
    
    def _debug_opportunity_data(self, opportunity: Dict[str, Any]) -> None:
        """Debug opportunity data to identify problematic fields"""
        print(f"Debugging opportunity data for ID: {opportunity.get('id', 'unknown')}")
        
        for key, value in opportunity.items():
            if value == '':
                print(f"  Empty string found in field: {key}")
            elif value is None:
                print(f"  None value found in field: {key}")
            elif isinstance(value, str) and len(value) == 0:
                print(f"  Zero-length string found in field: {key}")
            elif isinstance(value, dict):
                for subkey, subvalue in value.items():
                    if subvalue == '':
                        print(f"  Empty string found in nested field: {key}.{subkey}")
    
    async def process_csv_file(self) -> Dict[str, Any]:
        """Main method to download and process the CSV file"""
        print("Starting CSV processing...")
        
        start_time = datetime.now()
        total_stats = {
            'inserted': 0,
            'updated': 0,
            'errors': 0,
            'total_processed': 0
        }
        
        try:
            # Download CSV
            csv_content = await self.download_csv()
            
            # Parse CSV
            opportunities = self.parse_csv_content(csv_content)
            total_stats['total_processed'] = len(opportunities)
            
            # Process in batches
            batch_count = 0
            for i in range(0, len(opportunities), self.batch_size):
                batch = opportunities[i:i + self.batch_size]
                batch_count += 1
                
                print(f"Processing batch {batch_count}: {len(batch)} opportunities")
                
                batch_stats = await self.process_opportunities_batch(batch)
                
                # Aggregate stats
                total_stats['inserted'] += batch_stats['inserted']
                total_stats['updated'] += batch_stats['updated']
                total_stats['errors'] += batch_stats['errors']
                
                # Add small delay to avoid overwhelming DynamoDB
                await asyncio.sleep(0.1)
            
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()
            
            print(f"CSV processing complete in {processing_time:.2f} seconds")
            print(f"Stats: {total_stats}")
            
            total_stats['processing_time_seconds'] = processing_time
            total_stats['start_time'] = start_time.isoformat()
            total_stats['end_time'] = end_time.isoformat()
            
            return total_stats
            
        except Exception as e:
            print(f"Error in CSV processing: {e}")
            raise


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Simple Lambda handler for SAM CSV processing
    """
    start_time = datetime.now(timezone.utc)
    
    try:
        # Initialize downloader
        downloader = SimpleSAMDownloader()
        
        # Process CSV file
        result = asyncio.run(downloader.process_csv_file())
        
        # Calculate execution time
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "data": result,
                "message": f"Processed {result.get('total_processed', 0)} opportunities successfully",
                "execution_time": execution_time
            })
        }
        
    except Exception as e:
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "error": str(e),
                "message": "SAM CSV processing failed",
                "execution_time": execution_time
            })
        }


if __name__ == "__main__":
    # Run the downloader directly
    downloader = SimpleSAMDownloader()
    result = asyncio.run(downloader.process_csv_file())
    print(f"Final result: {result}")