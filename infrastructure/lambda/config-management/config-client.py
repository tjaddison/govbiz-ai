"""
GovBizAI Configuration Client
Shared client for retrieving dynamic configuration values from the weight configuration system.

This module provides a centralized way for matching engine components to:
- Retrieve current weights and confidence levels
- Cache configuration for performance
- Handle configuration changes and cache invalidation
- Provide fallback defaults if configuration is unavailable

Usage in matching engine components:
    from config_client import ConfigurationClient

    config_client = ConfigurationClient()
    weights = config_client.get_weights(tenant_id='optional')
    confidence_levels = config_client.get_confidence_levels(tenant_id='optional')
"""

import json
import boto3
import logging
import time
from typing import Dict, Any, Optional
from decimal import Decimal
from datetime import datetime, timezone

# Configure logging
logger = logging.getLogger(__name__)

# Configuration cache
_config_cache = {}
_cache_ttl = 300  # 5 minutes default TTL


class ConfigurationClient:
    """Client for retrieving dynamic configuration from DynamoDB"""

    def __init__(self, config_table_name: str = 'govbizai-weight-configuration'):
        self.config_table_name = config_table_name
        self.dynamodb = boto3.resource('dynamodb')
        self.config_table = self.dynamodb.Table(config_table_name)

        # Default values as fallback
        self.default_weights = {
            'semantic_similarity': 0.25,
            'keyword_matching': 0.15,
            'naics_alignment': 0.15,
            'past_performance': 0.20,
            'certification_bonus': 0.10,
            'geographic_match': 0.05,
            'capacity_fit': 0.05,
            'recency_factor': 0.05
        }

        self.default_confidence_levels = {
            'high_threshold': 0.75,
            'medium_threshold': 0.50,
            'low_threshold': 0.25
        }

        self.default_algorithm_params = {
            'cache_ttl_hours': 24,
            'min_score_threshold': 0.10,
            'max_concurrent_matches': 100,
            'semantic_similarity_threshold': 0.30
        }

    def get_weights(self, tenant_id: Optional[str] = None) -> Dict[str, float]:
        """
        Get current matching weights for a tenant or global.

        Args:
            tenant_id: Optional tenant ID for tenant-specific weights

        Returns:
            Dictionary of component weights
        """
        try:
            config = self._get_configuration(tenant_id)
            weights = config.get('weights', self.default_weights)

            # Convert Decimal values to float for use in calculations
            return {component: float(weight) for component, weight in weights.items()}

        except Exception as e:
            logger.error(f"Error getting weights: {str(e)}")
            return self.default_weights.copy()

    def get_confidence_levels(self, tenant_id: Optional[str] = None) -> Dict[str, float]:
        """
        Get current confidence level thresholds for a tenant or global.

        Args:
            tenant_id: Optional tenant ID for tenant-specific levels

        Returns:
            Dictionary of confidence level thresholds
        """
        try:
            config = self._get_configuration(tenant_id)
            levels = config.get('confidence_levels', self.default_confidence_levels)

            # Convert Decimal values to float for use in calculations
            return {level: float(threshold) for level, threshold in levels.items()}

        except Exception as e:
            logger.error(f"Error getting confidence levels: {str(e)}")
            return self.default_confidence_levels.copy()

    def get_algorithm_params(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get current algorithm parameters for a tenant or global.

        Args:
            tenant_id: Optional tenant ID for tenant-specific parameters

        Returns:
            Dictionary of algorithm parameters
        """
        try:
            config = self._get_configuration(tenant_id)
            params = config.get('algorithm_params', self.default_algorithm_params)

            # Convert Decimal values where appropriate
            result = {}
            for key, value in params.items():
                if isinstance(value, Decimal):
                    result[key] = float(value)
                else:
                    result[key] = value

            return result

        except Exception as e:
            logger.error(f"Error getting algorithm parameters: {str(e)}")
            return self.default_algorithm_params.copy()

    def get_weight_for_component(self, component: str, tenant_id: Optional[str] = None) -> float:
        """
        Get weight for a specific matching component.

        Args:
            component: Name of the matching component
            tenant_id: Optional tenant ID

        Returns:
            Weight value for the component
        """
        try:
            weights = self.get_weights(tenant_id)
            return weights.get(component, self.default_weights.get(component, 0.0))

        except Exception as e:
            logger.error(f"Error getting weight for component {component}: {str(e)}")
            return self.default_weights.get(component, 0.0)

    def calculate_confidence_level(self, total_score: float, tenant_id: Optional[str] = None) -> str:
        """
        Calculate confidence level based on total score and configured thresholds.

        Args:
            total_score: Total matching score (0.0 to 1.0)
            tenant_id: Optional tenant ID

        Returns:
            Confidence level ('HIGH', 'MEDIUM', 'LOW')
        """
        try:
            levels = self.get_confidence_levels(tenant_id)

            if total_score >= levels['high_threshold']:
                return 'HIGH'
            elif total_score >= levels['medium_threshold']:
                return 'MEDIUM'
            elif total_score >= levels['low_threshold']:
                return 'LOW'
            else:
                return 'NONE'

        except Exception as e:
            logger.error(f"Error calculating confidence level: {str(e)}")
            # Fallback to default thresholds
            if total_score >= 0.75:
                return 'HIGH'
            elif total_score >= 0.50:
                return 'MEDIUM'
            elif total_score >= 0.25:
                return 'LOW'
            else:
                return 'NONE'

    def _get_configuration(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get configuration with caching.

        Args:
            tenant_id: Optional tenant ID

        Returns:
            Complete configuration dictionary
        """
        try:
            # Create cache key
            cache_key = f"config_{tenant_id or 'global'}"
            current_time = time.time()

            # Check cache first
            if cache_key in _config_cache:
                cached_data = _config_cache[cache_key]
                if current_time - cached_data['timestamp'] < _cache_ttl:
                    return cached_data['config']

            # Fetch from DynamoDB
            config = self._fetch_configuration_from_db(tenant_id)

            # Cache the result
            _config_cache[cache_key] = {
                'config': config,
                'timestamp': current_time
            }

            return config

        except Exception as e:
            logger.error(f"Error getting configuration: {str(e)}")
            return self._get_default_config()

    def _fetch_configuration_from_db(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch configuration from DynamoDB.

        Args:
            tenant_id: Optional tenant ID

        Returns:
            Configuration dictionary
        """
        try:
            # Try tenant-specific configuration first
            if tenant_id:
                config = self._get_tenant_config(tenant_id)
                if config:
                    return config

            # Fallback to global configuration
            config = self._get_global_config()
            if config:
                return config

            # Final fallback to defaults
            return self._get_default_config()

        except Exception as e:
            logger.error(f"Error fetching configuration from DB: {str(e)}")
            return self._get_default_config()

    def _get_tenant_config(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get tenant-specific configuration from DynamoDB"""
        try:
            response = self.config_table.query(
                KeyConditionExpression='config_key = :key',
                ExpressionAttributeValues={':key': f"tenant_{tenant_id}"},
                ScanIndexForward=False,
                Limit=1
            )

            items = response.get('Items', [])
            if items:
                return items[0].get('configuration', {})

            return None

        except Exception as e:
            logger.error(f"Error getting tenant config for {tenant_id}: {str(e)}")
            return None

    def _get_global_config(self) -> Optional[Dict[str, Any]]:
        """Get global configuration from DynamoDB"""
        try:
            response = self.config_table.query(
                KeyConditionExpression='config_key = :key',
                ExpressionAttributeValues={':key': 'global'},
                ScanIndexForward=False,
                Limit=1
            )

            items = response.get('Items', [])
            if items:
                return items[0].get('configuration', {})

            return None

        except Exception as e:
            logger.error(f"Error getting global config: {str(e)}")
            return None

    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'weights': self.default_weights.copy(),
            'confidence_levels': self.default_confidence_levels.copy(),
            'algorithm_params': self.default_algorithm_params.copy(),
            'version': '1.0.0',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

    def invalidate_cache(self, tenant_id: Optional[str] = None):
        """
        Invalidate configuration cache for a specific tenant or globally.

        Args:
            tenant_id: Optional tenant ID to invalidate, or None for global
        """
        try:
            if tenant_id:
                cache_key = f"config_{tenant_id}"
                if cache_key in _config_cache:
                    del _config_cache[cache_key]
            else:
                # Invalidate all cache entries
                _config_cache.clear()

            logger.info(f"Configuration cache invalidated for tenant: {tenant_id or 'all'}")

        except Exception as e:
            logger.error(f"Error invalidating cache: {str(e)}")

    def get_cache_info(self) -> Dict[str, Any]:
        """
        Get information about the current cache state.

        Returns:
            Dictionary with cache statistics
        """
        try:
            current_time = time.time()
            cache_info = {
                'total_entries': len(_config_cache),
                'entries': [],
                'cache_ttl_seconds': _cache_ttl
            }

            for cache_key, cached_data in _config_cache.items():
                age = current_time - cached_data['timestamp']
                is_expired = age > _cache_ttl

                cache_info['entries'].append({
                    'key': cache_key,
                    'age_seconds': round(age, 2),
                    'is_expired': is_expired,
                    'expires_in_seconds': round(_cache_ttl - age, 2) if not is_expired else 0
                })

            return cache_info

        except Exception as e:
            logger.error(f"Error getting cache info: {str(e)}")
            return {'error': str(e)}


# Convenience functions for direct use
def get_weights(tenant_id: Optional[str] = None) -> Dict[str, float]:
    """Get current matching weights"""
    client = ConfigurationClient()
    return client.get_weights(tenant_id)


def get_confidence_levels(tenant_id: Optional[str] = None) -> Dict[str, float]:
    """Get current confidence level thresholds"""
    client = ConfigurationClient()
    return client.get_confidence_levels(tenant_id)


def get_weight_for_component(component: str, tenant_id: Optional[str] = None) -> float:
    """Get weight for a specific matching component"""
    client = ConfigurationClient()
    return client.get_weight_for_component(component, tenant_id)


def calculate_confidence_level(total_score: float, tenant_id: Optional[str] = None) -> str:
    """Calculate confidence level based on total score"""
    client = ConfigurationClient()
    return client.calculate_confidence_level(total_score, tenant_id)


# For local testing
if __name__ == "__main__":
    # Test configuration client
    client = ConfigurationClient()

    print("Testing configuration client:")
    print(f"Default weights: {client.get_weights()}")
    print(f"Default confidence levels: {client.get_confidence_levels()}")
    print(f"Semantic similarity weight: {client.get_weight_for_component('semantic_similarity')}")
    print(f"Confidence for score 0.8: {client.calculate_confidence_level(0.8)}")
    print(f"Cache info: {client.get_cache_info()}")