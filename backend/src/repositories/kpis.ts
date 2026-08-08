import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  AccessEventRecord,
  DeviceRecord,
  KpiSnapshot,
  KpiStore,
  VideoRecord,
} from '../domain';

export class DynamoKpiStore implements KpiStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tables: { events: string; devices: string; videos: string },
  ) {}

  async load(tenantId: string, from: string, to: string): Promise<KpiSnapshot> {
    const [events, devices, videos] = await Promise.all([
      this.queryAll<AccessEventRecord>(
        this.tables.events,
        'TenantTimeIndex',
        '#tenantId = :tenantId AND #time BETWEEN :from AND :to',
        { '#tenantId': 'tenantId', '#time': 'timeKey' },
        {
          ':tenantId': tenantId,
          ':from': `${from}#`,
          ':to': `${to}#\uffff`,
        },
      ),
      this.queryAll<DeviceRecord>(
        this.tables.devices,
        'TenantUpdatedIndex',
        '#tenantId = :tenantId',
        { '#tenantId': 'tenantId' },
        { ':tenantId': tenantId },
      ),
      this.queryAll<VideoRecord>(
        this.tables.videos,
        'TenantCreatedIndex',
        '#tenantId = :tenantId',
        { '#tenantId': 'tenantId' },
        { ':tenantId': tenantId },
      ),
    ]);
    return { events, devices, videos };
  }

  private async queryAll<T>(
    tableName: string,
    indexName: string,
    keyCondition: string,
    names: Record<string, string>,
    values: Record<string, unknown>,
  ): Promise<T[]> {
    const items: T[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: startKey,
      }));
      items.push(...(result.Items ?? []) as T[]);
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return items;
  }
}
