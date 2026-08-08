import type { APIGatewayProxyHandler } from 'aws-lambda';
import { withJsonHandler } from '../lib/http';

export const handler: APIGatewayProxyHandler = withJsonHandler(async () => ({
  body: {
    status: 'ok',
    service: 'security-operations-platform',
    runtime: 'nodejs24.x',
  },
}));
