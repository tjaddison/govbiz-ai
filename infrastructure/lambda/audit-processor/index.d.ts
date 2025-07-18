import { SQSEvent, DynamoDBStreamEvent, Context } from 'aws-lambda';
export declare const handler: (event: SQSEvent | DynamoDBStreamEvent, context: Context) => Promise<void>;
