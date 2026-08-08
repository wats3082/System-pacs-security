import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { DeviceQuery, Page } from '@sop/contracts';
import type { DeviceRecord, DeviceStore } from '../domain';
import { decodeToken, encodeToken } from '../lib/pagination';

export class DynamoDeviceStore implements DeviceStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(item: DeviceRecord): Promise<boolean> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(deviceId)',
      }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async get(deviceId: string): Promise<DeviceRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { deviceId },
    }));
    return result.Item as DeviceRecord | undefined;
  }

  async update(
    tenantId: string,
    deviceId: string,
    changes: Partial<DeviceRecord>,
  ): Promise<DeviceRecord | undefined> {
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
        Key: { deviceId },
        UpdateExpression: `SET ${assignments.join(', ')}`,
        ConditionExpression: 'attribute_exists(deviceId) AND #tenantId = :tenantId',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as DeviceRecord;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return undefined;
      throw error;
    }
  }

  async heartbeat(
    tenantId: string,
    deviceId: string,
    observedAt: string,
    status: DeviceRecord['status'],
  ): Promise<DeviceRecord | undefined> {
    try {
      const result = await this.client.send(new UpdateCommand({
          TableName: this.tableName,
          Key: { deviceId },
          UpdateExpression: [
            'SET #status = :status',
            '#lastHeartbeatAt = :observedAt',
            '#updatedAt = :observedAt',
            '#updatedAtDeviceId = :updatedAtDeviceId',
          ].join(', '),
          ConditionExpression: [
            'attribute_exists(deviceId)',
            '#tenantId = :tenantId',
            '(attribute_not_exists(#lastHeartbeatAt) OR #lastHeartbeatAt < :observedAt)',
          ].join(' AND '),
          ExpressionAttributeNames: {
            '#tenantId': 'tenantId',
            '#status': 'status',
            '#lastHeartbeatAt': 'lastHeartbeatAt',
            '#updatedAt': 'updatedAt',
            '#updatedAtDeviceId': 'updatedAtDeviceId',
          },
          ExpressionAttributeValues: {
            ':tenantId': tenantId,
            ':status': status,
            ':observedAt': observedAt,
            ':updatedAtDeviceId': `${observedAt}#${deviceId}`,
          },
          ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as DeviceRecord;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const current = await this.client.send(new GetCommand({
        TableName: this.tableName,
        Key: { deviceId },
        ConsistentRead: true,
      }));
      const item = current.Item as DeviceRecord | undefined;
      return item?.tenantId === tenantId ? item : undefined;
    }
  }

  async list(tenantId: string, query: DeviceQuery): Promise<Page<DeviceRecord>> {
    const names: Record<string, string> = { '#tenantId': 'tenantId' };
    const values: Record<string, unknown> = { ':tenantId': tenantId };
    const filters: string[] = [];
    for (const key of ['type', 'status', 'facilityId'] as const) {
      if (query[key]) {
        names[`#${key}`] = key;
        values[`:${key}`] = query[key];
        filters.push(`#${key} = :${key}`);
      }
    }
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'TenantUpdatedIndex',
      KeyConditionExpression: '#tenantId = :tenantId',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ExclusiveStartKey: decodeToken(query.nextToken),
      Limit: query.limit,
      ScanIndexForward: false,
      ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}),
    }));
    return {
      items: (result.Items ?? []) as DeviceRecord[],
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey) } : {}),
    };
  }
}
