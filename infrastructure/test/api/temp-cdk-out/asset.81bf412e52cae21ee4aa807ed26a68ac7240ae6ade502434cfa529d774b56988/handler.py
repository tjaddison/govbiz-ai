"""
Website Scraper for Company Profile Enhancement
Scrapes company websites with robots.txt compliance and intelligent content extraction.
"""

import json
import boto3
import logging
import os
import re
import time
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
import hashlib

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
eventbridge_client = boto3.client('events')

# Environment variables
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']
AUDIT_LOG_TABLE_NAME = os.environ['AUDIT_LOG_TABLE_NAME']

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE_NAME)

# Scraping configuration
USER_AGENT = 'GovBizAI-Bot/1.0 (Business Intelligence; +https://govbizai.com/robot)'
REQUEST_TIMEOUT = 30
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB
RATE_LIMIT_DELAY = 2  # seconds between requests
MAX_PAGES_PER_DOMAIN = 10
MAX_DEPTH = 3

# Content extraction patterns
CONTENT_SELECTORS = [
    'main', 'article', '.content', '#content', '.main-content',
    '.page-content', '.entry-content', '#main', '.container'
]

# Skip these content types
SKIP_CONTENT_TYPES = [
    'image/', 'video/', 'audio/', 'application/pdf',
    'application/zip', 'application/octet-stream'
]

# Important page patterns for companies
IMPORTANT_PAGES = [
    r'about', r'company', r'services', r'products', r'capabilities',
    r'team', r'leadership', r'history', r'mission', r'vision',
    r'contact', r'careers', r'news', r'press'
]


class RobotsChecker:
    """Handles robots.txt compliance checking."""

    def __init__(self):
        self.robots_cache = {}
        self.cache_ttl = 3600  # 1 hour

    def can_fetch(self, url: str, user_agent: str = USER_AGENT) -> bool:
        """Check if we can fetch a URL according to robots.txt."""
        try:
            parsed_url = urlparse(url)
            base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
            robots_url = urljoin(base_url, '/robots.txt')

            # Check cache first
            cache_key = f"{base_url}_{user_agent}"
            if cache_key in self.robots_cache:
                cache_entry = self.robots_cache[cache_key]
                if time.time() - cache_entry['timestamp'] < self.cache_ttl:
                    rp = cache_entry['parser']
                    return rp.can_fetch(user_agent, url)

            # Fetch and parse robots.txt
            rp = RobotFileParser()
            rp.set_url(robots_url)

            try:
                rp.read()
                self.robots_cache[cache_key] = {
                    'parser': rp,
                    'timestamp': time.time()
                }
                return rp.can_fetch(user_agent, url)
            except Exception as e:
                logger.warning(f"Could not fetch robots.txt for {base_url}: {str(e)}")
                # If we can't fetch robots.txt, assume we can fetch (be conservative)
                return True

        except Exception as e:
            logger.error(f"Error checking robots.txt for {url}: {str(e)}")
            return True


class ContentExtractor:
    """Extracts and cleans content from web pages."""

    def __init__(self):
        # Import BeautifulSoup here to handle missing dependency gracefully
        try:
            from bs4 import BeautifulSoup
            self.BeautifulSoup = BeautifulSoup
        except ImportError:
            logger.warning("BeautifulSoup not available - using basic text extraction")
            self.BeautifulSoup = None

    def extract_content(self, html: str, url: str) -> Dict[str, Any]:
        """Extract structured content from HTML."""
        if not self.BeautifulSoup:
            return self.extract_basic_content(html)

        try:
            soup = self.BeautifulSoup(html, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()

            # Extract metadata
            metadata = self.extract_metadata(soup)

            # Find main content area
            content_element = self.find_main_content(soup)

            if content_element:
                # Extract text content
                text_content = content_element.get_text(separator=' ', strip=True)

                # Extract structured elements
                headings = [h.get_text(strip=True) for h in content_element.find_all(['h1', 'h2', 'h3'])]
                paragraphs = [p.get_text(strip=True) for p in content_element.find_all('p') if len(p.get_text(strip=True)) > 20]
                lists = [li.get_text(strip=True) for li in content_element.find_all('li')]

                # Extract contact information
                contact_info = self.extract_contact_info(content_element)

                # Clean and process text
                cleaned_text = self.clean_text(text_content)

                return {
                    'title': metadata.get('title', ''),
                    'description': metadata.get('description', ''),
                    'keywords': metadata.get('keywords', []),
                    'text_content': cleaned_text,
                    'headings': headings,
                    'paragraphs': paragraphs[:10],  # Limit paragraphs
                    'lists': lists[:20],  # Limit list items
                    'contact_info': contact_info,
                    'word_count': len(cleaned_text.split()),
                    'url': url,
                    'extraction_method': 'advanced'
                }
            else:
                # Fallback to body text
                text_content = soup.get_text(separator=' ', strip=True)
                cleaned_text = self.clean_text(text_content)

                return {
                    'title': metadata.get('title', ''),
                    'description': metadata.get('description', ''),
                    'keywords': metadata.get('keywords', []),
                    'text_content': cleaned_text,
                    'headings': [],
                    'paragraphs': [],
                    'lists': [],
                    'contact_info': {},
                    'word_count': len(cleaned_text.split()),
                    'url': url,
                    'extraction_method': 'fallback'
                }

        except Exception as e:
            logger.error(f"Error extracting content from {url}: {str(e)}")
            return self.extract_basic_content(html)

    def extract_basic_content(self, html: str) -> Dict[str, Any]:
        """Basic content extraction without BeautifulSoup."""
        # Remove HTML tags
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)

        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        # Extract title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        title = title_match.group(1) if title_match else ''

        return {
            'title': title,
            'description': '',
            'keywords': [],
            'text_content': text[:10000],  # Limit length
            'headings': [],
            'paragraphs': [],
            'lists': [],
            'contact_info': {},
            'word_count': len(text.split()),
            'url': '',
            'extraction_method': 'basic'
        }

    def extract_metadata(self, soup) -> Dict[str, Any]:
        """Extract metadata from HTML head."""
        metadata = {}

        # Title
        title_tag = soup.find('title')
        if title_tag:
            metadata['title'] = title_tag.get_text(strip=True)

        # Meta description
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        if desc_tag:
            metadata['description'] = desc_tag.get('content', '')

        # Meta keywords
        keywords_tag = soup.find('meta', attrs={'name': 'keywords'})
        if keywords_tag:
            keywords_content = keywords_tag.get('content', '')
            metadata['keywords'] = [kw.strip() for kw in keywords_content.split(',')]

        return metadata

    def find_main_content(self, soup):
        """Find the main content area of the page."""
        # Try semantic HTML5 elements first
        content_element = soup.find('main')
        if content_element:
            return content_element

        content_element = soup.find('article')
        if content_element:
            return content_element

        # Try common content selectors
        for selector in CONTENT_SELECTORS:
            if selector.startswith('.'):
                content_element = soup.find('div', class_=selector[1:])
            elif selector.startswith('#'):
                content_element = soup.find(id=selector[1:])
            else:
                content_element = soup.find(selector)

            if content_element:
                return content_element

        # Fallback to body
        return soup.find('body')

    def extract_contact_info(self, element) -> Dict[str, str]:
        """Extract contact information from content."""
        text = element.get_text()
        contact_info = {}

        # Email
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
        if email_match:
            contact_info['email'] = email_match.group()

        # Phone
        phone_match = re.search(r'(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})', text)
        if phone_match:
            contact_info['phone'] = ''.join(phone_match.groups()[1:])

        # Address (basic pattern)
        address_match = re.search(r'\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}', text)
        if address_match:
            contact_info['address'] = address_match.group()

        return contact_info

    def clean_text(self, text: str) -> str:
        """Clean and normalize text content."""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove common navigation/footer text
        noise_patterns = [
            r'copyright\s+\d{4}.*',
            r'all rights reserved.*',
            r'privacy policy.*',
            r'terms of service.*',
            r'cookie policy.*'
        ]

        for pattern in noise_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

        return text.strip()


class WebsiteScraper:
    """Main website scraping class."""

    def __init__(self):
        self.robots_checker = RobotsChecker()
        self.content_extractor = ContentExtractor()
        self.visited_urls = set()
        self.scraped_content = []

    def scrape_website(self, base_url: str, max_pages: int = MAX_PAGES_PER_DOMAIN) -> Dict[str, Any]:
        """Scrape a website with intelligent page discovery."""
        logger.info(f"Starting website scrape for {base_url}")

        start_time = time.time()
        self.visited_urls.clear()
        self.scraped_content.clear()

        # Normalize base URL
        if not base_url.startswith(('http://', 'https://')):
            base_url = 'https://' + base_url

        parsed_base = urlparse(base_url)
        domain = parsed_base.netloc

        # Start with the homepage
        urls_to_scrape = [base_url]
        scraped_count = 0

        # Find additional important pages
        important_urls = self.discover_important_pages(base_url)
        urls_to_scrape.extend(important_urls[:5])  # Limit additional pages

        for url in urls_to_scrape:
            if scraped_count >= max_pages:
                break

            if url in self.visited_urls:
                continue

            try:
                # Check robots.txt compliance
                if not self.robots_checker.can_fetch(url):
                    logger.info(f"Robots.txt disallows scraping {url}")
                    continue

                # Scrape the page
                page_content = self.scrape_page(url)
                if page_content:
                    self.scraped_content.append(page_content)
                    scraped_count += 1

                self.visited_urls.add(url)

                # Rate limiting
                time.sleep(RATE_LIMIT_DELAY)

            except Exception as e:
                logger.error(f"Error scraping {url}: {str(e)}")
                continue

        # Aggregate content
        aggregated_content = self.aggregate_content()

        scrape_summary = {
            'base_url': base_url,
            'domain': domain,
            'pages_scraped': scraped_count,
            'total_word_count': sum(page.get('word_count', 0) for page in self.scraped_content),
            'scrape_duration': time.time() - start_time,
            'scraped_urls': list(self.visited_urls),
            'content': aggregated_content,
            'extraction_metadata': {
                'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
                'user_agent': USER_AGENT,
                'rate_limit_delay': RATE_LIMIT_DELAY
            }
        }

        logger.info(f"Website scrape completed: {scraped_count} pages, {scrape_summary['total_word_count']} words")
        return scrape_summary

    def discover_important_pages(self, base_url: str) -> List[str]:
        """Discover important pages for the company."""
        important_urls = []

        try:
            # First, try to scrape the homepage to find links
            response = requests.get(base_url, headers={'User-Agent': USER_AGENT}, timeout=REQUEST_TIMEOUT)

            if response.status_code == 200:
                # Extract links that might be important
                if self.content_extractor.BeautifulSoup:
                    soup = self.content_extractor.BeautifulSoup(response.text, 'html.parser')

                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        full_url = urljoin(base_url, href)

                        # Check if this looks like an important page
                        if any(pattern in href.lower() for pattern in IMPORTANT_PAGES):
                            if full_url not in important_urls and len(important_urls) < 10:
                                important_urls.append(full_url)

        except Exception as e:
            logger.warning(f"Could not discover additional pages for {base_url}: {str(e)}")

        return important_urls

    def scrape_page(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape a single page."""
        try:
            logger.debug(f"Scraping page: {url}")

            headers = {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }

            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, stream=True)

            # Check content type
            content_type = response.headers.get('content-type', '').lower()
            if any(skip_type in content_type for skip_type in SKIP_CONTENT_TYPES):
                logger.debug(f"Skipping {url} due to content type: {content_type}")
                return None

            # Check content length
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > MAX_CONTENT_LENGTH:
                logger.warning(f"Skipping {url} due to large content size: {content_length}")
                return None

            if response.status_code == 200:
                # Extract content
                content = self.content_extractor.extract_content(response.text, url)

                # Add page-specific metadata
                content['status_code'] = response.status_code
                content['content_type'] = content_type
                content['scraped_at'] = datetime.now(timezone.utc).isoformat()

                return content
            else:
                logger.warning(f"HTTP {response.status_code} for {url}")
                return None

        except requests.RequestException as e:
            logger.error(f"Request error for {url}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error scraping {url}: {str(e)}")
            return None

    def aggregate_content(self) -> Dict[str, Any]:
        """Aggregate content from all scraped pages."""
        if not self.scraped_content:
            return {}

        # Combine all text content
        all_text = []
        all_headings = []
        all_paragraphs = []
        contact_emails = set()
        contact_phones = set()

        for page in self.scraped_content:
            if page.get('text_content'):
                all_text.append(page['text_content'])

            all_headings.extend(page.get('headings', []))
            all_paragraphs.extend(page.get('paragraphs', []))

            contact_info = page.get('contact_info', {})
            if contact_info.get('email'):
                contact_emails.add(contact_info['email'])
            if contact_info.get('phone'):
                contact_phones.add(contact_info['phone'])

        combined_text = ' '.join(all_text)

        # Extract key information using AI
        ai_analysis = self.analyze_with_ai(combined_text)

        return {
            'combined_text': combined_text[:50000],  # Limit size
            'headings': list(set(all_headings))[:20],
            'key_paragraphs': all_paragraphs[:15],
            'contact_emails': list(contact_emails),
            'contact_phones': list(contact_phones),
            'word_count': len(combined_text.split()),
            'ai_analysis': ai_analysis,
            'pages_analyzed': len(self.scraped_content)
        }

    def analyze_with_ai(self, text: str) -> Dict[str, Any]:
        """Use AI to analyze scraped content."""
        try:
            # Truncate text for AI processing
            max_text_length = 8000
            text_sample = text[:max_text_length] if len(text) > max_text_length else text

            prompt = f"""
Analyze this company website content and extract key information:

1. Company Overview: Name, industry, size, location
2. Services/Products: Main offerings and capabilities
3. Key Differentiators: What makes this company unique
4. Target Markets: Industries or customer segments they serve
5. Key Personnel: Leadership team members mentioned
6. Company Values: Mission, vision, values, culture
7. Notable Clients: Any client names or case studies mentioned
8. Certifications: Any certifications or standards mentioned
9. Geographic Presence: Locations or regions served
10. Keywords: Important industry/business terms

Website Content:
{text_sample}

Return structured JSON with the above categories:
"""

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })

            response = bedrock_client.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=body
            )

            result = json.loads(response['body'].read())
            ai_response = result.get('content', [{}])[0].get('text', '')

            try:
                return json.loads(ai_response)
            except json.JSONDecodeError:
                logger.warning("Could not parse AI analysis response")
                return {}

        except Exception as e:
            logger.error(f"Error in AI website analysis: {str(e)}")
            return {}


def get_user_info(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract user information from the request context."""
    request_context = event.get('requestContext', {})
    authorizer = request_context.get('authorizer', {})
    claims = authorizer.get('claims', {})

    return {
        'user_id': claims.get('sub', 'unknown'),
        'tenant_id': claims.get('custom:tenant_id', 'unknown'),
        'company_id': claims.get('custom:company_id', 'unknown')
    }


def verify_company_access(company_id: str, user_info: Dict[str, str]) -> bool:
    """Verify that the user has access to the company."""
    try:
        if user_info['company_id'] != company_id:
            return False

        response = companies_table.get_item(Key={'company_id': company_id})
        if 'Item' not in response:
            return False

        company = response['Item']
        return company.get('tenant_id') == user_info['tenant_id']

    except Exception as e:
        logger.error(f"Error verifying company access: {str(e)}")
        return False


def store_scraped_content(company_id: str, website_url: str, scraped_data: Dict[str, Any]) -> str:
    """Store scraped content in S3."""
    try:
        # Generate S3 key
        timestamp = datetime.now(timezone.utc).strftime('%Y/%m/%d')
        content_hash = hashlib.md5(website_url.encode()).hexdigest()[:8]
        s3_key = f"tenants/{company_id}/scraped-content/{timestamp}/website_{content_hash}.json"

        # Store in S3
        s3_client.put_object(
            Bucket=RAW_DOCUMENTS_BUCKET,
            Key=s3_key,
            Body=json.dumps(scraped_data, default=str),
            ContentType='application/json',
            ACL='bucket-owner-full-control',
            Metadata={
                'content-type': 'website-scrape',
                'company-id': company_id,
                'source-url': website_url,
                'scraped-at': datetime.now(timezone.utc).isoformat()
            }
        )

        logger.info(f"Stored scraped content at {s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Error storing scraped content: {str(e)}")
        raise


def schedule_regular_scraping(company_id: str, website_url: str, frequency: str = 'weekly') -> str:
    """Schedule regular website scraping."""
    try:
        # Create EventBridge rule for regular scraping
        rule_name = f"govbizai-website-scraping-{company_id}"

        # Schedule expression based on frequency
        schedule_expressions = {
            'daily': 'rate(1 day)',
            'weekly': 'rate(7 days)',
            'monthly': 'rate(30 days)'
        }

        schedule_expression = schedule_expressions.get(frequency, 'rate(7 days)')

        response = eventbridge_client.put_rule(
            Name=rule_name,
            ScheduleExpression=schedule_expression,
            Description=f'Regular website scraping for company {company_id}',
            State='ENABLED'
        )

        # Add this Lambda function as target
        eventbridge_client.put_targets(
            Rule=rule_name,
            Targets=[
                {
                    'Id': '1',
                    'Arn': os.environ.get('AWS_LAMBDA_FUNCTION_NAME', 'arn:aws:lambda:us-east-1:123456789012:function:govbizai-website-scraper'),
                    'Input': json.dumps({
                        'company_id': company_id,
                        'website_url': website_url,
                        'scheduled_scrape': True
                    })
                }
            ]
        )

        logger.info(f"Scheduled {frequency} scraping for {website_url}")
        return rule_name

    except Exception as e:
        logger.error(f"Error scheduling regular scraping: {str(e)}")
        raise


def log_scraping_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log scraping actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'WEBSITE_SCRAPING_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'WEBSITE',
                'resource_id': details.get('website_url', 'unknown'),
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging scraping action: {str(e)}")


def create_success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a successful response."""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps(data, default=str)
    }


def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create an error response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps({
            'error': error_code,
            'message': message
        })
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Main Lambda handler for website scraping."""
    try:
        logger.info("Processing website scraping request")

        # Check if this is a scheduled scrape
        if event.get('scheduled_scrape'):
            company_id = event['company_id']
            website_url = event['website_url']
            user_info = {'company_id': company_id, 'user_id': 'system', 'tenant_id': 'system'}
        else:
            # Parse request body for API requests
            try:
                body = json.loads(event.get('body', '{}'))
            except json.JSONDecodeError:
                return create_error_response(400, 'INVALID_JSON', 'Invalid JSON in request body')

            user_info = get_user_info(event)

            # Validate required fields
            if 'website_url' not in body:
                return create_error_response(400, 'MISSING_FIELD', 'Missing required field: website_url')

            website_url = body['website_url']
            company_id = body.get('company_id', user_info['company_id'])

            # Verify company access
            if not verify_company_access(company_id, user_info):
                return create_error_response(403, 'ACCESS_DENIED', 'Access denied to company resources')

        # Scrape the website
        scraper = WebsiteScraper()
        scraped_data = scraper.scrape_website(website_url)

        # Store scraped content
        s3_key = store_scraped_content(company_id, website_url, scraped_data)

        # Schedule regular scraping if requested (and not already scheduled)
        schedule_name = None
        if event.get('body'):
            body = json.loads(event['body'])
            if body.get('schedule_frequency'):
                schedule_name = schedule_regular_scraping(
                    company_id,
                    website_url,
                    body['schedule_frequency']
                )

        # Log the scraping
        log_scraping_action(user_info, 'SCRAPE', {
            'website_url': website_url,
            'company_id': company_id,
            's3_key': s3_key,
            'pages_scraped': scraped_data['pages_scraped'],
            'total_word_count': scraped_data['total_word_count'],
            'scrape_duration': scraped_data['scrape_duration'],
            'schedule_name': schedule_name,
            'scheduled_scrape': event.get('scheduled_scrape', False)
        })

        logger.info(f"Website scraping completed: {website_url} -> {scraped_data['pages_scraped']} pages")

        response_data = {
            'website_url': website_url,
            'company_id': company_id,
            's3_key': s3_key,
            'scraping_summary': {
                'pages_scraped': scraped_data['pages_scraped'],
                'total_word_count': scraped_data['total_word_count'],
                'scrape_duration': scraped_data['scrape_duration'],
                'scraped_urls': scraped_data['scraped_urls'][:5]  # Limit URLs in response
            },
            'content_preview': {
                'word_count': scraped_data['content'].get('word_count', 0),
                'contact_emails': scraped_data['content'].get('contact_emails', []),
                'key_headings': scraped_data['content'].get('headings', [])[:5]
            },
            'schedule_name': schedule_name,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"Unexpected error in website scraping: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while scraping the website')