"""
GovBizAI Weight Configuration Management
Dynamic matching weights and confidence level configuration system.

This Lambda function manages the configuration of:
- Matching algorithm weights for the 8 components
- Confidence level thresholds
- Algorithm parameters

Key Features:
- Real-time weight updates with validation
- Version control of configurations
- Tenant-specific overrides
- Default fallback configurations
- Configuration change audit trail
"""

import json
import boto3
import logging
import time
from typing import Dict, List, Any, Optional
from decimal import Decimal
from datetime import datetime, timezone
import uuid

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')

# Configuration table
CONFIG_TABLE = 'govbizai-weight-configuration'

# Default configuration values
DEFAULT_WEIGHTS = {
    'semantic_similarity': Decimal('0.25'),
    'keyword_matching': Decimal('0.15'),
    'naics_alignment': Decimal('0.15'),
    'past_performance': Decimal('0.20'),
    'certification_bonus': Decimal('0.10'),
    'geographic_match': Decimal('0.05'),
    'capacity_fit': Decimal('0.05'),
    'recency_factor': Decimal('0.05')
}

DEFAULT_CONFIDENCE_LEVELS = {
    'high_threshold': Decimal('0.75'),
    'medium_threshold': Decimal('0.50'),
    'low_threshold': Decimal('0.25')
}

DEFAULT_ALGORITHM_PARAMS = {
    'cache_ttl_hours': 24,
    'min_score_threshold': Decimal('0.10'),
    'max_concurrent_matches': 100,
    'semantic_similarity_threshold': Decimal('0.30')
}


class WeightConfigurationManager:
    """Manages dynamic configuration of matching weights and thresholds"""

    def __init__(self):
        self.config_table = dynamodb.Table(CONFIG_TABLE)

    def get_configuration(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get current configuration for a tenant or global defaults.

        Args:
            tenant_id: Optional tenant ID for tenant-specific config

        Returns:
            Complete configuration dictionary
        """
        try:
            # Try to get tenant-specific configuration first
            if tenant_id:
                tenant_config = self._get_tenant_config(tenant_id)
                if tenant_config:
                    return tenant_config

            # Fallback to global configuration
            global_config = self._get_global_config()
            if global_config:
                return global_config

            # Final fallback to defaults
            return self._get_default_config()

        except Exception as e:
            logger.error(f"Error getting configuration: {str(e)}")
            return self._get_default_config()

    def update_configuration(
        self,
        config_updates: Dict[str, Any],
        tenant_id: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update configuration with validation.

        Args:
            config_updates: Configuration updates to apply
            tenant_id: Optional tenant ID for tenant-specific updates
            updated_by: User who made the update

        Returns:
            Updated configuration
        """
        try:
            # Validate the configuration updates
            validation_result = self._validate_configuration(config_updates)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': validation_result['errors'],
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }

            # Get current configuration
            current_config = self.get_configuration(tenant_id)

            # Merge updates with current configuration
            updated_config = self._merge_configurations(current_config, config_updates)

            # Store the updated configuration
            config_id = self._store_configuration(updated_config, tenant_id, updated_by)

            # Log the configuration change
            self._log_configuration_change(config_id, current_config, updated_config, tenant_id, updated_by)

            # Publish metrics
            self._publish_config_metrics(updated_config, tenant_id)

            return {
                'success': True,
                'config_id': config_id,
                'configuration': updated_config,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error(f"Error updating configuration: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

    def _convert_floats_to_decimals(self, obj):
        """
        Recursively convert floats to Decimals for DynamoDB compatibility.

        Args:
            obj: Object that may contain floats

        Returns:
            Object with floats converted to Decimals
        """
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self._convert_floats_to_decimals(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_floats_to_decimals(item) for item in obj]
        else:
            return obj

    def _convert_decimals_to_floats(self, obj):
        """
        Recursively convert Decimals to floats for JSON serialization.

        Args:
            obj: Object that may contain Decimals

        Returns:
            Object with Decimals converted to floats
        """
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {key: self._convert_decimals_to_floats(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_decimals_to_floats(item) for item in obj]
        else:
            return obj

    def get_configuration_history(self, tenant_id: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """
        Get configuration change history.

        Args:
            tenant_id: Optional tenant ID
            limit: Maximum number of records to return

        Returns:
            List of configuration changes
        """
        try:
            config_key = f"tenant_{tenant_id}" if tenant_id else "global"

            # Query configuration history
            response = self.config_table.query(
                KeyConditionExpression='config_key = :key',
                ExpressionAttributeValues={':key': config_key},
                ScanIndexForward=False,  # Latest first
                Limit=limit
            )

            return response.get('Items', [])

        except Exception as e:
            logger.error(f"Error getting configuration history: {str(e)}")
            return []

    def reset_to_defaults(self, tenant_id: Optional[str] = None, updated_by: Optional[str] = None) -> Dict[str, Any]:
        """
        Reset configuration to defaults.

        Args:
            tenant_id: Optional tenant ID
            updated_by: User who made the reset

        Returns:
            Reset result
        """
        try:
            default_config = self._get_default_config()

            # Store the default configuration
            config_id = self._store_configuration(default_config, tenant_id, updated_by)

            # Log the reset
            self._log_configuration_change(
                config_id,
                self.get_configuration(tenant_id),
                default_config,
                tenant_id,
                updated_by,
                change_type='reset_to_defaults'
            )

            return {
                'success': True,
                'config_id': config_id,
                'configuration': default_config,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error(f"Error resetting configuration: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

    def _get_tenant_config(self, tenant_id: str) -> Optional[Dict]:
        """Get tenant-specific configuration"""
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
            logger.error(f"Error getting tenant config: {str(e)}")
            return None

    def _get_global_config(self) -> Optional[Dict]:
        """Get global configuration"""
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
            'weights': DEFAULT_WEIGHTS.copy(),
            'confidence_levels': DEFAULT_CONFIDENCE_LEVELS.copy(),
            'algorithm_params': DEFAULT_ALGORITHM_PARAMS.copy(),
            'version': '1.0.0',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

    def _validate_configuration(self, config_updates: Dict[str, Any]) -> Dict[str, Any]:
        """Validate configuration updates"""
        errors = []

        try:
            # Validate weights if provided
            if 'weights' in config_updates:
                weights = config_updates['weights']

                # Check that all required weight components are present
                required_weights = set(DEFAULT_WEIGHTS.keys())
                provided_weights = set(weights.keys())

                if not required_weights.issubset(provided_weights):
                    missing = required_weights - provided_weights
                    errors.append(f"Missing weight components: {missing}")

                # Check that weights sum to 1.0 (with tolerance)
                weight_sum = sum(Decimal(str(w)) for w in weights.values())
                if abs(weight_sum - Decimal('1.0')) > Decimal('0.01'):
                    errors.append(f"Weights must sum to 1.0, got {weight_sum}")

                # Check that all weights are between 0 and 1
                for component, weight in weights.items():
                    weight_decimal = Decimal(str(weight))
                    if weight_decimal < 0 or weight_decimal > 1:
                        errors.append(f"Weight for {component} must be between 0 and 1, got {weight}")

            # Validate confidence levels if provided
            if 'confidence_levels' in config_updates:
                levels = config_updates['confidence_levels']

                required_levels = set(DEFAULT_CONFIDENCE_LEVELS.keys())
                provided_levels = set(levels.keys())

                if not required_levels.issubset(provided_levels):
                    missing = required_levels - provided_levels
                    errors.append(f"Missing confidence level thresholds: {missing}")

                # Check threshold ordering: high > medium > low
                if all(level in levels for level in required_levels):
                    high = Decimal(str(levels['high_threshold']))
                    medium = Decimal(str(levels['medium_threshold']))
                    low = Decimal(str(levels['low_threshold']))

                    if not (high > medium > low):
                        errors.append("Confidence thresholds must be ordered: high > medium > low")

                    if not (0 <= low <= medium <= high <= 1):
                        errors.append("All confidence thresholds must be between 0 and 1")

            # Validate algorithm parameters if provided
            if 'algorithm_params' in config_updates:
                params = config_updates['algorithm_params']

                if 'cache_ttl_hours' in params:
                    ttl = params['cache_ttl_hours']
                    if not isinstance(ttl, (int, float)) or ttl < 0 or ttl > 168:  # 0 to 1 week
                        errors.append("cache_ttl_hours must be between 0 and 168")

                if 'max_concurrent_matches' in params:
                    max_concurrent = params['max_concurrent_matches']
                    if not isinstance(max_concurrent, int) or max_concurrent < 1 or max_concurrent > 1000:
                        errors.append("max_concurrent_matches must be between 1 and 1000")

            return {
                'valid': len(errors) == 0,
                'errors': errors
            }

        except Exception as e:
            logger.error(f"Error validating configuration: {str(e)}")
            return {
                'valid': False,
                'errors': [f"Validation error: {str(e)}"]
            }

    def _merge_configurations(self, current_config: Dict, updates: Dict) -> Dict:
        """Merge configuration updates with current configuration"""
        merged_config = current_config.copy()

        for key, value in updates.items():
            if key in ['weights', 'confidence_levels', 'algorithm_params'] and isinstance(value, dict):
                # Deep merge for nested dictionaries
                if key not in merged_config:
                    merged_config[key] = {}
                merged_config[key].update(value)
            else:
                merged_config[key] = value

        # Update metadata
        merged_config['updated_at'] = datetime.now(timezone.utc).isoformat()

        return merged_config

    def _store_configuration(
        self,
        configuration: Dict,
        tenant_id: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> str:
        """Store configuration in DynamoDB"""
        try:
            config_id = str(uuid.uuid4())
            config_key = f"tenant_{tenant_id}" if tenant_id else "global"
            timestamp = datetime.now(timezone.utc).isoformat()

            item = {
                'config_key': config_key,
                'timestamp': timestamp,
                'config_id': config_id,
                'configuration': configuration,
                'updated_by': updated_by or 'system',
                'ttl': int((datetime.now(timezone.utc).timestamp() + (365 * 24 * 3600)))  # 1 year TTL
            }

            self.config_table.put_item(Item=item)

            return config_id

        except Exception as e:
            logger.error(f"Error storing configuration: {str(e)}")
            raise

    def _log_configuration_change(
        self,
        config_id: str,
        old_config: Dict,
        new_config: Dict,
        tenant_id: Optional[str] = None,
        updated_by: Optional[str] = None,
        change_type: str = 'update'
    ):
        """Log configuration changes for audit trail"""
        try:
            # Create a detailed change log
            changes = self._calculate_config_diff(old_config, new_config)

            log_entry = {
                'config_id': config_id,
                'tenant_id': tenant_id,
                'change_type': change_type,
                'updated_by': updated_by or 'system',
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'changes': changes,
                'old_config_summary': self._summarize_config(old_config),
                'new_config_summary': self._summarize_config(new_config)
            }

            logger.info(f"Configuration change logged: {json.dumps(log_entry)}")

        except Exception as e:
            logger.error(f"Error logging configuration change: {str(e)}")

    def _calculate_config_diff(self, old_config: Dict, new_config: Dict) -> List[Dict]:
        """Calculate the differences between configurations"""
        changes = []

        try:
            # Check weights changes
            old_weights = old_config.get('weights', {})
            new_weights = new_config.get('weights', {})

            for component in set(old_weights.keys()) | set(new_weights.keys()):
                old_val = old_weights.get(component)
                new_val = new_weights.get(component)

                if old_val != new_val:
                    changes.append({
                        'section': 'weights',
                        'component': component,
                        'old_value': str(old_val) if old_val is not None else None,
                        'new_value': str(new_val) if new_val is not None else None
                    })

            # Check confidence levels changes
            old_levels = old_config.get('confidence_levels', {})
            new_levels = new_config.get('confidence_levels', {})

            for level in set(old_levels.keys()) | set(new_levels.keys()):
                old_val = old_levels.get(level)
                new_val = new_levels.get(level)

                if old_val != new_val:
                    changes.append({
                        'section': 'confidence_levels',
                        'component': level,
                        'old_value': str(old_val) if old_val is not None else None,
                        'new_value': str(new_val) if new_val is not None else None
                    })

            # Check algorithm parameters changes
            old_params = old_config.get('algorithm_params', {})
            new_params = new_config.get('algorithm_params', {})

            for param in set(old_params.keys()) | set(new_params.keys()):
                old_val = old_params.get(param)
                new_val = new_params.get(param)

                if old_val != new_val:
                    changes.append({
                        'section': 'algorithm_params',
                        'component': param,
                        'old_value': str(old_val) if old_val is not None else None,
                        'new_value': str(new_val) if new_val is not None else None
                    })

            return changes

        except Exception as e:
            logger.error(f"Error calculating config diff: {str(e)}")
            return []

    def _summarize_config(self, config: Dict) -> Dict:
        """Create a summary of configuration for logging"""
        try:
            return {
                'weights_sum': str(sum(Decimal(str(w)) for w in config.get('weights', {}).values())),
                'high_threshold': str(config.get('confidence_levels', {}).get('high_threshold', 'N/A')),
                'medium_threshold': str(config.get('confidence_levels', {}).get('medium_threshold', 'N/A')),
                'low_threshold': str(config.get('confidence_levels', {}).get('low_threshold', 'N/A')),
                'cache_ttl': str(config.get('algorithm_params', {}).get('cache_ttl_hours', 'N/A')),
                'version': config.get('version', 'unknown')
            }

        except Exception as e:
            logger.error(f"Error summarizing config: {str(e)}")
            return {'error': str(e)}

    def _publish_config_metrics(self, configuration: Dict, tenant_id: Optional[str] = None):
        """Publish configuration metrics to CloudWatch"""
        try:
            metric_data = []

            # Publish weight metrics
            weights = configuration.get('weights', {})
            for component, weight in weights.items():
                metric_data.append({
                    'MetricName': f'Weight_{component}',
                    'Dimensions': [
                        {
                            'Name': 'TenantId',
                            'Value': tenant_id or 'global'
                        }
                    ],
                    'Value': float(weight),
                    'Unit': 'None'
                })

            # Publish confidence level metrics
            levels = configuration.get('confidence_levels', {})
            for level, threshold in levels.items():
                metric_data.append({
                    'MetricName': f'ConfidenceThreshold_{level}',
                    'Dimensions': [
                        {
                            'Name': 'TenantId',
                            'Value': tenant_id or 'global'
                        }
                    ],
                    'Value': float(threshold),
                    'Unit': 'None'
                })

            if metric_data:
                cloudwatch.put_metric_data(
                    Namespace='GovBizAI/Configuration',
                    MetricData=metric_data
                )

        except Exception as e:
            logger.warning(f"Failed to publish configuration metrics: {str(e)}")


# Initialize the configuration manager
config_manager = WeightConfigurationManager()


def lambda_handler(event, context):
    """
    AWS Lambda handler for weight configuration management

    Supported operations:
    - GET: Retrieve current configuration
    - POST: Update configuration
    - PUT: Replace entire configuration
    - DELETE: Reset to defaults
    """
    try:
        logger.info(f"Configuration request: {json.dumps(event)}")

        # Parse request
        http_method = event.get('httpMethod', 'GET')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}
        body = event.get('body', '{}')

        # Extract tenant_id from path or query parameters
        tenant_id = path_parameters.get('tenant_id') or query_parameters.get('tenant_id')

        # Extract user information from context
        request_context = event.get('requestContext', {})
        user_id = request_context.get('authorizer', {}).get('user_id', 'unknown')

        if http_method == 'GET':
            # Get configuration
            if query_parameters.get('history') == 'true':
                # Get configuration history
                limit = int(query_parameters.get('limit', 50))
                history = config_manager.get_configuration_history(tenant_id, limit)

                # Convert Decimals to floats for JSON serialization
                serializable_history = config_manager._convert_decimals_to_floats(history)

                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE'
                    },
                    'body': json.dumps({
                        'history': serializable_history,
                        'tenant_id': tenant_id,
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    })
                }
            else:
                # Get current configuration
                configuration = config_manager.get_configuration(tenant_id)

                # Convert Decimals to floats for JSON serialization
                serializable_config = config_manager._convert_decimals_to_floats(configuration)

                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE'
                    },
                    'body': json.dumps({
                        'configuration': serializable_config,
                        'tenant_id': tenant_id,
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    })
                }

        elif http_method in ['POST', 'PUT']:
            # Update configuration
            try:
                config_updates = json.loads(body)
                # Convert floats to Decimals for DynamoDB compatibility
                config_updates = config_manager._convert_floats_to_decimals(config_updates)
            except json.JSONDecodeError:
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'error': 'Invalid JSON in request body'})
                }

            result = config_manager.update_configuration(config_updates, tenant_id, user_id)

            # Convert Decimals to floats for JSON serialization
            serializable_result = config_manager._convert_decimals_to_floats(result)

            status_code = 200 if result.get('success') else 400

            return {
                'statusCode': status_code,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE'
                },
                'body': json.dumps(serializable_result)
            }

        elif http_method == 'DELETE':
            # Reset to defaults
            result = config_manager.reset_to_defaults(tenant_id, user_id)

            # Convert Decimals to floats for JSON serialization
            serializable_result = config_manager._convert_decimals_to_floats(result)

            status_code = 200 if result.get('success') else 500

            return {
                'statusCode': status_code,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE'
                },
                'body': json.dumps(serializable_result)
            }

        else:
            return {
                'statusCode': 405,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': f'Method {http_method} not allowed'})
            }

    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}',
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }


# For local testing
if __name__ == "__main__":
    # Test configuration update
    test_event = {
        'httpMethod': 'POST',
        'pathParameters': {'tenant_id': 'test-tenant'},
        'body': json.dumps({
            'weights': {
                'semantic_similarity': 0.30,
                'keyword_matching': 0.20,
                'naics_alignment': 0.15,
                'past_performance': 0.15,
                'certification_bonus': 0.10,
                'geographic_match': 0.05,
                'capacity_fit': 0.03,
                'recency_factor': 0.02
            },
            'confidence_levels': {
                'high_threshold': 0.80,
                'medium_threshold': 0.60,
                'low_threshold': 0.30
            }
        }),
        'requestContext': {
            'authorizer': {
                'user_id': 'test-user'
            }
        }
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))