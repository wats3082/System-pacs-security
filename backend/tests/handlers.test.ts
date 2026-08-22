import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createEventsHandler } from '../src/handlers/events';

const context = {
  awsRequestId: 'request-1',
} as Context;

function event(body: string): APIGatewayProxyEvent {
  return {
    body,
    headers: { origin: 'https://app.example.com' },
    httpMethod: 'POST',
    path: '/api/events',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      authorizer: { claims: { sub: 'user-1' } },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('events handler', () => {
  it('returns structured validation errors without invoking the service', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const service = {
      ingest: vi.fn(),
      evaluate: vi.fn(),
      investigate: vi.fn(),
      list: vi.fn(),
    };
    const handler = createEventsHandler(service, 'default');
    const result = await handler(event('{"decision":"GRANTED"}'), context, () => undefined);
    const response = result as APIGatewayProxyResult;
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: { code: 'VALIDATION_ERROR', requestId: 'request-1' },
    });
    expect(response.headers).toMatchObject({
      'Access-Control-Allow-Origin': 'https://app.example.com',
    });
    expect(service.ingest).not.toHaveBeenCalled();
  });
});
