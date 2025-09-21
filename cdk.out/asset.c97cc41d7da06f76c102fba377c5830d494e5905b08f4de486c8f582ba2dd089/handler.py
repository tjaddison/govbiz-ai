"""
GovBizAI Keyword Matching Algorithm
Phase 7: Matching Engine

This Lambda function performs keyword matching between opportunities and company profiles
using TF-IDF scoring, exact match bonuses, and acronym handling.

Key Features:
- TF-IDF vectorization for semantic keyword matching
- Exact match detection with bonus scoring
- Acronym expansion and matching
- Domain-specific term weighting (government contracting)
- Optimized for sub-second performance
"""

import json
import boto3
import re
import logging
from typing import Dict, List, Tuple, Set, Optional
from collections import Counter, defaultdict
import math
import time
from concurrent.futures import ThreadPoolExecutor

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Domain-specific configurations
GOVERNMENT_ACRONYMS = {
    'GSA': 'General Services Administration',
    'DOD': 'Department of Defense',
    'VA': 'Veterans Affairs',
    'DHS': 'Department of Homeland Security',
    'DOE': 'Department of Energy',
    'NASA': 'National Aeronautics and Space Administration',
    'NIST': 'National Institute of Standards and Technology',
    'FEMA': 'Federal Emergency Management Agency',
    'IT': 'Information Technology',
    'HVAC': 'Heating Ventilation Air Conditioning',
    'O&M': 'Operations and Maintenance',
    'R&D': 'Research and Development',
    'A&E': 'Architecture and Engineering',
    'PM': 'Program Management',
    'QA': 'Quality Assurance',
    'QC': 'Quality Control',
    'SOW': 'Statement of Work',
    'RFP': 'Request for Proposal',
    'IDIQ': 'Indefinite Delivery Indefinite Quantity',
    'PWS': 'Performance Work Statement',
    'COTS': 'Commercial Off The Shelf',
    'GOTS': 'Government Off The Shelf',
    'SLA': 'Service Level Agreement',
    'KPP': 'Key Performance Parameter',
    'CPARS': 'Contractor Performance Assessment Reporting System'
}

# High-value keywords in government contracting
HIGH_VALUE_KEYWORDS = {
    'cybersecurity', 'security', 'compliance', 'audit', 'risk', 'governance',
    'cloud', 'migration', 'modernization', 'digital', 'transformation',
    'agile', 'devops', 'automation', 'integration', 'interoperability',
    'sustainability', 'green', 'renewable', 'efficiency', 'optimization',
    'training', 'support', 'maintenance', 'operations', 'management',
    'analysis', 'research', 'development', 'innovation', 'technology',
    'federal', 'government', 'agency', 'department', 'bureau',
    'contract', 'procurement', 'acquisition', 'solicitation', 'proposal'
}

# Stop words specific to government documents
CUSTOM_STOP_WORDS = {
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'among', 'within', 'without',
    'shall', 'will', 'may', 'must', 'should', 'would', 'could', 'can',
    'contractor', 'government', 'federal', 'agency', 'department',
    'requirement', 'requirements', 'provide', 'provides', 'providing',
    'include', 'includes', 'including', 'ensure', 'ensures', 'ensuring'
}


class KeywordMatcher:
    """Production-ready keyword matching with TF-IDF and domain expertise"""

    def __init__(self):
        self.document_frequencies = {}
        self.total_documents = 0
        self.acronym_map = GOVERNMENT_ACRONYMS.copy()
        self.high_value_terms = HIGH_VALUE_KEYWORDS.copy()

    def calculate_keyword_score(self, opportunity: Dict, company_profile: Dict) -> Dict:
        """
        Calculate comprehensive keyword matching score between opportunity and company.

        Args:
            opportunity: Opportunity data with text content
            company_profile: Company profile data with text content

        Returns:
            Dict containing keyword matching scores and analysis
        """
        start_time = time.time()

        try:
            # Extract and process text from both entities
            opp_text = self._extract_opportunity_text(opportunity)
            company_text = self._extract_company_text(company_profile)

            if not opp_text or not company_text:
                logger.warning("Missing text content for keyword matching")
                return self._create_empty_score()

            # Process and vectorize text
            opp_processed = self._preprocess_text(opp_text)
            company_processed = self._preprocess_text(company_text)

            # Calculate TF-IDF vectors
            opp_tfidf = self._calculate_tfidf(opp_processed['tokens'])
            company_tfidf = self._calculate_tfidf(company_processed['tokens'])

            # Calculate various matching scores
            scores = {
                'tfidf_similarity': self._calculate_tfidf_similarity(opp_tfidf, company_tfidf),
                'exact_matches': self._find_exact_matches(opp_processed, company_processed),
                'acronym_matches': self._find_acronym_matches(opp_processed, company_processed),
                'high_value_matches': self._find_high_value_matches(opp_processed, company_processed),
                'phrase_matches': self._find_phrase_matches(opp_text, company_text),
                'overall_score': 0.0,
                'match_details': {}
            }

            # Calculate weighted overall score
            scores['overall_score'] = self._calculate_overall_keyword_score(scores)

            # Add detailed match information
            scores['match_details'] = self._create_match_details(
                scores, opp_processed, company_processed
            )

            # Performance metrics
            processing_time = time.time() - start_time
            scores['processing_time_ms'] = round(processing_time * 1000, 2)

            logger.info(f"Keyword matching calculated in {processing_time:.3f}s")
            return scores

        except Exception as e:
            logger.error(f"Error calculating keyword score: {str(e)}")
            return self._create_error_score(str(e))

    def _extract_opportunity_text(self, opportunity: Dict) -> str:
        """Extract relevant text from opportunity"""
        try:
            text_parts = []

            # High priority fields
            for field in ['title', 'description']:
                value = opportunity.get(field, '')
                if value:
                    text_parts.append(value)

            # Medium priority fields
            for field in ['Sol#', 'Office', 'SetASide', 'Type']:
                value = opportunity.get(field, '')
                if value:
                    text_parts.append(value)

            # Attachments content if available
            attachments_text = opportunity.get('attachments_text', '')
            if attachments_text:
                text_parts.append(attachments_text)

            return ' '.join(text_parts)

        except Exception as e:
            logger.error(f"Error extracting opportunity text: {str(e)}")
            return ''

    def _extract_company_text(self, company_profile: Dict) -> str:
        """Extract relevant text from company profile"""
        try:
            text_parts = []

            # Company basic info
            for field in ['company_name', 'capability_statement']:
                value = company_profile.get(field, '')
                if value:
                    text_parts.append(value)

            # Certifications and capabilities
            certifications = company_profile.get('certifications', [])
            if certifications:
                text_parts.append(' '.join(certifications))

            # Document contents if available
            documents = company_profile.get('documents_text', {})
            for doc_type, content in documents.items():
                if content:
                    text_parts.append(content)

            # Past performance descriptions
            past_performance = company_profile.get('past_performance', [])
            for performance in past_performance:
                description = performance.get('description', '')
                if description:
                    text_parts.append(description)

            return ' '.join(text_parts)

        except Exception as e:
            logger.error(f"Error extracting company text: {str(e)}")
            return ''

    def _preprocess_text(self, text: str) -> Dict:
        """Preprocess text for keyword matching"""
        try:
            if not text:
                return {'tokens': [], 'phrases': [], 'original_text': ''}

            # Store original for phrase matching
            original_text = text

            # Convert to lowercase
            text = text.lower()

            # Expand acronyms before tokenization
            expanded_text = self._expand_acronyms(text)

            # Extract phrases before tokenization
            phrases = self._extract_phrases(expanded_text)

            # Tokenization
            tokens = re.findall(r'\b[a-zA-Z]+\b', expanded_text)

            # Remove stop words
            tokens = [token for token in tokens if token not in CUSTOM_STOP_WORDS]

            # Remove very short tokens
            tokens = [token for token in tokens if len(token) > 2]

            # Stemming/normalization for government terms
            normalized_tokens = [self._normalize_government_term(token) for token in tokens]

            return {
                'tokens': normalized_tokens,
                'phrases': phrases,
                'original_text': original_text,
                'expanded_text': expanded_text
            }

        except Exception as e:
            logger.error(f"Error preprocessing text: {str(e)}")
            return {'tokens': [], 'phrases': [], 'original_text': ''}

    def _expand_acronyms(self, text: str) -> str:
        """Expand known acronyms in text"""
        try:
            expanded_text = text
            for acronym, expansion in self.acronym_map.items():
                # Look for standalone acronyms (word boundaries)
                pattern = r'\b' + re.escape(acronym.lower()) + r'\b'
                replacement = f"{acronym.lower()} {expansion.lower()}"
                expanded_text = re.sub(pattern, replacement, expanded_text)

            return expanded_text

        except Exception as e:
            logger.error(f"Error expanding acronyms: {str(e)}")
            return text

    def _extract_phrases(self, text: str) -> List[str]:
        """Extract meaningful phrases (2-4 word combinations)"""
        try:
            # Simple n-gram extraction
            words = text.split()
            phrases = []

            # Extract 2-grams and 3-grams
            for n in [2, 3]:
                for i in range(len(words) - n + 1):
                    phrase = ' '.join(words[i:i+n])
                    if self._is_meaningful_phrase(phrase):
                        phrases.append(phrase)

            return phrases

        except Exception as e:
            logger.error(f"Error extracting phrases: {str(e)}")
            return []

    def _is_meaningful_phrase(self, phrase: str) -> bool:
        """Check if a phrase is meaningful for matching"""
        try:
            # Skip phrases that are mostly stop words
            words = phrase.split()
            stop_word_count = sum(1 for word in words if word in CUSTOM_STOP_WORDS)

            if stop_word_count >= len(words) * 0.7:  # 70% or more stop words
                return False

            # Include phrases with high-value terms
            if any(term in phrase for term in self.high_value_terms):
                return True

            # Include technical phrases
            technical_indicators = ['system', 'service', 'solution', 'management', 'support']
            if any(indicator in phrase for indicator in technical_indicators):
                return True

            return len(words) >= 2 and len(phrase) >= 6

        except Exception as e:
            return False

    def _normalize_government_term(self, term: str) -> str:
        """Normalize government-specific terms"""
        try:
            # Handle plural forms
            if term.endswith('s') and len(term) > 4:
                singular = term[:-1]
                if singular in self.high_value_terms:
                    return singular

            # Handle common variations
            variations = {
                'programme': 'program',
                'colour': 'color',
                'centre': 'center',
                'defence': 'defense',
                'analyse': 'analyze',
                'optimise': 'optimize',
                'realise': 'realize'
            }

            return variations.get(term, term)

        except Exception as e:
            return term

    def _calculate_tfidf(self, tokens: List[str]) -> Dict[str, float]:
        """Calculate TF-IDF scores for tokens"""
        try:
            if not tokens:
                return {}

            # Calculate term frequency
            token_counts = Counter(tokens)
            total_tokens = len(tokens)
            tf_scores = {token: count / total_tokens for token, count in token_counts.items()}

            # For simplicity, use log normalization for IDF
            # In production, you'd maintain document frequency statistics
            tfidf_scores = {}
            for token, tf in tf_scores.items():
                # Simple IDF approximation - boost rare terms
                idf = math.log(1 + (1 / (tf + 0.01)))
                tfidf_scores[token] = tf * idf

                # Boost high-value terms
                if token in self.high_value_terms:
                    tfidf_scores[token] *= 1.5

            return tfidf_scores

        except Exception as e:
            logger.error(f"Error calculating TF-IDF: {str(e)}")
            return {}

    def _calculate_tfidf_similarity(self, opp_tfidf: Dict, company_tfidf: Dict) -> float:
        """Calculate cosine similarity between TF-IDF vectors"""
        try:
            if not opp_tfidf or not company_tfidf:
                return 0.0

            # Get all unique terms
            all_terms = set(opp_tfidf.keys()) | set(company_tfidf.keys())

            # Calculate dot product and norms
            dot_product = 0.0
            opp_norm = 0.0
            company_norm = 0.0

            for term in all_terms:
                opp_score = opp_tfidf.get(term, 0.0)
                company_score = company_tfidf.get(term, 0.0)

                dot_product += opp_score * company_score
                opp_norm += opp_score ** 2
                company_norm += company_score ** 2

            # Calculate cosine similarity
            if opp_norm == 0 or company_norm == 0:
                return 0.0

            similarity = dot_product / (math.sqrt(opp_norm) * math.sqrt(company_norm))
            return max(0.0, similarity)  # Ensure non-negative

        except Exception as e:
            logger.error(f"Error calculating TF-IDF similarity: {str(e)}")
            return 0.0

    def _find_exact_matches(self, opp_processed: Dict, company_processed: Dict) -> Dict:
        """Find exact token matches with bonus scoring"""
        try:
            opp_tokens = set(opp_processed['tokens'])
            company_tokens = set(company_processed['tokens'])

            # Find common tokens
            exact_matches = opp_tokens & company_tokens

            # Calculate match statistics
            total_opp_tokens = len(opp_tokens)
            total_company_tokens = len(company_tokens)
            match_count = len(exact_matches)

            if total_opp_tokens == 0 or total_company_tokens == 0:
                return {'score': 0.0, 'matches': [], 'coverage': 0.0}

            # Calculate coverage scores
            opp_coverage = match_count / total_opp_tokens
            company_coverage = match_count / total_company_tokens
            overall_coverage = (opp_coverage + company_coverage) / 2

            # Bonus for high-value term matches
            high_value_matches = [match for match in exact_matches if match in self.high_value_terms]
            bonus_score = len(high_value_matches) * 0.1  # 10% bonus per high-value match

            # Calculate final score
            base_score = min(1.0, overall_coverage * 2)  # Scale coverage
            final_score = min(1.0, base_score + bonus_score)

            return {
                'score': final_score,
                'matches': list(exact_matches),
                'high_value_matches': high_value_matches,
                'coverage': overall_coverage,
                'match_count': match_count,
                'bonus_score': bonus_score
            }

        except Exception as e:
            logger.error(f"Error finding exact matches: {str(e)}")
            return {'score': 0.0, 'matches': [], 'coverage': 0.0}

    def _find_acronym_matches(self, opp_processed: Dict, company_processed: Dict) -> Dict:
        """Find acronym matches with expansion consideration"""
        try:
            opp_text = opp_processed['original_text'].upper()
            company_text = company_processed['original_text'].upper()

            acronym_matches = []
            match_score = 0.0

            for acronym, expansion in self.acronym_map.items():
                opp_has_acronym = acronym in opp_text
                opp_has_expansion = expansion.upper() in opp_text
                company_has_acronym = acronym in company_text
                company_has_expansion = expansion.upper() in company_text

                # Check for matches (acronym to expansion or vice versa)
                if (opp_has_acronym or opp_has_expansion) and (company_has_acronym or company_has_expansion):
                    acronym_matches.append({
                        'acronym': acronym,
                        'expansion': expansion,
                        'opp_has_acronym': opp_has_acronym,
                        'opp_has_expansion': opp_has_expansion,
                        'company_has_acronym': company_has_acronym,
                        'company_has_expansion': company_has_expansion
                    })
                    match_score += 0.2  # 20% per acronym match

            final_score = min(1.0, match_score)

            return {
                'score': final_score,
                'matches': acronym_matches,
                'match_count': len(acronym_matches)
            }

        except Exception as e:
            logger.error(f"Error finding acronym matches: {str(e)}")
            return {'score': 0.0, 'matches': [], 'match_count': 0}

    def _find_high_value_matches(self, opp_processed: Dict, company_processed: Dict) -> Dict:
        """Find matches of high-value government contracting terms"""
        try:
            opp_tokens = set(opp_processed['tokens'])
            company_tokens = set(company_processed['tokens'])

            # Find high-value term matches
            opp_high_value = opp_tokens & self.high_value_terms
            company_high_value = company_tokens & self.high_value_terms
            high_value_matches = opp_high_value & company_high_value

            if not high_value_matches:
                return {'score': 0.0, 'matches': [], 'coverage': 0.0}

            # Calculate coverage of high-value terms
            total_high_value_in_opp = len(opp_high_value)
            total_high_value_in_company = len(company_high_value)
            match_count = len(high_value_matches)

            if total_high_value_in_opp == 0 or total_high_value_in_company == 0:
                coverage = 0.0
            else:
                opp_coverage = match_count / total_high_value_in_opp
                company_coverage = match_count / total_high_value_in_company
                coverage = (opp_coverage + company_coverage) / 2

            # Score based on match count and coverage
            base_score = min(1.0, match_count * 0.3)  # 30% per high-value match
            coverage_bonus = coverage * 0.5  # 50% bonus for good coverage
            final_score = min(1.0, base_score + coverage_bonus)

            return {
                'score': final_score,
                'matches': list(high_value_matches),
                'coverage': coverage,
                'match_count': match_count,
                'opp_high_value_count': total_high_value_in_opp,
                'company_high_value_count': total_high_value_in_company
            }

        except Exception as e:
            logger.error(f"Error finding high-value matches: {str(e)}")
            return {'score': 0.0, 'matches': [], 'coverage': 0.0}

    def _find_phrase_matches(self, opp_text: str, company_text: str) -> Dict:
        """Find matching phrases between opportunity and company"""
        try:
            opp_text_lower = opp_text.lower()
            company_text_lower = company_text.lower()

            # Extract technical phrases from both texts
            opp_phrases = self._extract_technical_phrases(opp_text_lower)
            company_phrases = self._extract_technical_phrases(company_text_lower)

            # Find exact phrase matches
            phrase_matches = []
            for opp_phrase in opp_phrases:
                for company_phrase in company_phrases:
                    if opp_phrase == company_phrase and len(opp_phrase) > 10:  # Minimum length
                        phrase_matches.append(opp_phrase)

            # Remove duplicates
            phrase_matches = list(set(phrase_matches))

            # Calculate score
            base_score = min(1.0, len(phrase_matches) * 0.4)  # 40% per phrase match

            return {
                'score': base_score,
                'matches': phrase_matches,
                'match_count': len(phrase_matches)
            }

        except Exception as e:
            logger.error(f"Error finding phrase matches: {str(e)}")
            return {'score': 0.0, 'matches': [], 'match_count': 0}

    def _extract_technical_phrases(self, text: str) -> List[str]:
        """Extract technical phrases from text"""
        try:
            # Look for phrases with technical keywords
            technical_keywords = [
                'system', 'service', 'solution', 'platform', 'application',
                'network', 'security', 'management', 'support', 'maintenance',
                'development', 'implementation', 'integration', 'operation'
            ]

            phrases = []
            sentences = re.split(r'[.!?]+', text)

            for sentence in sentences:
                # Look for phrases containing technical keywords
                for keyword in technical_keywords:
                    if keyword in sentence:
                        # Extract phrases around the keyword
                        words = sentence.split()
                        for i, word in enumerate(words):
                            if keyword in word:
                                # Extract 3-5 word phrases around the keyword
                                start = max(0, i - 2)
                                end = min(len(words), i + 3)
                                phrase = ' '.join(words[start:end]).strip()
                                if len(phrase) > 10:  # Minimum phrase length
                                    phrases.append(phrase)

            return phrases

        except Exception as e:
            return []

    def _calculate_overall_keyword_score(self, scores: Dict) -> float:
        """Calculate weighted overall keyword matching score"""
        try:
            weights = {
                'tfidf_similarity': 0.35,
                'exact_matches': 0.25,
                'high_value_matches': 0.20,
                'acronym_matches': 0.10,
                'phrase_matches': 0.10
            }

            overall_score = 0.0
            for component, weight in weights.items():
                component_score = scores.get(component, {})
                if isinstance(component_score, dict):
                    score_value = component_score.get('score', 0.0)
                else:
                    score_value = component_score

                overall_score += score_value * weight

            return round(overall_score, 4)

        except Exception as e:
            logger.error(f"Error calculating overall keyword score: {str(e)}")
            return 0.0

    def _create_match_details(self, scores: Dict, opp_processed: Dict, company_processed: Dict) -> Dict:
        """Create detailed match information"""
        try:
            return {
                'exact_match_details': {
                    'matches': scores.get('exact_matches', {}).get('matches', []),
                    'high_value_matches': scores.get('exact_matches', {}).get('high_value_matches', []),
                    'coverage': scores.get('exact_matches', {}).get('coverage', 0.0)
                },
                'acronym_match_details': {
                    'matches': scores.get('acronym_matches', {}).get('matches', []),
                    'count': scores.get('acronym_matches', {}).get('match_count', 0)
                },
                'phrase_match_details': {
                    'matches': scores.get('phrase_matches', {}).get('matches', []),
                    'count': scores.get('phrase_matches', {}).get('match_count', 0)
                },
                'vocabulary_stats': {
                    'opportunity_terms': len(set(opp_processed.get('tokens', []))),
                    'company_terms': len(set(company_processed.get('tokens', []))),
                    'shared_terms': len(set(opp_processed.get('tokens', [])) & set(company_processed.get('tokens', [])))
                }
            }

        except Exception as e:
            logger.error(f"Error creating match details: {str(e)}")
            return {}

    def _create_empty_score(self) -> Dict:
        """Create empty keyword score structure"""
        return {
            'tfidf_similarity': 0.0,
            'exact_matches': {'score': 0.0, 'matches': [], 'coverage': 0.0},
            'acronym_matches': {'score': 0.0, 'matches': [], 'match_count': 0},
            'high_value_matches': {'score': 0.0, 'matches': [], 'coverage': 0.0},
            'phrase_matches': {'score': 0.0, 'matches': [], 'match_count': 0},
            'overall_score': 0.0,
            'match_details': {},
            'processing_time_ms': 0.0,
            'status': 'no_text_content'
        }

    def _create_error_score(self, error_message: str) -> Dict:
        """Create error keyword score structure"""
        return {
            'tfidf_similarity': 0.0,
            'exact_matches': {'score': 0.0, 'matches': [], 'coverage': 0.0},
            'acronym_matches': {'score': 0.0, 'matches': [], 'match_count': 0},
            'high_value_matches': {'score': 0.0, 'matches': [], 'coverage': 0.0},
            'phrase_matches': {'score': 0.0, 'matches': [], 'match_count': 0},
            'overall_score': 0.0,
            'match_details': {},
            'processing_time_ms': 0.0,
            'status': 'error',
            'error_message': error_message
        }


# Initialize the matcher
keyword_matcher = KeywordMatcher()


def lambda_handler(event, context):
    """
    AWS Lambda handler for keyword matching

    Expected event format:
    {
        "opportunity": {...},
        "company_profile": {...}
    }
    """
    try:
        logger.info("Starting keyword matching calculation")

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

        # Calculate keyword matching score
        keyword_result = keyword_matcher.calculate_keyword_score(
            opportunity, company_profile
        )

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'keyword_score': keyword_result,
                'component': 'keyword_matching',
                'weight': 0.15,
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
        'posted_date': '2024-01-15',
        'title': 'Cybersecurity Services for IT Infrastructure',
        'description': 'The General Services Administration (GSA) requires comprehensive cybersecurity services including network security, vulnerability assessment, and compliance management for federal IT systems.',
        'Sol#': 'TEST-SOL-001',
        'Office': 'General Services Administration',
        'SetASide': 'Small Business',
        'Type': 'Services'
    }

    test_company = {
        'company_id': 'TEST-COMPANY-001',
        'tenant_id': 'TEST-TENANT',
        'company_name': 'SecureIT Solutions Inc.',
        'capability_statement': 'We specialize in cybersecurity services for government agencies, providing network security, vulnerability assessments, and compliance management solutions. Our team has extensive experience with GSA requirements and federal IT systems.',
        'certifications': ['Security Clearance', 'ISO 27001', 'NIST Compliance'],
        'past_performance': [
            {
                'description': 'Provided cybersecurity services for Department of Defense including network security and compliance management.'
            }
        ]
    }

    # Test the function
    test_event = {
        'opportunity': test_opportunity,
        'company_profile': test_company
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))