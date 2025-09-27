"""
GovBizAI NAICS Code Alignment Scorer
Phase 7: Matching Engine

This Lambda function calculates NAICS code alignment between opportunities and company profiles
with tiered matching logic and industry relationship analysis.

Key Features:
- Tiered matching: Exact > 4-digit > 3-digit > 2-digit > Industry sector
- NAICS hierarchy understanding for related industries
- Primary vs secondary NAICS consideration
- Government contracting specific NAICS codes expertise
- Fast lookup performance with pre-computed mappings
"""

import json
import boto3
import logging

# Add the config management directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'config-management'))

try:
    from config_client import ConfigurationClient
except ImportError:
    # Fallback if config client is not available
    logger = logging.getLogger()
    logger.warning("Configuration client not available, using default weights")
    ConfigurationClient = Nonefrom typing import Dict, List, Tuple, Set, Optional
import time

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# NAICS hierarchy and relationships
NAICS_HIERARCHY = {
    # Information Technology Services
    '541511': {
        'title': 'Custom Computer Programming Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5415',
        'related_codes': ['541512', '541513', '541519', '518210'],
        'government_friendly': True
    },
    '541512': {
        'title': 'Computer Systems Design Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5415',
        'related_codes': ['541511', '541513', '541519', '518210'],
        'government_friendly': True
    },
    '541513': {
        'title': 'Computer Facilities Management Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5415',
        'related_codes': ['541511', '541512', '541519', '518210'],
        'government_friendly': True
    },
    '541519': {
        'title': 'Other Computer Related Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5415',
        'related_codes': ['541511', '541512', '541513', '518210'],
        'government_friendly': True
    },

    # Professional Services - Engineering
    '541330': {
        'title': 'Engineering Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5413',
        'related_codes': ['541310', '541320', '541350', '541380'],
        'government_friendly': True
    },
    '541310': {
        'title': 'Architectural Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5413',
        'related_codes': ['541330', '541320', '541350'],
        'government_friendly': True
    },
    '541320': {
        'title': 'Landscape Architectural Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5413',
        'related_codes': ['541310', '541330', '541350'],
        'government_friendly': True
    },

    # Professional Services - Management Consulting
    '541611': {
        'title': 'Administrative Management and General Management Consulting Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5416',
        'related_codes': ['541612', '541613', '541614', '541618'],
        'government_friendly': True
    },
    '541612': {
        'title': 'Human Resources Consulting Services',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5416',
        'related_codes': ['541611', '541613', '541614', '541618'],
        'government_friendly': True
    },

    # Construction
    '236220': {
        'title': 'Commercial and Institutional Building Construction',
        'sector': '23',
        'subsector': '236',
        '4_digit': '2362',
        'related_codes': ['236210', '237310', '238'],
        'government_friendly': True
    },
    '237310': {
        'title': 'Highway, Street, and Bridge Construction',
        'sector': '23',
        'subsector': '237',
        '4_digit': '2373',
        'related_codes': ['237110', '237120', '237130'],
        'government_friendly': True
    },

    # Security Services
    '561612': {
        'title': 'Security Guards and Patrol Services',
        'sector': '56',
        'subsector': '561',
        '4_digit': '5616',
        'related_codes': ['561611', '561613', '561621'],
        'government_friendly': True
    },

    # Research and Development
    '541715': {
        'title': 'Research and Development in the Physical, Engineering, and Life Sciences',
        'sector': '54',
        'subsector': '541',
        '4_digit': '5417',
        'related_codes': ['541713', '541714', '541720'],
        'government_friendly': True
    },

    # Telecommunications
    '518210': {
        'title': 'Data Processing, Hosting, and Related Services',
        'sector': '51',
        'subsector': '518',
        '4_digit': '5182',
        'related_codes': ['541511', '541512', '541513'],
        'government_friendly': True
    },

    # Manufacturing - Defense Related
    '336411': {
        'title': 'Aircraft Manufacturing',
        'sector': '33',
        'subsector': '336',
        '4_digit': '3364',
        'related_codes': ['336412', '336413', '336414', '336415'],
        'government_friendly': True
    },

    # Transportation
    '481111': {
        'title': 'Scheduled Passenger Air Transportation',
        'sector': '48',
        'subsector': '481',
        '4_digit': '4811',
        'related_codes': ['481112', '481211', '481212'],
        'government_friendly': False
    }
}

# Common government contracting NAICS sectors
GOVERNMENT_SECTORS = {
    '23': 'Construction',
    '31': 'Manufacturing',
    '32': 'Manufacturing',
    '33': 'Manufacturing',
    '48': 'Transportation and Warehousing',
    '49': 'Transportation and Warehousing',
    '51': 'Information',
    '54': 'Professional, Scientific, and Technical Services',
    '56': 'Administrative and Support Services',
    '61': 'Educational Services',
    '62': 'Health Care and Social Assistance',
    '71': 'Arts, Entertainment, and Recreation',
    '81': 'Other Services'
}

# Set-aside program NAICS preferences
SET_ASIDE_NAICS_PREFERENCES = {
    'SBA': {  # Small Business Administration programs
        'preferred_sectors': ['54', '56', '23', '51'],
        'high_opportunity_codes': ['541511', '541512', '541330', '236220']
    },
    'WOSB': {  # Women-Owned Small Business
        'preferred_sectors': ['54', '56', '62'],
        'high_opportunity_codes': ['541611', '541612', '541513']
    },
    '8(a)': {  # 8(a) Business Development Program
        'preferred_sectors': ['54', '56', '23'],
        'high_opportunity_codes': ['541511', '541330', '561612']
    },
    'SDVOSB': {  # Service-Disabled Veteran-Owned Small Business
        'preferred_sectors': ['54', '56', '23'],
        'high_opportunity_codes': ['541511', '541330', '561612']
    },
    'HUBZone': {  # Historically Underutilized Business Zone
        'preferred_sectors': ['54', '23', '56'],
        'high_opportunity_codes': ['541330', '236220', '561612']
    }
}


class NAICSAlignmentScorer:
    """Production-ready NAICS code alignment scorer with government contracting expertise"""

    def __init__(self):
        self.naics_data = NAICS_HIERARCHY
        self.government_sectors = GOVERNMENT_SECTORS
        self.set_aside_preferences = SET_ASIDE_NAICS_PREFERENCES

    def calculate_naics_alignment(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """
        Calculate NAICS code alignment score between opportunity and company.

        Args:
            opportunity: Opportunity data with NAICS code
            company_profile: Company profile data with NAICS codes

        Returns:
            Dict containing NAICS alignment scores and analysis
        """
        start_time = time.time()

        try:
            # Extract NAICS codes
            opp_naics = self._extract_opportunity_naics(opportunity)
            company_naics_list = self._extract_company_naics(company_profile)

            if not opp_naics or not company_naics_list:
                logger.warning("Missing NAICS codes for alignment calculation")
                # Try industry-based fallback if possible
                fallback_score = self._calculate_industry_fallback(opportunity, company_profile)
                if fallback_score > 0:
                    return self._create_fallback_score(fallback_score, "Industry-based alignment")
                return self._create_empty_score()

            # Calculate alignment for each company NAICS against opportunity NAICS
            alignments = []
            for company_naics in company_naics_list:
                alignment = self._calculate_single_alignment(opp_naics, company_naics)
                alignments.append(alignment)

            # Determine best alignment
            best_alignment = max(alignments, key=lambda x: x['score'])

            # Calculate comprehensive scores
            scores = {
                'primary_alignment': best_alignment,
                'all_alignments': alignments,
                'overall_score': best_alignment['score'],
                'match_level': best_alignment['match_level'],
                'industry_compatibility': self._assess_industry_compatibility(opp_naics, company_naics_list),
                'set_aside_compatibility': self._assess_set_aside_compatibility(
                    opportunity, company_profile, opp_naics, company_naics_list
                ),
                'government_readiness': self._assess_government_readiness(company_naics_list),
                'diversification_analysis': self._analyze_naics_diversification(company_naics_list),
                'recommendations': self._generate_naics_recommendations(
                    opp_naics, company_naics_list, opportunity, company_profile
                )
            }

            # Performance metrics
            processing_time = time.time() - start_time
            scores['processing_time_ms'] = round(processing_time * 1000, 2)

            logger.info(f"NAICS alignment calculated in {processing_time:.3f}s")
            return scores

        except Exception as e:
            logger.error(f"Error calculating NAICS alignment: {str(e)}")
            return self._create_error_score(str(e))

    def _extract_opportunity_naics(self, opportunity: Dict) -> Optional[str]:
        """Extract NAICS code from opportunity"""
        try:
            # Try different field names that might contain NAICS
            naics_fields = ['NaicsCode', 'naics_code', 'NAICS', 'naics']

            for field in naics_fields:
                naics = opportunity.get(field)
                if naics:
                    # Clean and validate NAICS code
                    naics_str = str(naics).strip()
                    if naics_str and len(naics_str) >= 2:
                        return naics_str

            return None

        except Exception as e:
            logger.error(f"Error extracting opportunity NAICS: {str(e)}")
            return None

    def _extract_company_naics(self, company_profile: Dict) -> List[str]:
        """Extract NAICS codes from company profile"""
        try:
            naics_list = []

            # Try different field names
            naics_fields = ['naics_codes', 'NAICS', 'naics', 'primary_naics', 'secondary_naics']

            for field in naics_fields:
                naics_data = company_profile.get(field)
                if naics_data:
                    # Handle DynamoDB format
                    if isinstance(naics_data, dict) and 'L' in naics_data:
                        for item in naics_data['L']:
                            if isinstance(item, dict) and 'S' in item:
                                naics_str = str(item['S']).strip()
                                if naics_str and len(naics_str) >= 2:
                                    naics_list.append(naics_str)
                    elif isinstance(naics_data, list):
                        for naics in naics_data:
                            naics_str = str(naics).strip()
                            if naics_str and len(naics_str) >= 2:
                                naics_list.append(naics_str)
                    else:
                        naics_str = str(naics_data).strip()
                        if naics_str and len(naics_str) >= 2:
                            naics_list.append(naics_str)

            # Remove duplicates while preserving order
            seen = set()
            unique_naics = []
            for naics in naics_list:
                if naics not in seen:
                    seen.add(naics)
                    unique_naics.append(naics)

            return unique_naics

        except Exception as e:
            logger.error(f"Error extracting company NAICS: {str(e)}")
            return []

    def _calculate_single_alignment(self, opp_naics: str, company_naics: str) -> Dict:
        """Calculate alignment between single opportunity and company NAICS codes"""
        try:
            # Normalize NAICS codes (remove any non-numeric characters)
            opp_clean = ''.join(filter(str.isdigit, opp_naics))
            company_clean = ''.join(filter(str.isdigit, company_naics))

            if not opp_clean or not company_clean:
                return {'score': 0.0, 'match_level': 'no_match', 'details': 'Invalid NAICS codes'}

            # Exact match
            if opp_clean == company_clean:
                return {
                    'score': 1.0,
                    'match_level': 'exact',
                    'opportunity_naics': opp_naics,
                    'company_naics': company_naics,
                    'details': f'Exact NAICS match: {opp_clean}'
                }

            # 5-digit match (if both have 6 digits)
            if len(opp_clean) >= 5 and len(company_clean) >= 5:
                if opp_clean[:5] == company_clean[:5]:
                    return {
                        'score': 0.9,
                        'match_level': '5_digit',
                        'opportunity_naics': opp_naics,
                        'company_naics': company_naics,
                        'details': f'5-digit NAICS match: {opp_clean[:5]}'
                    }

            # 4-digit match
            if len(opp_clean) >= 4 and len(company_clean) >= 4:
                if opp_clean[:4] == company_clean[:4]:
                    return {
                        'score': 0.7,
                        'match_level': '4_digit',
                        'opportunity_naics': opp_naics,
                        'company_naics': company_naics,
                        'details': f'4-digit NAICS match: {opp_clean[:4]}'
                    }

            # 3-digit match (industry group)
            if len(opp_clean) >= 3 and len(company_clean) >= 3:
                if opp_clean[:3] == company_clean[:3]:
                    return {
                        'score': 0.4,
                        'match_level': '3_digit',
                        'opportunity_naics': opp_naics,
                        'company_naics': company_naics,
                        'details': f'3-digit NAICS match (industry group): {opp_clean[:3]}'
                    }

            # 2-digit match (sector)
            if len(opp_clean) >= 2 and len(company_clean) >= 2:
                if opp_clean[:2] == company_clean[:2]:
                    return {
                        'score': 0.2,
                        'match_level': '2_digit',
                        'opportunity_naics': opp_naics,
                        'company_naics': company_naics,
                        'details': f'2-digit NAICS match (sector): {opp_clean[:2]}'
                    }

            # Check for related codes
            related_score = self._check_related_naics(opp_clean, company_clean)
            if related_score > 0:
                return {
                    'score': related_score,
                    'match_level': 'related',
                    'opportunity_naics': opp_naics,
                    'company_naics': company_naics,
                    'details': f'Related NAICS codes identified'
                }

            # No match
            return {
                'score': 0.0,
                'match_level': 'no_match',
                'opportunity_naics': opp_naics,
                'company_naics': company_naics,
                'details': 'No NAICS alignment found'
            }

        except Exception as e:
            logger.error(f"Error calculating single alignment: {str(e)}")
            return {'score': 0.0, 'match_level': 'error', 'details': str(e)}

    def _check_related_naics(self, opp_naics: str, company_naics: str) -> float:
        """Check if NAICS codes are related through the hierarchy"""
        try:
            # Check if either NAICS is in our hierarchy data
            opp_data = self.naics_data.get(opp_naics)
            company_data = self.naics_data.get(company_naics)

            # If opportunity NAICS has related codes, check if company NAICS is in them
            if opp_data and 'related_codes' in opp_data:
                if company_naics in opp_data['related_codes']:
                    return 0.6  # Strong relationship

            # If company NAICS has related codes, check if opportunity NAICS is in them
            if company_data and 'related_codes' in company_data:
                if opp_naics in company_data['related_codes']:
                    return 0.6  # Strong relationship

            # Check for cross-sector relationships (e.g., IT services)
            it_codes = ['541511', '541512', '541513', '541519', '518210']
            if opp_naics in it_codes and company_naics in it_codes:
                return 0.5  # Moderate IT relationship

            # Check for professional services relationships
            prof_services = ['541611', '541612', '541613', '541330', '541310']
            if opp_naics in prof_services and company_naics in prof_services:
                return 0.4  # Moderate professional services relationship

            return 0.0

        except Exception as e:
            logger.error(f"Error checking related NAICS: {str(e)}")
            return 0.0

    def _assess_industry_compatibility(self, opp_naics: str, company_naics_list: List[str]) -> Dict:
        """Assess overall industry compatibility"""
        try:
            opp_clean = ''.join(filter(str.isdigit, opp_naics))
            opp_sector = opp_clean[:2] if len(opp_clean) >= 2 else ''

            company_sectors = []
            for naics in company_naics_list:
                clean_naics = ''.join(filter(str.isdigit, naics))
                if len(clean_naics) >= 2:
                    company_sectors.append(clean_naics[:2])

            # Remove duplicates
            unique_company_sectors = list(set(company_sectors))

            # Check sector alignment
            sector_match = opp_sector in unique_company_sectors

            # Assess government contracting compatibility
            opp_gov_friendly = opp_sector in self.government_sectors
            company_gov_sectors = [s for s in unique_company_sectors if s in self.government_sectors]
            gov_compatibility = len(company_gov_sectors) / len(unique_company_sectors) if unique_company_sectors else 0

            return {
                'sector_match': sector_match,
                'opportunity_sector': opp_sector,
                'opportunity_sector_name': self.government_sectors.get(opp_sector, 'Unknown'),
                'company_sectors': unique_company_sectors,
                'company_sector_names': [self.government_sectors.get(s, 'Unknown') for s in unique_company_sectors],
                'government_friendly': opp_gov_friendly,
                'government_compatibility_score': gov_compatibility,
                'diversification_score': min(1.0, len(unique_company_sectors) / 3.0)  # Normalize to 0-1
            }

        except Exception as e:
            logger.error(f"Error assessing industry compatibility: {str(e)}")
            return {}

    def _assess_set_aside_compatibility(self, opportunity: Dict, company_profile: Dict,
                                      opp_naics: str, company_naics_list: List[str]) -> Dict:
        """Assess compatibility with set-aside programs"""
        try:
            opp_set_aside = opportunity.get('SetASide', '').upper()
            company_certifications = company_profile.get('certifications', [])

            # Map certifications to set-aside programs
            cert_mapping = {
                '8(A)': '8(a)',
                'WOSB': 'WOSB',
                'SDVOSB': 'SDVOSB',
                'HUBZONE': 'HUBZone',
                'SMALL BUSINESS': 'SBA'
            }

            relevant_programs = []
            for cert in company_certifications:
                cert_upper = str(cert).upper()
                for key, program in cert_mapping.items():
                    if key in cert_upper:
                        relevant_programs.append(program)

            # Check NAICS compatibility with set-aside preferences
            compatibility_scores = {}
            for program in relevant_programs:
                if program in self.set_aside_preferences:
                    prefs = self.set_aside_preferences[program]

                    # Check sector preferences
                    opp_sector = opp_naics[:2] if len(opp_naics) >= 2 else ''
                    sector_score = 0.5 if opp_sector in prefs['preferred_sectors'] else 0.0

                    # Check high opportunity codes
                    code_score = 0.0
                    for naics in company_naics_list:
                        if naics in prefs['high_opportunity_codes']:
                            code_score = 1.0
                            break

                    compatibility_scores[program] = max(sector_score, code_score)

            return {
                'opportunity_set_aside': opp_set_aside,
                'company_certifications': company_certifications,
                'relevant_programs': relevant_programs,
                'compatibility_scores': compatibility_scores,
                'overall_compatibility': max(compatibility_scores.values()) if compatibility_scores else 0.0,
                'recommendations': self._generate_set_aside_recommendations(
                    opp_set_aside, company_certifications, compatibility_scores
                )
            }

        except Exception as e:
            logger.error(f"Error assessing set-aside compatibility: {str(e)}")
            return {}

    def _assess_government_readiness(self, company_naics_list: List[str]) -> Dict:
        """Assess company's readiness for government contracting based on NAICS"""
        try:
            gov_friendly_count = 0
            total_naics = len(company_naics_list)

            gov_friendly_codes = []
            for naics in company_naics_list:
                naics_info = self.naics_data.get(naics)
                if naics_info and naics_info.get('government_friendly', False):
                    gov_friendly_count += 1
                    gov_friendly_codes.append(naics)

            readiness_score = gov_friendly_count / total_naics if total_naics > 0 else 0.0

            return {
                'readiness_score': readiness_score,
                'government_friendly_codes': gov_friendly_codes,
                'government_friendly_count': gov_friendly_count,
                'total_naics_count': total_naics,
                'readiness_level': self._categorize_readiness(readiness_score)
            }

        except Exception as e:
            logger.error(f"Error assessing government readiness: {str(e)}")
            return {}

    def _analyze_naics_diversification(self, company_naics_list: List[str]) -> Dict:
        """Analyze NAICS diversification strategy"""
        try:
            if not company_naics_list:
                return {}

            # Group by sectors
            sector_groups = {}
            for naics in company_naics_list:
                clean_naics = ''.join(filter(str.isdigit, naics))
                sector = clean_naics[:2] if len(clean_naics) >= 2 else 'unknown'
                if sector not in sector_groups:
                    sector_groups[sector] = []
                sector_groups[sector].append(naics)

            # Analyze diversification
            num_sectors = len(sector_groups)
            diversification_score = min(1.0, num_sectors / 3.0)  # Optimal is 3+ sectors

            # Check for strategic combinations
            strategic_combinations = self._identify_strategic_combinations(sector_groups)

            return {
                'sector_count': num_sectors,
                'sector_distribution': sector_groups,
                'diversification_score': diversification_score,
                'diversification_level': self._categorize_diversification(diversification_score),
                'strategic_combinations': strategic_combinations,
                'recommendations': self._generate_diversification_recommendations(sector_groups)
            }

        except Exception as e:
            logger.error(f"Error analyzing NAICS diversification: {str(e)}")
            return {}

    def _identify_strategic_combinations(self, sector_groups: Dict) -> List[str]:
        """Identify strategic NAICS combinations"""
        try:
            combinations = []
            sectors = list(sector_groups.keys())

            # IT + Professional Services
            if '51' in sectors and '54' in sectors:
                combinations.append('IT + Professional Services (Strong government appeal)')

            # Construction + Engineering
            if '23' in sectors and '54' in sectors:
                combinations.append('Construction + Engineering (Full-service capability)')

            # Manufacturing + R&D
            if any(s in sectors for s in ['31', '32', '33']) and '54' in sectors:
                combinations.append('Manufacturing + R&D (Innovation-focused)')

            return combinations

        except Exception as e:
            return []

    def _generate_naics_recommendations(self, opp_naics: str, company_naics_list: List[str],
                                      opportunity: Dict, company_profile: Dict) -> List[str]:
        """Generate actionable NAICS-related recommendations"""
        try:
            recommendations = []

            # Get the best alignment
            alignments = [self._calculate_single_alignment(opp_naics, c_naics)
                         for c_naics in company_naics_list]
            best_alignment = max(alignments, key=lambda x: x['score']) if alignments else None

            if not best_alignment or best_alignment['score'] < 0.7:
                # Low alignment - suggest additions
                opp_clean = ''.join(filter(str.isdigit, opp_naics))
                opp_data = self.naics_data.get(opp_clean)

                if opp_data and 'related_codes' in opp_data:
                    missing_related = [code for code in opp_data['related_codes']
                                     if code not in company_naics_list]
                    if missing_related:
                        recommendations.append(f"Consider adding related NAICS codes: {', '.join(missing_related[:3])}")

                # Suggest primary NAICS alignment
                if best_alignment and best_alignment['score'] < 0.4:
                    recommendations.append(f"Consider adding primary NAICS {opp_naics} to improve alignment")

            # Set-aside specific recommendations
            opp_set_aside = opportunity.get('SetASide', '')
            if opp_set_aside and 'Small Business' in opp_set_aside:
                recommendations.append("Ensure NAICS codes align with small business size standards")

            # Government readiness recommendations
            gov_readiness = self._assess_government_readiness(company_naics_list)
            if gov_readiness.get('readiness_score', 0) < 0.5:
                recommendations.append("Consider focusing on government-friendly NAICS codes for better opportunities")

            return recommendations[:5]  # Limit to top 5

        except Exception as e:
            logger.error(f"Error generating NAICS recommendations: {str(e)}")
            return []

    def _generate_set_aside_recommendations(self, opp_set_aside: str,
                                          company_certifications: List[str],
                                          compatibility_scores: Dict) -> List[str]:
        """Generate set-aside specific recommendations"""
        try:
            recommendations = []

            if not compatibility_scores:
                if 'Small Business' in opp_set_aside:
                    recommendations.append("Obtain relevant small business certifications for this opportunity type")
                return recommendations

            # Find best compatibility
            best_program = max(compatibility_scores.items(), key=lambda x: x[1])

            if best_program[1] < 0.5:
                recommendations.append(f"Limited {best_program[0]} NAICS alignment - consider expanding into preferred sectors")

            return recommendations

        except Exception as e:
            return []

    def _generate_diversification_recommendations(self, sector_groups: Dict) -> List[str]:
        """Generate diversification recommendations"""
        try:
            recommendations = []

            if len(sector_groups) == 1:
                recommendations.append("Consider diversifying into related sectors to expand opportunities")
            elif len(sector_groups) > 5:
                recommendations.append("Consider focusing on core competency sectors to strengthen positioning")

            # Check for missing strategic sectors
            current_sectors = set(sector_groups.keys())
            if '54' not in current_sectors:
                recommendations.append("Consider adding Professional Services (54) NAICS for broader opportunities")
            if '51' not in current_sectors and any(s in current_sectors for s in ['54']):
                recommendations.append("Consider adding Information Technology (51) NAICS to complement professional services")

            return recommendations

        except Exception as e:
            return []

    def _categorize_readiness(self, score: float) -> str:
        """Categorize government readiness level"""
        if score >= 0.8:
            return 'High'
        elif score >= 0.5:
            return 'Medium'
        elif score >= 0.2:
            return 'Low'
        else:
            return 'Very Low'

    def _categorize_diversification(self, score: float) -> str:
        """Categorize diversification level"""
        if score >= 0.8:
            return 'Well Diversified'
        elif score >= 0.5:
            return 'Moderately Diversified'
        elif score >= 0.2:
            return 'Focused'
        else:
            return 'Highly Focused'

    def _create_empty_score(self) -> Dict:
        """Create empty NAICS alignment score structure"""
        return {
            'primary_alignment': {'score': 0.0, 'match_level': 'no_data'},
            'all_alignments': [],
            'overall_score': 0.0,
            'match_level': 'no_data',
            'industry_compatibility': {},
            'set_aside_compatibility': {},
            'government_readiness': {},
            'diversification_analysis': {},
            'recommendations': [],
            'processing_time_ms': 0.0,
            'status': 'no_naics_codes'
        }

    def _create_error_score(self, error_message: str) -> Dict:
        """Create error NAICS alignment score structure"""
        return {
            'primary_alignment': {'score': 0.0, 'match_level': 'error'},
            'all_alignments': [],
            'overall_score': 0.0,
            'match_level': 'error',
            'industry_compatibility': {},
            'set_aside_compatibility': {},
            'government_readiness': {},
            'diversification_analysis': {},
            'recommendations': [],
            'processing_time_ms': 0.0,
            'status': 'error',
            'error_message': error_message
        }

    def _calculate_industry_fallback(self, opportunity: Dict, company_profile: Dict) -> float:
        """Calculate industry-based alignment when NAICS codes are missing"""
        try:
            # Get opportunity description and title
            opp_text = ' '.join([
                opportunity.get('title', ''),
                opportunity.get('description', '')
            ]).upper()

            # Get company industry and capability statement
            company_industry = company_profile.get('industry', '').upper()
            capability_statement = company_profile.get('capability_statement', '').upper()

            # Healthcare-related keywords
            healthcare_keywords = ['MEDICAL', 'HEALTHCARE', 'HOSPITAL', 'HEALTH', 'PACS', 'PATIENT', 'CLINICAL']

            # IT-related keywords
            it_keywords = ['SOFTWARE', 'SYSTEM', 'NETWORK', 'DATABASE', 'COMPUTER', 'TECHNOLOGY', 'IT']

            # Manufacturing keywords
            manufacturing_keywords = ['AIRCRAFT', 'CYLINDER', 'ASSEMBLY', 'COMPONENT', 'PART', 'MANUFACTURING']

            # Check for healthcare alignment
            opp_is_healthcare = any(keyword in opp_text for keyword in healthcare_keywords)
            company_is_healthcare = (
                any(keyword in company_industry for keyword in healthcare_keywords) or
                any(keyword in capability_statement for keyword in healthcare_keywords)
            )

            if opp_is_healthcare and company_is_healthcare:
                return 0.6  # Good industry match

            # Check for IT alignment
            opp_is_it = any(keyword in opp_text for keyword in it_keywords)
            company_is_it = (
                any(keyword in company_industry for keyword in it_keywords) or
                any(keyword in capability_statement for keyword in it_keywords)
            )

            if opp_is_it and company_is_it:
                return 0.5  # Moderate industry match

            # Check for mismatches (healthcare vs manufacturing)
            opp_is_manufacturing = any(keyword in opp_text for keyword in manufacturing_keywords)

            if company_is_healthcare and opp_is_manufacturing:
                return 0.0  # Clear mismatch

            # Default to low but non-zero score if no clear mismatch
            return 0.2

        except Exception as e:
            logger.error(f"Error calculating industry fallback: {str(e)}")
            return 0.0

    def _create_fallback_score(self, score: float, reason: str) -> Dict:
        """Create fallback NAICS alignment score structure"""
        return {
            'primary_alignment': {'score': score, 'match_level': 'industry_fallback', 'details': reason},
            'all_alignments': [],
            'overall_score': score,
            'match_level': 'industry_fallback',
            'industry_compatibility': {},
            'set_aside_compatibility': {},
            'government_readiness': {},
            'diversification_analysis': {},
            'recommendations': [f"Industry-based alignment used due to missing NAICS codes"],
            'processing_time_ms': 0.0,
            'status': 'fallback_used'
        }


# Initialize the scorer
naics_scorer = NAICSAlignmentScorer()


def lambda_handler(event, context):
    """
    AWS Lambda handler for NAICS alignment scoring

    Expected event format:
    {
        "opportunity": {...},
        "company_profile": {...}
    }
    """
    try:
        logger.info("Starting NAICS alignment calculation")

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

        # Calculate NAICS alignment
        naics_result = naics_scorer.calculate_naics_alignment(
            opportunity, company_profile
        )

        # Extract tenant_id from company profile for configuration
        tenant_id = company_profile.get('tenant_id')

        # Get dynamic weight from configuration
        if ConfigurationClient:
            try:
                config_client = ConfigurationClient()
                weight = config_client.get_weight_for_component('naics_alignment', tenant_id)
            except Exception as e:
                logger.warning(f"Failed to get dynamic weight, using default: {str(e)}")
                weight = 0.15
        else:
            weight = 0.15

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'naics_score': naics_result,
                'component': 'naics_alignment',
                'weight': weight,
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
        'notice_id': 'TEST-001',
        'NaicsCode': '541511',
        'title': 'Software Development Services',
        'SetASide': 'Total Small Business'
    }

    test_company = {
        'company_id': 'TEST-COMPANY-001',
        'naics_codes': ['541511', '541512', '541330'],
        'certifications': ['8(a)', 'WOSB', 'Small Business']
    }

    # Test the function
    test_event = {
        'opportunity': test_opportunity,
        'company_profile': test_company
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))