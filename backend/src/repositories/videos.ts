import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Page, VideoQuery } from '@sop/contracts';
import type { VideoRecord, VideoStore } from '../domain';
import { decodeToken, encodeToken } from '../lib/pagination';

export class DynamoVideoStore implements VideoStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(item: VideoRecord): Promise<boolean> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(videoId)',
      }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async get(videoId: string): Promise<VideoRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { videoId },
    }));
    return result.Item as VideoRecord | undefined;
  }

  async update(
    tenantId: string,
    videoId: string,
    changes: Partial<VideoRecord>,
  ): Promise<VideoRecord | undefined> {
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
    const names: Record<string, string> = { '#tenantId': 'tenantId' };
    const values: Record<string, unknown> = { ':tenantId': tenantId };
    const assignments = entries.map(([key, value], index) => {
      names[`#field${index}`] = key;
      values[`:value${index}`] = value;
      return `#field${index} = :value${index}`;
    });
    try {
      const result = await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { videoId },
        UpdateExpression: `SET ${assignments.join(', ')}`,
        ConditionExpression: 'attribute_exists(videoId) AND #tenantId = :tenantId',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as VideoRecord;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return undefined;
      throw error;
    }
  }

  async list(tenantId: string, query: VideoQuery): Promise<Page<VideoRecord>> {
    const indexName = query.status ? 'TenantStatusIndex' : 'TenantCreatedIndex';
    const keyName = query.status ? 'tenantStatus' : 'tenantId';
    const keyValue = query.status ? `${tenantId}#${query.status}` : tenantId;
    const names: Record<string, string> = { '#pk': keyName };
    const values: Record<string, unknown> = { ':pk': keyValue };
    const filters: string[] = [];
    if (query.facilityId) {
      names['#facilityId'] = 'facilityId';
      values[':facilityId'] = query.facilityId;
      filters.push('#facilityId = :facilityId');
    }
    if (query.query) {
      names['#searchText'] = 'searchText';
      values[':query'] = query.query.toLocaleLowerCase();
      filters.push('contains(#searchText, :query)');
    }
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: indexName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ExclusiveStartKey: decodeToken(query.nextToken),
      Limit: query.limit,
      ScanIndexForward: false,
      ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}),
    }));
    return {
      items: (result.Items ?? []) as VideoRecord[],
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey) } : {}),
    };
  }
}
