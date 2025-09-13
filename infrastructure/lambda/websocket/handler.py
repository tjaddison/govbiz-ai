import json
import boto3
import os
from typing import Dict, Any
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
apigateway = boto3.client('apigatewaymanagementapi')

CONNECTIONS_TABLE_NAME = os.environ.get('CONNECTIONS_TABLE_NAME', 'govbizai-websocket-connections')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle WebSocket API events for real-time notifications.
    Supports: connect, disconnect, message routing
    """
    try:
        route_key = event.get('requestContext', {}).get('routeKey')
        connection_id = event.get('requestContext', {}).get('connectionId')

        if route_key == '$connect':
            return handle_connect(event, connection_id)
        elif route_key == '$disconnect':
            return handle_disconnect(event, connection_id)
        elif route_key == 'ping':
            return handle_ping(event, connection_id)
        elif route_key == 'subscribe':
            return handle_subscribe(event, connection_id)
        elif route_key == 'unsubscribe':
            return handle_unsubscribe(event, connection_id)
        else:
            return handle_default(event, connection_id)

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        return {'statusCode': 500}

def handle_connect(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle WebSocket connection"""
    try:
        # Extract user information from query parameters or auth
        query_params = event.get('queryStringParameters') or {}
        company_id = query_params.get('company_id')
        user_id = query_params.get('user_id')

        if not company_id or not user_id:
            logger.warning(f"Connection attempt without required parameters: {connection_id}")
            return {'statusCode': 401}

        # Store connection information
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
        timestamp = datetime.utcnow().isoformat() + 'Z'

        connections_table.put_item(
            Item={
                'connection_id': connection_id,
                'company_id': company_id,
                'user_id': user_id,
                'connected_at': timestamp,
                'last_seen': timestamp,
                'subscriptions': [],
                'ttl': int(datetime.utcnow().timestamp()) + 86400  # 24 hours TTL
            }
        )

        logger.info(f"WebSocket connected: {connection_id} for company: {company_id}")

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Error handling connect: {str(e)}")
        return {'statusCode': 500}

def handle_disconnect(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle WebSocket disconnection"""
    try:
        # Remove connection from table
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

        connections_table.delete_item(
            Key={'connection_id': connection_id}
        )

        logger.info(f"WebSocket disconnected: {connection_id}")

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Error handling disconnect: {str(e)}")
        return {'statusCode': 200}  # Always return 200 for disconnect

def handle_ping(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle ping messages to keep connection alive"""
    try:
        # Update last_seen timestamp
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

        connections_table.update_item(
            Key={'connection_id': connection_id},
            UpdateExpression="SET last_seen = :last_seen, #ttl = :ttl",
            ExpressionAttributeNames={'#ttl': 'ttl'},
            ExpressionAttributeValues={
                ':last_seen': datetime.utcnow().isoformat() + 'Z',
                ':ttl': int(datetime.utcnow().timestamp()) + 86400
            }
        )

        # Send pong response
        send_message_to_connection(connection_id, {
            'type': 'pong',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        })

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Error handling ping: {str(e)}")
        return {'statusCode': 500}

def handle_subscribe(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle subscription to notification topics"""
    try:
        body = json.loads(event.get('body', '{}'))
        topics = body.get('topics', [])

        if not topics:
            send_message_to_connection(connection_id, {
                'type': 'error',
                'message': 'No topics specified for subscription'
            })
            return {'statusCode': 400}

        # Valid subscription topics
        valid_topics = [
            'new_matches',
            'match_updates',
            'opportunity_updates',
            'document_processing',
            'system_notifications'
        ]

        # Filter to valid topics
        valid_subscription_topics = [topic for topic in topics if topic in valid_topics]

        if not valid_subscription_topics:
            send_message_to_connection(connection_id, {
                'type': 'error',
                'message': f'No valid topics. Valid topics: {", ".join(valid_topics)}'
            })
            return {'statusCode': 400}

        # Update connection subscriptions
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

        connections_table.update_item(
            Key={'connection_id': connection_id},
            UpdateExpression="SET subscriptions = :subscriptions, last_seen = :last_seen",
            ExpressionAttributeValues={
                ':subscriptions': valid_subscription_topics,
                ':last_seen': datetime.utcnow().isoformat() + 'Z'
            }
        )

        # Send confirmation
        send_message_to_connection(connection_id, {
            'type': 'subscription_confirmed',
            'topics': valid_subscription_topics
        })

        logger.info(f"Subscription updated for {connection_id}: {valid_subscription_topics}")

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Error handling subscribe: {str(e)}")
        return {'statusCode': 500}

def handle_unsubscribe(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle unsubscription from notification topics"""
    try:
        body = json.loads(event.get('body', '{}'))
        topics_to_remove = body.get('topics', [])

        # Get current subscriptions
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
        response = connections_table.get_item(Key={'connection_id': connection_id})

        if 'Item' not in response:
            return {'statusCode': 404}

        current_subscriptions = response['Item'].get('subscriptions', [])

        # Remove specified topics
        if topics_to_remove:
            updated_subscriptions = [topic for topic in current_subscriptions if topic not in topics_to_remove]
        else:
            # If no topics specified, remove all subscriptions
            updated_subscriptions = []

        # Update connection
        connections_table.update_item(
            Key={'connection_id': connection_id},
            UpdateExpression="SET subscriptions = :subscriptions, last_seen = :last_seen",
            ExpressionAttributeValues={
                ':subscriptions': updated_subscriptions,
                ':last_seen': datetime.utcnow().isoformat() + 'Z'
            }
        )

        # Send confirmation
        send_message_to_connection(connection_id, {
            'type': 'unsubscription_confirmed',
            'removed_topics': topics_to_remove,
            'remaining_topics': updated_subscriptions
        })

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Error handling unsubscribe: {str(e)}")
        return {'statusCode': 500}

def handle_default(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    """Handle unknown messages"""
    try:
        send_message_to_connection(connection_id, {
            'type': 'error',
            'message': 'Unknown message type'
        })

        return {'statusCode': 400}

    except Exception as e:
        logger.error(f"Error handling default: {str(e)}")
        return {'statusCode': 500}

def send_message_to_connection(connection_id: str, message: Dict[str, Any]):
    """Send message to a specific WebSocket connection"""
    try:
        # Get the API Gateway Management API endpoint
        domain_name = os.environ.get('WEBSOCKET_API_ENDPOINT')
        if not domain_name:
            logger.error("WEBSOCKET_API_ENDPOINT environment variable not set")
            return

        # Initialize the API Gateway Management API client
        endpoint_url = f"https://{domain_name}/prod"
        apigateway_client = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=endpoint_url
        )

        # Send message
        apigateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message)
        )

    except apigateway_client.exceptions.GoneException:
        # Connection is stale, remove it
        try:
            connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
            connections_table.delete_item(Key={'connection_id': connection_id})
            logger.info(f"Removed stale connection: {connection_id}")
        except Exception as e:
            logger.error(f"Error removing stale connection: {str(e)}")

    except Exception as e:
        logger.error(f"Error sending message to connection {connection_id}: {str(e)}")

def send_notification_to_company(company_id: str, notification: Dict[str, Any], topic: str = None):
    """
    Send notification to all connections for a company.
    This function is called by other services to broadcast notifications.
    """
    try:
        connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

        # Query connections for the company
        response = connections_table.scan(
            FilterExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': company_id}
        )

        connections = response.get('Items', [])

        for connection in connections:
            connection_id = connection['connection_id']
            subscriptions = connection.get('subscriptions', [])

            # If topic is specified, check if connection is subscribed
            if topic and topic not in subscriptions:
                continue

            # Send notification
            send_message_to_connection(connection_id, {
                'type': 'notification',
                'topic': topic,
                'data': notification,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            })

        logger.info(f"Notification sent to {len(connections)} connections for company {company_id}")

    except Exception as e:
        logger.error(f"Error sending notification to company {company_id}: {str(e)}")

# Entry point for external services to send notifications
def send_notification(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Entry point for other Lambda functions to send WebSocket notifications.
    Expected event structure:
    {
        "company_id": "string",
        "topic": "string",
        "notification": {...}
    }
    """
    try:
        company_id = event.get('company_id')
        topic = event.get('topic')
        notification = event.get('notification')

        if not company_id or not notification:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'company_id and notification are required'})
            }

        send_notification_to_company(company_id, notification, topic)

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Notification sent successfully'})
        }

    except Exception as e:
        logger.error(f"Error in send_notification: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error'})
        }