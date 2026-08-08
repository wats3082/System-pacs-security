import type { APIGatewayProxyHandler } from 'aws-lambda';
import { kpiQuerySchema } from '@sop/contracts';
import { requiredEnv } from '../lib/env';
import { methodNotAllowed, query, withJsonHandler } from '../lib/http';
import { documentClient } from '../repositories/client';
import { DynamoKpiStore } from '../repositories/kpis';
import { KpiService } from '../services/kpis';

export function createKpisHandler(
  service: Pick<KpiService, 'summary'>,
  tenantId: string,
): APIGatewayProxyHandler {
  return withJsonHandler(async (event) => {
    if (event.httpMethod !== 'GET') return methodNotAllowed();
    const { windowDays } = kpiQuerySchema.parse(query(event));
    return { body: await service.summary(tenantId, windowDays) };
  });
}

let live: APIGatewayProxyHandler | undefined;
export const handler: APIGatewayProxyHandler = (event, context, callback) => {
  live ??= createKpisHandler(
    new KpiService(
      new DynamoKpiStore(documentClient, {
        events: requiredEnv('EVENTS_TABLE_NAME'),
        devices: requiredEnv('DEVICES_TABLE_NAME'),
        videos: requiredEnv('VIDEOS_TABLE_NAME'),
      }),
    ),
    requiredEnv('TENANT_ID'),
  );
  return live(event, context, callback);
};
