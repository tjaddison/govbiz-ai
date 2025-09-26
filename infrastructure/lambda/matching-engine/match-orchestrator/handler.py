"""
GovBizAI Match Orchestrator
Phase 7: Matching Engine

This Lambda function orchestrates the complete matching process by coordinating all
8 scoring components and generating comprehensive match results.

Key Features:
- Coordinates all 8 matching components
- Implements caching for performance
- Handles concurrent component execution
- Generates match explanations and recommendations
- Maintains <100ms performance target per comparison
"""

import json
import boto3
from boto3.dynamodb.conditions import Key
import asyncio
import logging
import os
from typing import Dict, List, Tuple, Optional
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import hashlib
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
CACHE_TABLE = os.environ.get('CACHE_TABLE', 'govbizai-match-cache')
MATCHES_TABLE = os.environ.get('MATCHES_TABLE', 'govbizai-matches')
CACHE_TTL = 86400  # 24 hours

# Component weights (configurable)
DEFAULT_WEIGHTS = {
    'semantic_similarity': 0.25,
    'keyword_matching': 0.15,
    'naics_alignment': 0.15,
    'past_performance': 0.20,
    'certification_bonus': 0.10,
    'geographic_match': 0.05,
    'capacity_fit': 0.05,
    'recency_factor': 0.05
}

# Component Lambda function names
COMPONENT_FUNCTIONS = {
    'semantic_similarity': 'govbizai-semantic-similarity',
    'keyword_matching': 'govbizai-keyword-matching',
    'naics_alignment': 'govbizai-naics-alignment',
    'past_performance': 'govbizai-past-performance',
    'certification_bonus': 'govbizai-certification-bonus',
    'geographic_match': 'govbizai-geographic-match',
    'capacity_fit': 'govbizai-capacity-fit',
    'recency_factor': 'govbizai-recency-factor'
}

# Quick filter function
QUICK_FILTER_FUNCTION = 'govbizai-quick-filter'


def convert_floats_to_decimal(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility"""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


@dataclass
class MatchResult:
    """Data class for match results"""
    opportunity_id: str
    company_id: str
    total_score: float
    confidence_level: str
    component_scores: Dict
    match_reasons: List[str]
    recommendations: List[str]
    action_items: List[str]
    processing_time_ms: float
    cached: bool = False


class MatchOrchestrator:
    """Production-ready match orchestrator with caching and performance optimization"""

    def __init__(self):
        self.cache_table = dynamodb.Table(CACHE_TABLE) if CACHE_TABLE else None
        self.matches_table = dynamodb.Table(MATCHES_TABLE) if MATCHES_TABLE else None
        self.weights = DEFAULT_WEIGHTS.copy()
        self.max_workers = 8  # Concurrent component executions

    async def calculate_match(self, opportunity: Dict, company_profile: Dict,
                            use_cache: bool = True, custom_weights: Optional[Dict] = None) -> MatchResult:
        """
        Calculate comprehensive match score between opportunity and company.

        Args:
            opportunity: Opportunity data
            company_profile: Company profile data
            use_cache: Whether to use caching
            custom_weights: Custom component weights

        Returns:
            MatchResult with comprehensive scoring
        """
        start_time = time.time()

        try:
            # Use custom weights if provided
            if custom_weights:
                self.weights.update(custom_weights)

            # Generate cache key
            cache_key = self._generate_cache_key(opportunity, company_profile, self.weights)

            # Check cache first
            if use_cache and self.cache_table:
                cached_result = await self._get_cached_result(cache_key)
                if cached_result:
                    logger.info("Returning cached match result")
                    return cached_result

            # Quick filter check
            if not await self._passes_quick_filter(opportunity, company_profile):
                logger.info("Match failed quick filter - returning zero score")
                return self._create_zero_score_result(opportunity, company_profile, start_time)

            # Execute all scoring components in parallel
            component_scores = await self._execute_components_parallel(opportunity, company_profile)

            # Calculate total weighted score
            total_score = self._calculate_weighted_score(component_scores)

            # Determine confidence level
            confidence_level = self._calculate_confidence_level(total_score, component_scores)

            # Generate match explanations
            match_reasons = self._generate_match_reasons(component_scores, total_score)
            recommendations = self._generate_recommendations(component_scores, opportunity, company_profile)
            action_items = self._generate_action_items(component_scores, opportunity, company_profile)

            # Create match result
            processing_time = time.time() - start_time
            match_result = MatchResult(
                opportunity_id=opportunity.get('notice_id', 'unknown'),
                company_id=company_profile.get('company_id', 'unknown'),
                total_score=total_score,
                confidence_level=confidence_level,
                component_scores=component_scores,
                match_reasons=match_reasons,
                recommendations=recommendations,
                action_items=action_items,
                processing_time_ms=round(processing_time * 1000, 2)
            )

            # Cache the result
            if use_cache and self.cache_table:
                await self._cache_result(cache_key, match_result)

            # Store the result in matches table for persistent access
            await self._store_match_result(match_result)

            logger.info(f"Match calculation completed in {processing_time:.3f}s")
            return match_result

        except Exception as e:
            logger.error(f"Error calculating match: {str(e)}")
            raise

    async def _passes_quick_filter(self, opportunity: Dict, company_profile: Dict) -> bool:
        """Check if the match passes quick filter screening"""
        try:
            payload = {
                'opportunity': opportunity,
                'company_profile': company_profile
            }

            response = lambda_client.invoke(
                FunctionName=QUICK_FILTER_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )

            result = json.loads(response['Payload'].read())
            if result.get('statusCode') == 200:
                body = json.loads(result.get('body', '{}'))
                return body.get('is_potential_match', False)

            return False  # Default to false if quick filter fails

        except Exception as e:
            logger.warning(f"Quick filter error, proceeding with full match: {str(e)}")
            return True  # Allow full matching if quick filter fails

    async def _execute_components_parallel(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Execute all scoring components in parallel"""
        try:
            component_scores = {}
            payload = {
                'opportunity': opportunity,
                'company_profile': company_profile
            }

            # Use ThreadPoolExecutor for parallel execution
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                # Submit all component invocations
                future_to_component = {}
                for component, function_name in COMPONENT_FUNCTIONS.items():
                    future = executor.submit(self._invoke_component, function_name, payload)
                    future_to_component[future] = component

                # Collect results
                for future in as_completed(future_to_component):
                    component = future_to_component[future]
                    try:
                        result = future.result(timeout=30)  # 30 second timeout
                        if result:
                            component_scores[component] = result
                        else:
                            logger.warning(f"No result from {component}")
                            component_scores[component] = {'score': 0.0, 'status': 'no_result'}
                    except Exception as e:
                        logger.error(f"Error executing {component}: {str(e)}")
                        component_scores[component] = {'score': 0.0, 'status': 'error', 'error': str(e)}

            return component_scores

        except Exception as e:
            logger.error(f"Error executing components in parallel: {str(e)}")
            return {}

    def _invoke_component(self, function_name: str, payload: Dict) -> Optional[Dict]:
        """Invoke a single component Lambda function"""
        try:
            response = lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )

            result = json.loads(response['Payload'].read())
            if result.get('statusCode') == 200:
                body = json.loads(result.get('body', '{}'))
                # Extract the score from the component-specific field
                for key, value in body.items():
                    if key.endswith('_score') and isinstance(value, dict):
                        return value

            return None

        except Exception as e:
            logger.error(f"Error invoking {function_name}: {str(e)}")
            return None

    def _calculate_weighted_score(self, component_scores: Dict) -> float:
        """Calculate weighted total score"""
        try:
            total_score = 0.0
            total_weight = 0.0

            for component, weight in self.weights.items():
                if component in component_scores:
                    score_data = component_scores[component]

                    # Extract score value
                    if isinstance(score_data, dict):
                        score = score_data.get('overall_score', score_data.get('score', 0.0))
                    else:
                        score = float(score_data) if score_data else 0.0

                    total_score += score * weight
                    total_weight += weight

            # Normalize if weights don't sum to 1.0
            if total_weight > 0 and total_weight != 1.0:
                total_score = total_score / total_weight

            return round(max(0.0, min(1.0, total_score)), 4)

        except Exception as e:
            logger.error(f"Error calculating weighted score: {str(e)}")
            return 0.0

    def _calculate_confidence_level(self, total_score: float, component_scores: Dict) -> str:
        """Calculate confidence level based on total score and component consistency"""
        try:
            if total_score >= 0.75:
                base_confidence = 'HIGH'
            elif total_score >= 0.50:
                base_confidence = 'MEDIUM'
            elif total_score >= 0.25:
                base_confidence = 'LOW'
            else:
                return 'NO_MATCH'

            # Check component consistency
            scores = []
            for component, score_data in component_scores.items():
                if isinstance(score_data, dict):
                    score = score_data.get('overall_score', score_data.get('score', 0.0))
                else:
                    score = float(score_data) if score_data else 0.0
                scores.append(score)

            if len(scores) > 1:
                # Calculate coefficient of variation
                mean_score = sum(scores) / len(scores)
                if mean_score > 0:
                    variance = sum((s - mean_score) ** 2 for s in scores) / len(scores)
                    std_dev = variance ** 0.5
                    cv = std_dev / mean_score

                    # Adjust confidence based on consistency
                    if cv > 0.5:  # High variation
                        if base_confidence == 'HIGH':
                            base_confidence = 'MEDIUM'
                        elif base_confidence == 'MEDIUM':
                            base_confidence = 'LOW'

            return base_confidence

        except Exception as e:
            logger.error(f"Error calculating confidence level: {str(e)}")
            return 'LOW'

    def _generate_match_reasons(self, component_scores: Dict, total_score: float) -> List[str]:
        """Generate human-readable match reasons"""
        try:
            reasons = []

            # Overall score reason
            if total_score >= 0.75:
                reasons.append(f"Strong overall match with {total_score:.1%} compatibility score")
            elif total_score >= 0.50:
                reasons.append(f"Good match potential with {total_score:.1%} compatibility score")
            elif total_score >= 0.25:
                reasons.append(f"Moderate alignment with {total_score:.1%} compatibility score")

            # Component-specific reasons
            for component, score_data in component_scores.items():
                if isinstance(score_data, dict):
                    score = score_data.get('overall_score', score_data.get('score', 0.0))

                    if score >= 0.7:  # Strong component scores
                        component_name = component.replace('_', ' ').title()
                        reasons.append(f"Strong {component_name.lower()} alignment ({score:.1%})")

                    # Add specific component insights
                    if component == 'naics_alignment' and score >= 0.7:
                        match_level = score_data.get('match_level', '')
                        if match_level == 'exact':
                            reasons.append("Exact NAICS code match indicates perfect industry alignment")

                    elif component == 'semantic_similarity' and score >= 0.7:
                        reasons.append("High semantic similarity between opportunity and company capabilities")

                    elif component == 'keyword_matching' and score >= 0.7:
                        exact_matches = score_data.get('exact_matches', {}).get('matches', [])
                        if len(exact_matches) > 5:
                            reasons.append(f"Strong keyword alignment with {len(exact_matches)} exact matches")

            return reasons[:5]  # Limit to top 5 reasons

        except Exception as e:
            logger.error(f"Error generating match reasons: {str(e)}")
            return []

    def _generate_recommendations(self, component_scores: Dict, opportunity: Dict, company_profile: Dict) -> List[str]:
        """Generate actionable recommendations"""
        try:
            recommendations = []

            # Collect component-specific recommendations
            for component, score_data in component_scores.items():
                if isinstance(score_data, dict) and 'recommendations' in score_data:
                    comp_recommendations = score_data['recommendations']
                    if isinstance(comp_recommendations, list):
                        recommendations.extend(comp_recommendations)

            # Add general recommendations based on scores
            total_score = self._calculate_weighted_score(component_scores)

            if total_score >= 0.75:
                recommendations.append("High match confidence - prioritize this opportunity for proposal development")
            elif total_score >= 0.50:
                recommendations.append("Good match potential - conduct detailed capability gap analysis")
            elif total_score >= 0.25:
                recommendations.append("Moderate fit - consider partnership or subcontracting opportunities")

            # Remove duplicates while preserving order
            seen = set()
            unique_recommendations = []
            for rec in recommendations:
                if rec not in seen:
                    seen.add(rec)
                    unique_recommendations.append(rec)

            return unique_recommendations[:7]  # Limit to top 7

        except Exception as e:
            logger.error(f"Error generating recommendations: {str(e)}")
            return []

    def _generate_action_items(self, component_scores: Dict, opportunity: Dict, company_profile: Dict) -> List[str]:
        """Generate specific action items"""
        try:
            action_items = []

            # NAICS-specific actions
            naics_data = component_scores.get('naics_alignment', {})
            if isinstance(naics_data, dict):
                naics_score = naics_data.get('overall_score', 0.0)
                if naics_score < 0.5:
                    action_items.append("Review and verify NAICS code alignment before bidding")

                match_level = naics_data.get('match_level', '')
                if match_level in ['3_digit', '2_digit']:
                    action_items.append("Consider partnering with firms having exact NAICS match")

            # Capability actions
            semantic_data = component_scores.get('semantic_similarity', {})
            if isinstance(semantic_data, dict):
                semantic_score = semantic_data.get('overall_score', 0.0)
                if semantic_score < 0.4:
                    action_items.append("Develop capability statement emphasizing relevant experience")

            # Past performance actions
            past_perf_data = component_scores.get('past_performance', {})
            if isinstance(past_perf_data, dict):
                past_perf_score = past_perf_data.get('overall_score', 0.0)
                if past_perf_score < 0.3:
                    action_items.append("Gather relevant past performance references and documentation")

            # Certification actions
            cert_data = component_scores.get('certification_bonus', {})
            if isinstance(cert_data, dict):
                cert_score = cert_data.get('overall_score', 0.0)
                if cert_score < 0.5:
                    set_aside = opportunity.get('SetASide', '')
                    if set_aside and 'Small Business' in set_aside:
                        action_items.append("Verify small business size standards compliance")

            # General actions
            response_deadline = opportunity.get('ResponseDeadLine', '')
            if response_deadline:
                action_items.append(f"Mark calendar for response deadline: {response_deadline}")

            action_items.append("Review full solicitation document for detailed requirements")
            action_items.append("Assess competitive landscape and pricing strategy")

            return action_items[:6]  # Limit to top 6

        except Exception as e:
            logger.error(f"Error generating action items: {str(e)}")
            return []

    def _generate_cache_key(self, opportunity: Dict, company_profile: Dict, weights: Dict) -> str:
        """Generate cache key for the match"""
        try:
            # Create a string representation of the key components
            key_data = {
                'opp_id': opportunity.get('notice_id', ''),
                'company_id': company_profile.get('company_id', ''),
                'opp_hash': hashlib.md5(json.dumps(opportunity, sort_keys=True).encode()).hexdigest()[:8],
                'company_hash': hashlib.md5(json.dumps(company_profile, sort_keys=True).encode()).hexdigest()[:8],
                'weights_hash': hashlib.md5(json.dumps(weights, sort_keys=True).encode()).hexdigest()[:8]
            }

            return f"match_{key_data['opp_id']}_{key_data['company_id']}_{key_data['opp_hash']}_{key_data['company_hash']}_{key_data['weights_hash']}"

        except Exception as e:
            logger.error(f"Error generating cache key: {str(e)}")
            return f"match_{int(time.time())}"

    async def _get_cached_result(self, cache_key: str) -> Optional[MatchResult]:
        """Retrieve cached result if valid"""
        try:
            response = self.cache_table.get_item(Key={'cache_key': cache_key})

            if 'Item' in response:
                item = response['Item']

                # Check if cache is still valid
                cache_time = item.get('timestamp', 0)
                if time.time() - cache_time < CACHE_TTL:
                    # Deserialize the cached result
                    cached_data = json.loads(item['match_data'])

                    result = MatchResult(
                        opportunity_id=cached_data['opportunity_id'],
                        company_id=cached_data['company_id'],
                        total_score=cached_data['total_score'],
                        confidence_level=cached_data['confidence_level'],
                        component_scores=cached_data['component_scores'],
                        match_reasons=cached_data['match_reasons'],
                        recommendations=cached_data['recommendations'],
                        action_items=cached_data['action_items'],
                        processing_time_ms=cached_data['processing_time_ms'],
                        cached=True
                    )

                    return result

            return None

        except Exception as e:
            logger.error(f"Error retrieving cached result: {str(e)}")
            return None

    async def _cache_result(self, cache_key: str, match_result: MatchResult):
        """Cache the match result"""
        try:
            # Serialize the result
            result_data = {
                'opportunity_id': match_result.opportunity_id,
                'company_id': match_result.company_id,
                'total_score': match_result.total_score,
                'confidence_level': match_result.confidence_level,
                'component_scores': match_result.component_scores,
                'match_reasons': match_result.match_reasons,
                'recommendations': match_result.recommendations,
                'action_items': match_result.action_items,
                'processing_time_ms': match_result.processing_time_ms
            }

            # Store in cache
            self.cache_table.put_item(
                Item={
                    'cache_key': cache_key,
                    'match_data': json.dumps(result_data),
                    'timestamp': int(time.time()),
                    'ttl': int(time.time()) + CACHE_TTL
                }
            )

        except Exception as e:
            logger.error(f"Error caching result: {str(e)}")

    async def _store_match_result(self, match_result: MatchResult):
        """Store the match result in the matches table"""
        try:
            if not self.matches_table:
                logger.warning("Matches table not configured, skipping storage")
                return

            # Prepare the item for DynamoDB
            item = {
                'company_id': match_result.company_id,
                'opportunity_id': match_result.opportunity_id,
                'total_score': match_result.total_score,
                'confidence_level': match_result.confidence_level,
                'component_scores': match_result.component_scores,
                'match_reasons': match_result.match_reasons,
                'non_match_reasons': [],  # Can be derived from component analysis
                'recommendations': match_result.recommendations,
                'action_items': match_result.action_items,
                'processing_time_ms': match_result.processing_time_ms,
                'created_at': int(time.time()),
                'updated_at': int(time.time())
            }

            # Convert all float values to Decimal for DynamoDB compatibility
            item = convert_floats_to_decimal(item)

            # Store in matches table
            self.matches_table.put_item(Item=item)
            logger.info(f"Stored match result for {match_result.opportunity_id} - {match_result.company_id}")

        except Exception as e:
            logger.error(f"Error storing match result: {str(e)}")

    async def _cleanup_old_matches(self, company_id: str, cutoff_timestamp: int):
        """Remove old match results for a company"""
        try:
            if not self.matches_table:
                logger.warning("Matches table not configured, skipping cleanup")
                return

            # Query all matches for this company
            response = self.matches_table.query(
                KeyConditionExpression=Key('company_id').eq(company_id)
            )

            items_to_delete = []
            for item in response.get('Items', []):
                created_at = item.get('created_at', 0)
                if created_at < cutoff_timestamp:
                    items_to_delete.append({
                        'company_id': item['company_id'],
                        'opportunity_id': item['opportunity_id']
                    })

            # Delete old items in batches
            if items_to_delete:
                # DynamoDB batch delete supports up to 25 items per request
                for i in range(0, len(items_to_delete), 25):
                    batch = items_to_delete[i:i+25]
                    delete_requests = [{'DeleteRequest': {'Key': item}} for item in batch]

                    self.matches_table.meta.client.batch_write_item(
                        RequestItems={
                            MATCHES_TABLE: delete_requests
                        }
                    )

                logger.info(f"Deleted {len(items_to_delete)} old match results for company {company_id}")

        except Exception as e:
            logger.error(f"Error cleaning up old matches: {str(e)}")

    def _create_zero_score_result(self, opportunity: Dict, company_profile: Dict, start_time: float) -> MatchResult:
        """Create a zero score result for failed quick filter"""
        processing_time = time.time() - start_time

        return MatchResult(
            opportunity_id=opportunity.get('notice_id', 'unknown'),
            company_id=company_profile.get('company_id', 'unknown'),
            total_score=0.0,
            confidence_level='NO_MATCH',
            component_scores={},
            match_reasons=['Failed initial compatibility screening'],
            recommendations=['This opportunity may not align with company capabilities'],
            action_items=[],
            processing_time_ms=round(processing_time * 1000, 2)
        )


# Initialize the orchestrator
match_orchestrator = MatchOrchestrator()


def lambda_handler(event, context):
    """
    AWS Lambda handler for match orchestration

    Expected event format:
    {
        "opportunity": {...},
        "company_profile": {...},
        "use_cache": true,
        "custom_weights": {...}
    }
    """
    try:
        logger.info("Starting match orchestration")

        # Validate input
        if 'opportunity' not in event or 'company_profile' not in event:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing required fields: opportunity and company_profile'
                })
            }

        opportunity = event['opportunity']
        company_profile = event['company_profile']
        use_cache = event.get('use_cache', True)
        custom_weights = event.get('custom_weights')

        # Since we can't use async in Lambda easily, we'll run synchronously
        # In production, consider using async libraries like aiohttp
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            match_result = loop.run_until_complete(
                match_orchestrator.calculate_match(
                    opportunity, company_profile, use_cache, custom_weights
                )
            )
        finally:
            loop.close()

        # Convert to serializable format
        result_dict = {
            'opportunity_id': match_result.opportunity_id,
            'company_id': match_result.company_id,
            'total_score': match_result.total_score,
            'confidence_level': match_result.confidence_level,
            'component_scores': match_result.component_scores,
            'match_reasons': match_result.match_reasons,
            'recommendations': match_result.recommendations,
            'action_items': match_result.action_items,
            'processing_time_ms': match_result.processing_time_ms,
            'cached': match_result.cached,
            'timestamp': int(time.time())
        }

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'match_result': result_dict,
                'component': 'match_orchestrator',
                'version': '1.0'
            })
        }

    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}'
            })
        }


# For local testing
if __name__ == "__main__":
    # Test data
    test_opportunity = {
        'notice_id': 'TEST-MATCH-001',
        'posted_date': '2024-01-15',
        'title': 'Comprehensive IT Services for Government Agency',
        'description': 'Seeking qualified contractors for IT support, cybersecurity, and cloud migration services.',
        'NaicsCode': '541511',
        'SetASide': 'Total Small Business',
        'ResponseDeadLine': '2024-02-15'
    }

    test_company = {
        'company_id': 'TEST-COMPANY-001',
        'tenant_id': 'TEST-TENANT',
        'company_name': 'TechSolutions Inc.',
        'capability_statement': 'We provide comprehensive IT services including cybersecurity and cloud solutions.',
        'naics_codes': ['541511', '541512'],
        'certifications': ['Small Business', '8(a)'],
        'past_performance': [
            {'description': 'IT support for Department of Defense'}
        ]
    }

    # Test the function
    test_event = {
        'opportunity': test_opportunity,
        'company_profile': test_company,
        'use_cache': False
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))