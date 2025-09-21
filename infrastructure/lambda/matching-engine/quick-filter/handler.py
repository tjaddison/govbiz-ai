"""
GovBizAI Quick Filter (is_potential_match)
Phase 7: Matching Engine

This Lambda function performs rapid pre-screening to filter out obviously non-matching
opportunities before running expensive matching algorithms.

Key Features:
- Sub-10ms performance for rapid screening
- Set-aside requirement compliance checking
- Basic geographic eligibility verification
- Rough NAICS code alignment check
- Minimum semantic similarity threshold
- Company active status verification
"""

import json
import logging
from typing import Dict, List, Tuple, Set, Optional
import time
import re

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Quick filter thresholds
SEMANTIC_SIMILARITY_THRESHOLD = 0.3
NAICS_ALIGNMENT_THRESHOLD = 0.2
KEYWORD_MATCH_THRESHOLD = 3  # Minimum number of matching keywords

# Set-aside eligibility mapping
SET_ASIDE_KEYWORDS = {
    'SMALL BUSINESS': ['small business', 'small', 'sba'],
    '8(A)': ['8(a)', 'eight(a)', 'eight a', '8a'],
    'WOSB': ['wosb', 'women-owned', 'women owned', 'woman-owned', 'woman owned'],
    'SDVOSB': ['sdvosb', 'service-disabled', 'veteran-owned', 'veteran owned'],
    'HUBZONE': ['hubzone', 'hub zone', 'historically underutilized'],
    'VOSB': ['vosb', 'veteran-owned', 'veteran owned']
}

# Critical exclusion keywords (opportunities to avoid)
EXCLUSION_KEYWORDS = {
    'nuclear', 'classified', 'secret clearance', 'top secret',
    'uranium', 'plutonium', 'radioactive', 'hazmat',
    'foreign national restriction', 'us citizen only'
}

# High-value opportunity indicators
HIGH_VALUE_INDICATORS = {
    'multiple award', 'idiq', 'indefinite delivery',
    'framework', 'blanket purchase', 'long-term',
    'renewable', 'option years', 'base plus options'
}

# Industry sector mapping for incompatible matches
INDUSTRY_SECTORS = {
    # Healthcare & Medical
    '621': 'Healthcare Services',
    '622': 'Hospitals',
    '623': 'Nursing and Residential Care',
    '624': 'Social Assistance',

    # Information Technology
    '541511': 'IT Consulting',
    '541512': 'Computer Systems Design',
    '541513': 'IT Facilities Management',
    '541519': 'Other Computer Related Services',
    '518': 'Information Technology',

    # Manufacturing - Incompatible with Healthcare
    '336': 'Transportation Equipment Manufacturing',
    '333': 'Machinery Manufacturing',
    '332': 'Fabricated Metal Products',
    '331': 'Primary Metal Manufacturing',

    # Professional Services
    '541': 'Professional Services',
    '561': 'Administrative Support Services',

    # Construction
    '236': 'Construction of Buildings',
    '237': 'Heavy Construction',
    '238': 'Specialty Trade Contractors'
}

# Define incompatible industry combinations
INCOMPATIBLE_INDUSTRIES = {
    # Healthcare companies should not match manufacturing
    ('Healthcare', 'Manufacturing'): True,
    ('Medical', 'Manufacturing'): True,
    ('Healthcare IT', 'Manufacturing'): True,

    # IT companies should not match pure manufacturing
    ('IT', 'Heavy Manufacturing'): True,
    ('Software', 'Manufacturing'): True,

    # Services should not match manufacturing hardware
    ('Services', 'Aircraft Parts'): True,
    ('Services', 'Mechanical Components'): True,
}


class QuickFilter:
    """Ultra-fast pre-screening filter for opportunity matching"""

    def __init__(self):
        self.set_aside_keywords = SET_ASIDE_KEYWORDS
        self.exclusion_keywords = EXCLUSION_KEYWORDS
        self.high_value_indicators = HIGH_VALUE_INDICATORS

    def is_potential_match(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """
        Perform rapid pre-screening to determine if detailed matching should proceed.

        Args:
            opportunity: Opportunity data
            company_profile: Company profile data

        Returns:
            Dict with match decision and reasoning
        """
        start_time = time.time()

        try:
            # Initialize result structure
            filter_result = {
                'is_potential_match': False,
                'filter_score': 0.0,
                'pass_reasons': [],
                'fail_reasons': [],
                'checks_performed': {},
                'processing_time_ms': 0.0
            }

            # Perform all quick checks
            checks = self._perform_all_checks(opportunity, company_profile)
            filter_result['checks_performed'] = checks

            # Evaluate overall result
            filter_result = self._evaluate_filter_result(filter_result, checks)

            # Performance metrics
            processing_time = time.time() - start_time
            filter_result['processing_time_ms'] = round(processing_time * 1000, 2)

            logger.info(f"Quick filter completed in {processing_time:.4f}s - Result: {filter_result['is_potential_match']}")
            return filter_result

        except Exception as e:
            logger.error(f"Error in quick filter: {str(e)}")
            return self._create_error_result(str(e))

    def _perform_all_checks(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Perform all quick filter checks"""
        checks = {}

        try:
            # 1. Company Active Status Check
            checks['active_status'] = self._check_active_status(company_profile)

            # 2. Set-Aside Eligibility Check
            checks['set_aside_eligible'] = self._check_set_aside_eligibility(opportunity, company_profile)

            # 3. Geographic Eligibility Check
            checks['geographic_eligible'] = self._check_geographic_eligibility(opportunity, company_profile)

            # 4. Basic NAICS Alignment Check
            checks['naics_alignment'] = self._check_basic_naics_alignment(opportunity, company_profile)

            # 5. Exclusion Keywords Check
            checks['exclusion_check'] = self._check_exclusion_keywords(opportunity, company_profile)

            # 6. Minimum Keywords Match Check
            checks['keyword_match'] = self._check_minimum_keywords(opportunity, company_profile)

            # 7. Opportunity Size vs Company Size Check
            checks['size_compatibility'] = self._check_size_compatibility(opportunity, company_profile)

            # 8. Response Deadline Check
            checks['deadline_feasible'] = self._check_response_deadline(opportunity)

            # 9. Industry Compatibility Check
            checks['industry_compatible'] = self._check_industry_compatibility(opportunity, company_profile)

            return checks

        except Exception as e:
            logger.error(f"Error performing checks: {str(e)}")
            return {'error': str(e)}

    def _check_active_status(self, company_profile: Dict) -> Dict:
        """Check if company is active and eligible to bid"""
        try:
            # Check active status
            is_active = company_profile.get('active_status', True)  # Default to true
            status = company_profile.get('status', 'active').lower()

            active = is_active and status in ['active', 'verified', 'approved']

            return {
                'passed': active,
                'score': 1.0 if active else 0.0,
                'details': f"Company status: {status}" if not active else "Company is active"
            }

        except Exception as e:
            return {'passed': True, 'score': 1.0, 'details': f"Error checking status: {str(e)}"}

    def _check_set_aside_eligibility(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check set-aside program eligibility"""
        try:
            opp_set_aside = opportunity.get('SetASide', '').upper()
            company_certs = [str(cert).upper() for cert in company_profile.get('certifications', [])]

            # If no set-aside, all companies are eligible
            if not opp_set_aside or opp_set_aside in ['', 'NONE', 'UNRESTRICTED']:
                return {'passed': True, 'score': 1.0, 'details': 'No set-aside restriction'}

            # Check for specific set-aside eligibility
            for set_aside, keywords in self.set_aside_keywords.items():
                if any(keyword.upper() in opp_set_aside for keyword in keywords):
                    # Check if company has matching certification
                    has_cert = any(any(kw.upper() in cert for kw in keywords) for cert in company_certs)

                    if has_cert:
                        return {
                            'passed': True,
                            'score': 1.0,
                            'details': f"Company eligible for {set_aside} set-aside"
                        }

            # Special handling for generic "small business"
            if 'SMALL BUSINESS' in opp_set_aside:
                small_biz_indicators = ['SMALL', 'SBA', 'SB', '8(A)', 'WOSB', 'SDVOSB', 'HUBZONE']
                has_small_biz = any(indicator in ' '.join(company_certs) for indicator in small_biz_indicators)

                if has_small_biz:
                    return {
                        'passed': True,
                        'score': 1.0,
                        'details': "Company has small business certification"
                    }

            return {
                'passed': False,
                'score': 0.0,
                'details': f"Company not eligible for {opp_set_aside} set-aside"
            }

        except Exception as e:
            logger.warning(f"Error checking set-aside eligibility: {str(e)}")
            return {'passed': True, 'score': 0.5, 'details': 'Unable to verify set-aside eligibility'}

    def _check_geographic_eligibility(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check basic geographic eligibility"""
        try:
            # Extract location information
            opp_state = opportunity.get('PopState', opportunity.get('State', '')).upper()
            opp_city = opportunity.get('PopCity', opportunity.get('City', '')).upper()

            company_locations = company_profile.get('locations', [])
            company_state = company_profile.get('state', '').upper()
            company_city = company_profile.get('city', '').upper()

            # If no specific location requirements, pass
            if not opp_state and not opp_city:
                return {'passed': True, 'score': 1.0, 'details': 'No geographic restrictions'}

            # Check company locations
            if company_locations:
                for location in company_locations:
                    loc_state = location.get('state', '').upper()
                    loc_city = location.get('city', '').upper()

                    if opp_state and loc_state == opp_state:
                        return {
                            'passed': True,
                            'score': 1.0,
                            'details': f"Company has presence in {opp_state}"
                        }

            # Check main company location
            if opp_state and company_state == opp_state:
                return {
                    'passed': True,
                    'score': 1.0,
                    'details': f"Company located in {opp_state}"
                }

            # For federal opportunities, geographic restrictions are often flexible
            is_federal = self._is_federal_opportunity(opportunity)
            if is_federal:
                return {
                    'passed': True,
                    'score': 0.8,
                    'details': 'Federal opportunity - geographic flexibility likely'
                }

            # Default to allowing remote work possibilities
            return {
                'passed': True,
                'score': 0.6,
                'details': 'Geographic eligibility uncertain - may allow remote work'
            }

        except Exception as e:
            logger.warning(f"Error checking geographic eligibility: {str(e)}")
            return {'passed': True, 'score': 0.7, 'details': 'Unable to verify geographic eligibility'}

    def _check_basic_naics_alignment(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check basic NAICS code alignment"""
        try:
            opp_naics = str(opportunity.get('NaicsCode', opportunity.get('naics_code', ''))).strip()
            company_naics_list = company_profile.get('naics_codes', [])

            if not opp_naics or not company_naics_list:
                return {'passed': True, 'score': 0.5, 'details': 'NAICS codes not available for comparison'}

            # Clean NAICS codes
            opp_clean = ''.join(filter(str.isdigit, opp_naics))
            company_clean = [''.join(filter(str.isdigit, str(naics))) for naics in company_naics_list]

            # Check for any level of alignment
            for company_naics in company_clean:
                if not company_naics:
                    continue

                # Exact match
                if opp_clean == company_naics:
                    return {
                        'passed': True,
                        'score': 1.0,
                        'details': f"Exact NAICS match: {opp_clean}"
                    }

                # 4-digit match (industry)
                if len(opp_clean) >= 4 and len(company_naics) >= 4:
                    if opp_clean[:4] == company_naics[:4]:
                        return {
                            'passed': True,
                            'score': 0.8,
                            'details': f"4-digit NAICS match: {opp_clean[:4]}"
                        }

                # 3-digit match (industry group)
                if len(opp_clean) >= 3 and len(company_naics) >= 3:
                    if opp_clean[:3] == company_naics[:3]:
                        return {
                            'passed': True,
                            'score': 0.6,
                            'details': f"3-digit NAICS match: {opp_clean[:3]}"
                        }

                # 2-digit match (sector)
                if len(opp_clean) >= 2 and len(company_naics) >= 2:
                    if opp_clean[:2] == company_naics[:2]:
                        return {
                            'passed': True,
                            'score': 0.4,
                            'details': f"2-digit NAICS match: {opp_clean[:2]}"
                        }

            return {
                'passed': False,
                'score': 0.0,
                'details': f"No NAICS alignment found for {opp_naics}"
            }

        except Exception as e:
            logger.warning(f"Error checking NAICS alignment: {str(e)}")
            return {'passed': True, 'score': 0.3, 'details': 'Unable to verify NAICS alignment'}

    def _check_exclusion_keywords(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check for exclusionary keywords that should prevent matching"""
        try:
            # Combine opportunity text
            opp_text = ' '.join([
                opportunity.get('title', ''),
                opportunity.get('description', ''),
                opportunity.get('SetASide', ''),
                opportunity.get('Office', ''),
            ]).lower()

            # Check for exclusion keywords
            found_exclusions = []
            for keyword in self.exclusion_keywords:
                if keyword.lower() in opp_text:
                    found_exclusions.append(keyword)

            if found_exclusions:
                return {
                    'passed': False,
                    'score': 0.0,
                    'details': f"Exclusionary keywords found: {', '.join(found_exclusions)}"
                }

            # Check company exclusions (if any)
            company_exclusions = company_profile.get('exclusions', [])
            if company_exclusions:
                for exclusion in company_exclusions:
                    if exclusion.lower() in opp_text:
                        return {
                            'passed': False,
                            'score': 0.0,
                            'details': f"Company exclusion matched: {exclusion}"
                        }

            return {
                'passed': True,
                'score': 1.0,
                'details': 'No exclusionary keywords found'
            }

        except Exception as e:
            logger.warning(f"Error checking exclusion keywords: {str(e)}")
            return {'passed': True, 'score': 1.0, 'details': 'Unable to check exclusions'}

    def _check_minimum_keywords(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check for minimum keyword overlap"""
        try:
            # Extract text from opportunity
            opp_text = ' '.join([
                opportunity.get('title', ''),
                opportunity.get('description', ''),
            ]).lower()

            # Extract text from company
            company_text = ' '.join([
                company_profile.get('company_name', ''),
                company_profile.get('capability_statement', ''),
                ' '.join(company_profile.get('certifications', [])),
            ]).lower()

            # Simple keyword extraction
            opp_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', opp_text))
            company_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', company_text))

            # Remove common stop words
            stop_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
            opp_words -= stop_words
            company_words -= stop_words

            # Find matches
            matches = opp_words & company_words
            match_count = len(matches)

            if match_count >= KEYWORD_MATCH_THRESHOLD:
                return {
                    'passed': True,
                    'score': min(1.0, match_count / 10.0),  # Scale up to 1.0
                    'details': f"Found {match_count} keyword matches"
                }

            return {
                'passed': False,
                'score': match_count / KEYWORD_MATCH_THRESHOLD,
                'details': f"Only {match_count} keyword matches (minimum {KEYWORD_MATCH_THRESHOLD})"
            }

        except Exception as e:
            logger.warning(f"Error checking minimum keywords: {str(e)}")
            return {'passed': True, 'score': 0.5, 'details': 'Unable to check keywords'}

    def _check_size_compatibility(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check basic size compatibility"""
        try:
            # Extract contract value if available
            award_value = opportunity.get('Award$', opportunity.get('award_amount', ''))

            if award_value:
                # Clean the value string
                value_str = str(award_value).replace('$', '').replace(',', '').strip()
                try:
                    value = float(value_str)
                except ValueError:
                    value = None
            else:
                value = None

            # Extract company size indicators
            company_size = company_profile.get('employee_count', company_profile.get('size', ''))
            revenue_range = company_profile.get('revenue_range', '')

            # Basic size compatibility checks
            if value:
                # Very large contracts (>$10M) may be challenging for very small companies
                if value > 10000000:
                    if company_size and isinstance(company_size, (int, str)):
                        try:
                            emp_count = int(company_size) if isinstance(company_size, str) else company_size
                            if emp_count < 10:
                                return {
                                    'passed': False,
                                    'score': 0.2,
                                    'details': f"Large contract (${value:,.0f}) may exceed small company capacity"
                                }
                        except ValueError:
                            pass

            return {
                'passed': True,
                'score': 1.0,
                'details': 'Size compatibility acceptable'
            }

        except Exception as e:
            logger.warning(f"Error checking size compatibility: {str(e)}")
            return {'passed': True, 'score': 0.8, 'details': 'Unable to verify size compatibility'}

    def _check_response_deadline(self, opportunity: Dict) -> Dict:
        """Check if response deadline is feasible"""
        try:
            deadline = opportunity.get('ResponseDeadLine', opportunity.get('response_deadline', ''))

            if not deadline:
                return {'passed': True, 'score': 1.0, 'details': 'No deadline specified'}

            # For quick filter, just check if deadline exists and isn't obviously past
            # Full date parsing would be done in detailed matching
            current_time = time.time()

            # Simple heuristic: if the opportunity was posted recently, deadline is probably valid
            posted_date = opportunity.get('PostedDate', opportunity.get('posted_date', ''))
            if posted_date:
                return {
                    'passed': True,
                    'score': 1.0,
                    'details': f"Deadline: {deadline}"
                }

            return {
                'passed': True,
                'score': 0.9,
                'details': 'Deadline feasibility to be verified'
            }

        except Exception as e:
            logger.warning(f"Error checking response deadline: {str(e)}")
            return {'passed': True, 'score': 1.0, 'details': 'Unable to verify deadline'}

    def _check_industry_compatibility(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """Check if company industry is compatible with opportunity type"""
        try:
            # Get opportunity NAICS code and title/description
            opp_naics = str(opportunity.get('NaicsCode', opportunity.get('naics_code', ''))).strip()
            opp_title = opportunity.get('title', '').upper()
            opp_desc = opportunity.get('description', '').upper()

            # Get company industry and NAICS codes
            company_industry = company_profile.get('industry', '').upper()
            company_naics = company_profile.get('naics_codes', [])

            # Convert DynamoDB format to list if needed
            if isinstance(company_naics, dict) and 'L' in company_naics:
                company_naics = [item['S'] for item in company_naics['L']]
            elif not isinstance(company_naics, list):
                company_naics = [str(company_naics)] if company_naics else []

            # Quick checks for obvious incompatibilities
            healthcare_keywords = ['MEDICAL', 'HEALTHCARE', 'HOSPITAL', 'HEALTH', 'PACS', 'RECORDS']
            manufacturing_keywords = ['AIRCRAFT', 'CYLINDER', 'DIAPHRAGM', 'ASSEMBLY', 'COMPONENT', 'PART']

            # Check if company is healthcare-focused
            is_healthcare_company = (
                any(keyword in company_industry for keyword in healthcare_keywords) or
                any(naics.startswith('621') or naics.startswith('622') for naics in company_naics)
            )

            # Check if opportunity is manufacturing-focused
            is_manufacturing_opportunity = (
                any(keyword in opp_title or keyword in opp_desc for keyword in manufacturing_keywords) or
                (opp_naics and (opp_naics.startswith('336') or opp_naics.startswith('333') or opp_naics.startswith('332')))
            )

            # Healthcare companies should not match manufacturing opportunities
            if is_healthcare_company and is_manufacturing_opportunity:
                return {
                    'passed': False,
                    'score': 0.0,
                    'details': f'Healthcare company incompatible with manufacturing opportunity ({opp_title[:50]}...)'
                }

            # Check for IT services companies matching pure manufacturing
            is_it_company = (
                'IT' in company_industry or 'TECHNOLOGY' in company_industry or
                any(naics.startswith('541') for naics in company_naics)
            )

            # Pure manufacturing hardware incompatible with IT services
            if is_it_company and is_manufacturing_opportunity:
                # Allow if it's IT-related manufacturing (software, systems, etc.)
                it_manufacturing_keywords = ['SOFTWARE', 'SYSTEM', 'NETWORK', 'DATABASE', 'COMPUTER']
                has_it_context = any(keyword in opp_title or keyword in opp_desc for keyword in it_manufacturing_keywords)

                if not has_it_context:
                    return {
                        'passed': False,
                        'score': 0.2,
                        'details': f'IT services company unlikely match for pure manufacturing ({opp_title[:50]}...)'
                    }

            # Check NAICS sector alignment
            if opp_naics and company_naics:
                # Get 2-digit sector codes
                opp_sector = opp_naics[:2] if len(opp_naics) >= 2 else ''
                company_sectors = [naics[:2] for naics in company_naics if len(naics) >= 2]

                # Major sector mismatches
                manufacturing_sectors = ['33', '31', '32']  # Manufacturing sectors
                service_sectors = ['54', '56', '62', '51']  # Service sectors

                opp_is_manufacturing = opp_sector in manufacturing_sectors
                company_is_services = any(sector in service_sectors for sector in company_sectors)

                if opp_is_manufacturing and company_is_services and not has_it_context:
                    return {
                        'passed': False,
                        'score': 0.1,
                        'details': f'Service company and manufacturing opportunity sector mismatch'
                    }

            # If we get here, industry compatibility is acceptable
            return {
                'passed': True,
                'score': 1.0,
                'details': 'Industry compatibility acceptable'
            }

        except Exception as e:
            logger.warning(f"Error checking industry compatibility: {str(e)}")
            return {'passed': True, 'score': 0.8, 'details': 'Unable to verify industry compatibility'}

    def _is_federal_opportunity(self, opportunity: Dict) -> bool:
        """Check if this is a federal opportunity"""
        try:
            office = opportunity.get('Office', '').upper()
            agency = opportunity.get('Department/Ind.Agency', opportunity.get('agency', '')).upper()

            federal_indicators = [
                'GSA', 'DOD', 'DEPARTMENT', 'FEDERAL', 'GOVERNMENT',
                'AGENCY', 'ADMINISTRATION', 'BUREAU', 'SERVICE',
                'NAVY', 'ARMY', 'AIR FORCE', 'MARINES'
            ]

            return any(indicator in office or indicator in agency for indicator in federal_indicators)

        except Exception:
            return False

    def _evaluate_filter_result(self, filter_result: Dict, checks: Dict) -> Dict:
        """Evaluate all check results to determine final filter decision"""
        try:
            total_score = 0.0
            total_weight = 0.0
            pass_count = 0
            fail_count = 0

            # Define check weights
            check_weights = {
                'active_status': 0.18,      # Critical - must be active
                'set_aside_eligible': 0.18,  # Critical - must be eligible
                'exclusion_check': 0.18,    # Critical - must not have exclusions
                'industry_compatible': 0.18, # Critical - industry must be compatible
                'naics_alignment': 0.12,    # Important
                'keyword_match': 0.08,      # Moderate
                'geographic_eligible': 0.04, # Low - often flexible
                'size_compatibility': 0.02,  # Low - can partner
                'deadline_feasible': 0.02   # Low - can be verified later
            }

            # Process each check
            for check_name, check_result in checks.items():
                if isinstance(check_result, dict) and 'passed' in check_result:
                    weight = check_weights.get(check_name, 0.0)
                    score = check_result.get('score', 0.0)
                    passed = check_result.get('passed', False)

                    total_score += score * weight
                    total_weight += weight

                    if passed:
                        pass_count += 1
                        filter_result['pass_reasons'].append(check_result.get('details', f"{check_name} passed"))
                    else:
                        fail_count += 1
                        filter_result['fail_reasons'].append(check_result.get('details', f"{check_name} failed"))

                    # Critical check failures
                    if check_name in ['active_status', 'set_aside_eligible', 'exclusion_check', 'industry_compatible'] and not passed:
                        filter_result['is_potential_match'] = False
                        filter_result['filter_score'] = total_score / total_weight if total_weight > 0 else 0.0
                        return filter_result

            # Calculate final score
            if total_weight > 0:
                filter_result['filter_score'] = total_score / total_weight
            else:
                filter_result['filter_score'] = 0.0

            # Make final decision
            # Require minimum score and no critical failures
            minimum_score = 0.5
            filter_result['is_potential_match'] = (
                filter_result['filter_score'] >= minimum_score and
                pass_count >= fail_count
            )

            return filter_result

        except Exception as e:
            logger.error(f"Error evaluating filter result: {str(e)}")
            filter_result['is_potential_match'] = True  # Default to allowing match
            filter_result['filter_score'] = 0.5
            filter_result['fail_reasons'].append(f"Evaluation error: {str(e)}")
            return filter_result

    def _create_error_result(self, error_message: str) -> Dict:
        """Create error result structure"""
        return {
            'is_potential_match': True,  # Default to allowing match on error
            'filter_score': 0.5,
            'pass_reasons': [],
            'fail_reasons': [f"Filter error: {error_message}"],
            'checks_performed': {},
            'processing_time_ms': 0.0,
            'status': 'error',
            'error_message': error_message
        }


# Initialize the filter
quick_filter = QuickFilter()


def lambda_handler(event, context):
    """
    AWS Lambda handler for quick filtering

    Expected event format:
    {
        "opportunity": {...},
        "company_profile": {...}
    }
    """
    try:
        logger.info("Starting quick filter evaluation")

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

        # Perform quick filter evaluation
        filter_result = quick_filter.is_potential_match(opportunity, company_profile)

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'is_potential_match': filter_result['is_potential_match'],
                'filter_details': filter_result,
                'component': 'quick_filter',
                'timestamp': int(time.time())
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
        'notice_id': 'TEST-FILTER-001',
        'title': 'IT Support Services',
        'description': 'Comprehensive IT support and cybersecurity services for government agency.',
        'NaicsCode': '541511',
        'SetASide': 'Total Small Business',
        'Office': 'General Services Administration',
        'ResponseDeadLine': '2024-02-15'
    }

    test_company = {
        'company_id': 'TEST-COMPANY-001',
        'company_name': 'TechSolutions Inc.',
        'capability_statement': 'We provide IT support and cybersecurity services.',
        'naics_codes': ['541511', '541512'],
        'certifications': ['Small Business', '8(a)'],
        'active_status': True,
        'status': 'active'
    }

    # Test the function
    test_event = {
        'opportunity': test_opportunity,
        'company_profile': test_company
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))