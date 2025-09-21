#!/usr/bin/env python3
"""
Test script to upload a document and verify it processes with new libraries
"""
import boto3
import json
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import time

def create_test_pdf():
    """Create a simple test PDF"""
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 750, "Test Document for PyMuPDF Processing")
    p.drawString(100, 720, "This document should be processed with PyMuPDF 1.24.13")
    p.drawString(100, 690, "Company: Test Company Inc.")
    p.drawString(100, 660, "Capability: Software Development Services")
    p.drawString(100, 630, "NAICS Code: 541511")
    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer.getvalue()

def upload_to_s3_and_process():
    """Upload test PDF to S3 and trigger processing"""
    s3_client = boto3.client('s3')

    # Create test PDF
    pdf_content = create_test_pdf()

    # Upload to S3
    bucket_name = "govbizai-raw-documents-927576824761-us-east-1"
    key = "company-docs/test-company/test-document-for-pymupdf.pdf"

    print(f"Uploading test PDF to s3://{bucket_name}/{key}")
    s3_client.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=pdf_content,
        ContentType='application/pdf'
    )

    print("✓ PDF uploaded successfully")
    print(f"File size: {len(pdf_content)} bytes")

    # This should trigger the document processing Lambda automatically via S3 event
    print("Document processing should be triggered automatically via S3 event")
    print("Check CloudWatch logs for processing results")

    return bucket_name, key

if __name__ == "__main__":
    try:
        bucket, key = upload_to_s3_and_process()
        print(f"\nTest file uploaded: s3://{bucket}/{key}")
        print("Monitor CloudWatch logs for:")
        print("- /aws/lambda/govbizai-document-processing")
        print("- /aws/lambda/govbizai-text-extraction")
        print("\nLook for PyMuPDF processing success messages")
    except Exception as e:
        print(f"Error: {e}")