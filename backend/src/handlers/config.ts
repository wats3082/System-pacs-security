import type { APIGatewayProxyHandler } from 'aws-lambda';
import { requiredEnv } from '../lib/env';
import { withJsonHandler } from '../lib/http';

export const handler: APIGatewayProxyHandler = withJsonHandler(async () => ({
  body: {
    apiBaseUrl: '/api',
    region: requiredEnv('AWS_REGION'),
    userPoolId: requiredEnv('USER_POOL_ID'),
    userPoolClientId: requiredEnv('USER_POOL_CLIENT_ID'),
  },
}));
