#!/usr/bin/env python3
"""
Fix documents stuck in uploading status by updating them to uploaded
"""

import boto3
from decimal import Decimal

def fix_document_statuses():
    """Update all documents stuck in uploading status to uploaded"""

    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        companies_table = dynamodb.Table('govbizai-companies')

        company_id = "e4d8f458-b031-70ed-aee1-f318f0290017"

        # Get the company record
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            print(f"❌ Company {company_id} not found")
            return False

        item = response['Item']
        documents = item.get('documents', [])

        print(f"Found {len(documents)} documents")

        # Update all documents in uploading status to uploaded
        updated_documents = []
        uploaded_count = 0

        for doc in documents:
            if doc.get('status') == 'uploading':
                print(f"  Updating document: {doc.get('filename')} ({doc.get('document_id')})")
                doc['status'] = 'uploaded'
                uploaded_count += 1
            updated_documents.append(doc)

        if uploaded_count > 0:
            # Update the company record with fixed documents
            companies_table.update_item(
                Key={'company_id': company_id},
                UpdateExpression="SET documents = :documents, updated_at = :updated_at",
                ExpressionAttributeValues={
                    ':documents': updated_documents,
                    ':updated_at': '2025-09-18T02:58:00.000Z'
                }
            )

            print(f"✅ Updated {uploaded_count} documents from 'uploading' to 'uploaded' status")
            return True
        else:
            print("ℹ️ No documents needed status updates")
            return True

    except Exception as e:
        print(f"❌ Error fixing document statuses: {e}")
        return False

def verify_fix():
    """Verify that the fix worked"""

    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        companies_table = dynamodb.Table('govbizai-companies')

        company_id = "e4d8f458-b031-70ed-aee1-f318f0290017"

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            print(f"❌ Company {company_id} not found")
            return False

        documents = response['Item'].get('documents', [])

        uploaded_count = sum(1 for doc in documents if doc.get('status') == 'uploaded')
        uploading_count = sum(1 for doc in documents if doc.get('status') == 'uploading')

        print(f"📊 Document Status Summary:")
        print(f"  - Total documents: {len(documents)}")
        print(f"  - Uploaded: {uploaded_count}")
        print(f"  - Still uploading: {uploading_count}")

        return uploading_count == 0

    except Exception as e:
        print(f"❌ Error verifying fix: {e}")
        return False

if __name__ == "__main__":
    print("Fixing Document Statuses")
    print("=" * 40)

    print("\n1. Current status before fix:")
    verify_fix()

    print("\n2. Applying fix...")
    if fix_document_statuses():
        print("\n3. Status after fix:")
        verify_fix()
        print("\n✅ All documents should now be visible in the UI!")
        print("   Refresh the documents page to see them.")
    else:
        print("\n❌ Fix failed")