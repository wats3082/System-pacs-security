import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { ZodError } from 'zod';
import { AppError } from './errors';

export interface JsonResult {
  statusCode?: number;
  body: unknown;
}

type JsonHandler = (
  event: APIGatewayProxyEvent,
  requestId: string,
) => Promise<JsonResult>;

function corsHeaders(event: APIGatewayProxyEvent): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = event.headers.origin ?? event.headers.Origin;
  return origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

function json(
  event: APIGatewayProxyEvent,
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(event),
    },
    body: JSON.stringify(body),
  };
}

export function withJsonHandler(fn: JsonHandler): APIGatewayProxyHandler {
  return async (event, context) => {
    const requestId = context.awsRequestId;
    try {
      const result = await fn(event, requestId);
      const statusCode = result.statusCode ?? 200;
      console.info(JSON.stringify({
        level: 'info',
        requestId,
        method: event.httpMethod,
        path: event.path,
        statusCode,
      }));
      return json(event, statusCode, result.body);
    } catch (error) {
      if (error instanceof ZodError) {
        return json(event, 400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            requestId,
            details: error.issues,
          },
        });
      }
      if (error instanceof AppError) {
        console.warn(JSON.stringify({
          level: 'warn',
          requestId,
          code: error.code,
          statusCode: error.statusCode,
          message: error.message,
        }));
        return json(event, error.statusCode, {
          error: {
            code: error.code,
            message: error.message,
            requestId,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        });
      }
      console.error(JSON.stringify({
        level: 'error',
        requestId,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }));
      return json(event, 500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed',
          requestId,
        },
      });
    }
  };
}

export function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) throw new AppError(400, 'INVALID_BODY', 'A JSON request body is required');
  try {
    return JSON.parse(event.body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }
    throw error;
  }
}

export function query(event: APIGatewayProxyEvent): Record<string, string> {
  return Object.fromEntries(
    Object.entries(event.queryStringParameters ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function actorId(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.claims as Record<string, unknown> | undefined;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !sub) {
    throw new AppError(401, 'UNAUTHENTICATED', 'A valid user identity is required');
  }
  return sub;
}

export function pathParameter(event: APIGatewayProxyEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) throw new AppError(400, 'INVALID_PATH', `${name} is required`);
  return value;
}

export const methodNotAllowed = (): never => {
  throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method is not allowed for this resource');
};
