import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  deviceCreateSchema,
  deviceHeartbeatSchema,
  deviceQuerySchema,
  deviceUpdateSchema,
} from '@sop/contracts';
import { requiredEnv } from '../lib/env';
import {
  methodNotAllowed,
  parseBody,
  pathParameter,
  query,
  withJsonHandler,
} from '../lib/http';
import { documentClient } from '../repositories/client';
import { DynamoDeviceStore } from '../repositories/devices';
import { DeviceService } from '../services/devices';

export function createDevicesHandler(
  service: Pick<DeviceService, 'register' | 'update' | 'heartbeat' | 'list'>,
  tenantId: string,
): APIGatewayProxyHandler {
  return withJsonHandler(async (event) => {
    const isCollection = !event.pathParameters?.deviceId;
    if (event.httpMethod === 'POST' && isCollection) {
      return {
        statusCode: 201,
        body: await service.register(tenantId, deviceCreateSchema.parse(parseBody(event))),
      };
    }
    if (event.httpMethod === 'GET' && isCollection) {
      return { body: await service.list(tenantId, deviceQuerySchema.parse(query(event))) };
    }
    const deviceId = deviceCreateSchema.shape.deviceId.parse(pathParameter(event, 'deviceId'));
    if (event.httpMethod === 'PATCH') {
      return {
        body: await service.update(
          tenantId,
          deviceId,
          deviceUpdateSchema.parse(parseBody(event)),
        ),
      };
    }
    if (event.httpMethod === 'POST' && event.path.endsWith('/heartbeat')) {
      return {
        body: await service.heartbeat(
          tenantId,
          deviceId,
          deviceHeartbeatSchema.parse(parseBody(event)),
        ),
      };
    }
    return methodNotAllowed();
  });
}

let live: APIGatewayProxyHandler | undefined;
export const handler: APIGatewayProxyHandler = (event, context, callback) => {
  live ??= createDevicesHandler(
    new DeviceService(
      new DynamoDeviceStore(documentClient, requiredEnv('DEVICES_TABLE_NAME')),
    ),
    requiredEnv('TENANT_ID'),
  );
  return live(event, context, callback);
};
