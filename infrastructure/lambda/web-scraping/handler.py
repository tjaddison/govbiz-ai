import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime
import requests
from urllib.parse import urljoin, urlparse
import re
from bs4 import BeautifulSoup
import time
import uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']
PROCESSING_QUEUE_URL = os.environ.get('PROCESSING_QUEUE_URL')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Scrape company websites for content to enhance profiles
    Triggered by API calls or SQS messages
    """
    try:
        # Handle different event sources
        if 'Records' in event:
            # SQS message
            for record in event['Records']:
                if record.get('eventSource') == 'aws:sqs':
                    body = json.loads(record['body'])
                    process_scraping_request(body)
        else:
            # Direct invoke or API Gateway
            body = json.loads(event.get('body', '{}')) if event.get('body') else event
            process_scraping_request(body)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': 'Scraping completed successfully'})
        }

    except Exception as e:
        logger.error(f"Web scraping error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Scraping failed: {str(e)}'})
        }

def process_scraping_request(request_data: Dict[str, Any]):
    """Process web scraping request"""
    try:
        company_id = request_data.get('company_id')
        website_url = request_data.get('website_url')

        if not company_id or not website_url:
            logger.error(f"Missing required fields: company_id={company_id}, website_url={website_url}")
            return

        logger.info(f"Starting web scraping for company {company_id}, URL: {website_url}")

        # Validate and normalize URL
        normalized_url = normalize_url(website_url)
        if not normalized_url:
            logger.error(f"Invalid URL: {website_url}")
            return

        # Check robots.txt compliance
        if not check_robots_txt(normalized_url):
            logger.warning(f"Robots.txt disallows scraping for {normalized_url}")
            return

        # Scrape website content
        scraped_content = scrape_website_content(normalized_url)

        if not scraped_content:
            logger.warning(f"No content extracted from {normalized_url}")
            return

        # Process and store scraped content
        store_scraped_content(company_id, normalized_url, scraped_content)

        # Generate embeddings for scraped content
        generate_scraped_content_embeddings(company_id, scraped_content)

        # Update company profile with scraping status
        update_scraping_status(company_id, 'completed', f"Successfully scraped {len(scraped_content)} pages")

        # Trigger profile re-embedding after scraping
        trigger_profile_reembedding(company_id)

        logger.info(f"Successfully completed scraping for company {company_id}")

    except Exception as e:
        logger.error(f"Error processing scraping request: {str(e)}")
        if 'company_id' in locals():
            update_scraping_status(company_id, 'failed', str(e))

def normalize_url(url: str) -> str:
    """Normalize and validate URL"""
    try:
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        parsed = urlparse(url)
        if not parsed.netloc:
            return None

        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    except Exception as e:
        logger.error(f"Error normalizing URL {url}: {str(e)}")
        return None

def check_robots_txt(base_url: str) -> bool:
    """Check robots.txt for scraping permissions"""
    try:
        robots_url = urljoin(base_url, '/robots.txt')
        response = requests.get(robots_url, timeout=10)

        if response.status_code == 200:
            robots_content = response.text.lower()

            # Simple robots.txt parsing (in production, use robotparser)
            if 'disallow: /' in robots_content:
                # Check if there's a specific user-agent rule
                if 'user-agent: *' in robots_content:
                    return False

        return True  # Allow scraping by default

    except Exception as e:
        logger.warning(f"Error checking robots.txt for {base_url}: {str(e)}")
        return True  # Allow scraping if robots.txt check fails

def scrape_website_content(base_url: str) -> List[Dict[str, Any]]:
    """Scrape website content with rate limiting and respectful crawling"""
    try:
        scraped_pages = []
        visited_urls = set()
        urls_to_visit = [base_url]

        # Limit number of pages to scrape (cost control)
        max_pages = 10
        pages_scraped = 0

        headers = {
            'User-Agent': 'GovBizAI-Bot/1.0 (Contract Opportunity Matching System; compliance@govbizai.com)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }

        session = requests.Session()
        session.headers.update(headers)

        while urls_to_visit and pages_scraped < max_pages:
            url = urls_to_visit.pop(0)

            if url in visited_urls:
                continue

            visited_urls.add(url)

            try:
                # Rate limiting - be respectful
                time.sleep(1)

                response = session.get(url, timeout=15, allow_redirects=True)
                response.raise_for_status()

                # Parse HTML content
                soup = BeautifulSoup(response.content, 'html.parser')

                # Extract meaningful content
                page_content = extract_page_content(soup, url)

                if page_content and len(page_content['text'].strip()) > 100:
                    scraped_pages.append(page_content)
                    pages_scraped += 1

                    logger.info(f"Scraped page: {url} ({len(page_content['text'])} characters)")

                    # Find additional URLs to crawl (same domain only)
                    if pages_scraped < max_pages:
                        additional_urls = find_relevant_links(soup, base_url, visited_urls)
                        urls_to_visit.extend(additional_urls[:3])  # Limit new URLs per page

            except requests.RequestException as e:
                logger.warning(f"Error scraping {url}: {str(e)}")
                continue
            except Exception as e:
                logger.warning(f"Error processing {url}: {str(e)}")
                continue

        return scraped_pages

    except Exception as e:
        logger.error(f"Error scraping website {base_url}: {str(e)}")
        return []

def extract_page_content(soup: BeautifulSoup, url: str) -> Dict[str, Any]:
    """Extract meaningful content from HTML page"""
    try:
        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            element.decompose()

        # Extract title
        title = soup.find('title')
        title_text = title.get_text().strip() if title else ''

        # Extract meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        description = meta_desc.get('content', '').strip() if meta_desc else ''

        # Extract main content areas
        content_selectors = [
            'main',
            '[role="main"]',
            '.content',
            '.main-content',
            '#content',
            '#main',
            'article',
            '.about',
            '.services',
            '.capabilities',
            '.company'
        ]

        extracted_text = []

        # Try to find main content area
        main_content = None
        for selector in content_selectors:
            main_content = soup.select_one(selector)
            if main_content:
                break

        if main_content:
            extracted_text.append(main_content.get_text())
        else:
            # Fallback to body content
            body = soup.find('body')
            if body:
                extracted_text.append(body.get_text())

        # Clean and normalize text
        full_text = ' '.join(extracted_text)
        cleaned_text = clean_web_text(full_text)

        return {
            'url': url,
            'title': title_text,
            'description': description,
            'text': cleaned_text,
            'scraped_at': datetime.utcnow().isoformat() + 'Z'
        }

    except Exception as e:
        logger.error(f"Error extracting content from {url}: {str(e)}")
        return None

def clean_web_text(text: str) -> str:
    """Clean and normalize web-scraped text"""
    if not text:
        return ""

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)

    # Remove common web artifacts
    text = re.sub(r'Cookie Policy.*?(?=\s|$)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Privacy Policy.*?(?=\s|$)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Terms of Service.*?(?=\s|$)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Copyright.*?(?=\s|$)', '', text, flags=re.IGNORECASE)

    # Remove email addresses and phone numbers from content (privacy)
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
    text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE]', text)

    # Remove excessive punctuation
    text = re.sub(r'[^\w\s\.\,\;\:\!\?\-\(\)]', '', text)

    return text.strip()

def find_relevant_links(soup: BeautifulSoup, base_url: str, visited_urls: set) -> List[str]:
    """Find relevant internal links to crawl"""
    try:
        base_domain = urlparse(base_url).netloc
        relevant_links = []

        # Look for links that might contain useful company information
        relevant_keywords = ['about', 'services', 'capabilities', 'company', 'team', 'history', 'mission']

        for link in soup.find_all('a', href=True):
            href = link['href']
            full_url = urljoin(base_url, href)
            parsed_url = urlparse(full_url)

            # Only crawl same domain
            if parsed_url.netloc != base_domain:
                continue

            # Skip already visited URLs
            if full_url in visited_urls:
                continue

            # Check if URL contains relevant keywords
            url_text = (href + ' ' + link.get_text()).lower()
            if any(keyword in url_text for keyword in relevant_keywords):
                relevant_links.append(full_url)

        return relevant_links[:5]  # Limit number of links per page

    except Exception as e:
        logger.error(f"Error finding relevant links: {str(e)}")
        return []

def store_scraped_content(company_id: str, website_url: str, scraped_content: List[Dict[str, Any]]):
    """Store scraped content in S3"""
    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        scrape_id = str(uuid.uuid4())

        # Store aggregated content
        aggregated_content = {
            'scrape_id': scrape_id,
            'company_id': company_id,
            'website_url': website_url,
            'scraped_at': datetime.utcnow().isoformat() + 'Z',
            'pages_scraped': len(scraped_content),
            'pages': scraped_content
        }

        s3_key = f"{company_id}/scraped/{timestamp}_{scrape_id}.json"

        s3_client.put_object(
            Bucket=DOCUMENTS_BUCKET,
            Key=s3_key,
            Body=json.dumps(aggregated_content, indent=2),
            ContentType='application/json'
        )

        logger.info(f"Stored scraped content for company {company_id} at {s3_key}")

    except Exception as e:
        logger.error(f"Error storing scraped content: {str(e)}")
        raise

def generate_scraped_content_embeddings(company_id: str, scraped_content: List[Dict[str, Any]]):
    """Generate embeddings for scraped website content"""
    try:
        # Combine all scraped text
        combined_text = ""
        for page in scraped_content:
            if page.get('title'):
                combined_text += f"Title: {page['title']}\n"
            if page.get('description'):
                combined_text += f"Description: {page['description']}\n"
            if page.get('text'):
                combined_text += f"Content: {page['text']}\n\n"

        if not combined_text.strip():
            logger.warning(f"No text content to embed for company {company_id}")
            return

        # Generate embedding for aggregated content
        embedding_response = bedrock_client.invoke_model(
            modelId='amazon.titan-embed-text-v2:0',
            body=json.dumps({
                'inputText': combined_text[:8000],  # Limit input size
                'dimensions': 1024
            })
        )

        embedding_result = json.loads(embedding_response['body'].read())
        embedding_vector = embedding_result['embedding']

        # Store website embedding
        embedding_id = f"{company_id}_website_{int(datetime.utcnow().timestamp())}"
        embedding_key = f"{company_id}/embeddings/website/{embedding_id}.json"

        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'website_content',
            'pages_count': len(scraped_content),
            'text_preview': combined_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        s3_client.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=embedding_key,
            Body=json.dumps(embedding_data),
            ContentType='application/json'
        )

        logger.info(f"Generated website embedding {embedding_id} for company {company_id}")

    except Exception as e:
        logger.error(f"Error generating scraped content embeddings: {str(e)}")
        raise

def update_scraping_status(company_id: str, status: str, message: str):
    """Update company profile with scraping status"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE)

        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression="SET website_scraping_status = :status, website_scraping_message = :message, website_scraped_at = :scraped_at, updated_at = :updated_at",
            ExpressionAttributeValues={
                ':status': status,
                ':message': message,
                ':scraped_at': datetime.utcnow().isoformat() + 'Z',
                ':updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

        logger.info(f"Updated scraping status for company {company_id}: {status}")

    except Exception as e:
        logger.error(f"Error updating scraping status: {str(e)}")

def trigger_profile_reembedding(company_id: str):
    """Trigger company profile re-embedding after web scraping"""
    try:
        profile_embedding_queue_url = os.environ.get('PROFILE_EMBEDDING_QUEUE_URL')
        if profile_embedding_queue_url:
            sqs.send_message(
                QueueUrl=profile_embedding_queue_url,
                MessageBody=json.dumps({
                    'action': 'reembed_profile',
                    'company_id': company_id,
                    'timestamp': datetime.utcnow().isoformat() + 'Z'
                })
            )
            logger.info(f"Triggered profile re-embedding for company: {company_id}")
        else:
            logger.warning("PROFILE_EMBEDDING_QUEUE_URL not configured")
    except Exception as e:
        logger.warning(f"Failed to trigger profile re-embedding: {str(e)}")

def get_cors_headers() -> Dict[str, str]:
    """Get CORS headers for API responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }