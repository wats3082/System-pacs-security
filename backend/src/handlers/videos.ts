import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  videoCreateSchema,
  videoQuerySchema,
  videoStatusUpdateSchema,
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
import { DynamoVideoStore } from '../repositories/videos';
import { VideoService } from '../services/videos';

export function createVideosHandler(
  service: Pick<VideoService, 'register' | 'updateStatus' | 'list'>,
  tenantId: string,
): APIGatewayProxyHandler {
  return withJsonHandler(async (event) => {
    const isCollection = !event.pathParameters?.videoId;
    if (event.httpMethod === 'POST' && isCollection) {
      return {
        statusCode: 201,
        body: await service.register(
          tenantId,
          actorId(event),
          videoCreateSchema.parse(parseBody(event)),
        ),
      };
    }
    if (event.httpMethod === 'GET' && isCollection) {
      return { body: await service.list(tenantId, videoQuerySchema.parse(query(event))) };
    }
    if (event.httpMethod === 'PATCH') {
      const videoId = videoCreateSchema.shape.videoId.parse(pathParameter(event, 'videoId'));
      return {
        body: await service.updateStatus(
          tenantId,
          videoId,
          videoStatusUpdateSchema.parse(parseBody(event)),
        ),
      };
    }
    return methodNotAllowed();
  });
}

let live: APIGatewayProxyHandler | undefined;
export const handler: APIGatewayProxyHandler = (event, context, callback) => {
  live ??= createVideosHandler(
    new VideoService(
      new DynamoVideoStore(documentClient, requiredEnv('VIDEOS_TABLE_NAME')),
    ),
    requiredEnv('TENANT_ID'),
  );
  return live(event, context, callback);
};
