import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  accessEventCreateSchema,
  accessDecisionRequestSchema,
  accessEventQuerySchema,
  investigationUpdateSchema,
} from '@sop/contracts';
import { requiredEnv } from '../lib/env';
import {
  actorId,
  methodNotAllowed,
  parseBody,
  pathParameter,
  query,
  withJsonHandler,
} from '../lib/http';
import { documentClient } from '../repositories/client';
import { DynamoAccessEventStore } from '../repositories/events';
import { AccessEventService } from '../services/events';

export function createEventsHandler(
  service: Pick<AccessEventService, 'ingest' | 'evaluate' | 'investigate' | 'list'>,
  tenantId: string,
): APIGatewayProxyHandler {
  return withJsonHandler(async (event) => {
    if (event.httpMethod === 'POST' && event.path.endsWith('/evaluate')) {
      const result = await service.evaluate(
        tenantId,
        actorId(event),
        accessDecisionRequestSchema.parse(parseBody(event)),
      );
      return { statusCode: result.created ? 201 : 200, body: result };
    }
    if (event.httpMethod === 'PATCH' && event.path.endsWith('/investigation')) {
      return {
        body: await service.investigate(
          tenantId,
          actorId(event),
          pathParameter(event, 'eventId'),
          investigationUpdateSchema.parse(parseBody(event)),
        ),
      };
    }
    if (event.httpMethod === 'POST') {
      const result = await service.ingest(
        tenantId,
        actorId(event),
        accessEventCreateSchema.parse(parseBody(event)),
      );
      return { statusCode: result.created ? 201 : 200, body: result };
    }
    if (event.httpMethod === 'GET') {
      return {
        body: await service.list(tenantId, accessEventQuerySchema.parse(query(event))),
      };
    }
    return methodNotAllowed();
  });
}

let live: APIGatewayProxyHandler | undefined;
export const handler: APIGatewayProxyHandler = (event, context, callback) => {
  live ??= createEventsHandler(
    new AccessEventService(
      new DynamoAccessEventStore(documentClient, requiredEnv('EVENTS_TABLE_NAME')),
    ),
    requiredEnv('TENANT_ID'),
  );
  return live(event, context, callback);
};
