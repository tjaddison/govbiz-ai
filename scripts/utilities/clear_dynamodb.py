#!/usr/bin/env python3

import boto3

def clear_table(table_name):
    """Clear all items from a DynamoDB table"""
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)

    # Get the table's key schema
    key_names = [key['AttributeName'] for key in table.key_schema]

    # Scan all items
    response = table.scan()
    items = response['Items']

    # Continue scanning if there are more items
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])

    # Delete each item
    deleted_count = 0
    for item in items:
        # Create key from the item
        key = {k: item[k] for k in key_names}
        table.delete_item(Key=key)
        deleted_count += 1
        print(f"Deleted item with key: {key}")

    print(f"Total items deleted from {table_name}: {deleted_count}")

if __name__ == "__main__":
    # Clear all govbizai tables that might have data
    tables_to_clear = [
        'govbizai-vector-index',
        'govbizai-companies',
        'govbizai-opportunities',
        'govbizai-matches',
        'govbizai-feedback',
        'govbizai-match-cache',
        'govbizai-audit-log',
        'govbizai-progress-tracking'
    ]

    for table_name in tables_to_clear:
        try:
            print(f"\nClearing table: {table_name}")
            clear_table(table_name)
        except Exception as e:
            print(f"Error clearing {table_name}: {e}")