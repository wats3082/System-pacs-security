import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { AccessEvent, AccessEventQuery, InvestigationStatus, Page } from '@sop/contracts';
import type { AccessEventRecord, AccessEventStore } from '../domain';
import { decodeToken, encodeToken } from '../lib/pagination';

export class DynamoAccessEventStore implements AccessEventStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(item: AccessEventRecord): Promise<boolean> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(eventId)',
      }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async get(eventId: string): Promise<AccessEventRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { eventId },
      ConsistentRead: true,
    }));
    return result.Item as AccessEventRecord | undefined;
  }

  async updateInvestigation(
    tenantId: string,
    eventId: string,
    status: InvestigationStatus,
    entry: NonNullable<AccessEvent['investigation']>['history'][number],
  ): Promise<AccessEventRecord | undefined> {
    try {
      const result = await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { eventId },
        ConditionExpression: 'tenantId = :tenantId',
        UpdateExpression: [
          'SET investigation.#status = :status',
          'investigation.updatedAt = :updatedAt',
          'investigation.history = list_append(if_not_exists(investigation.history, :empty), :entry)',
        ].join(', '),
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':tenantId': tenantId,
          ':status': status,
          ':updatedAt': entry.occurredAt,
          ':empty': [],
          ':entry': [entry],
        },
        ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as AccessEventRecord;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return undefined;
      throw error;
    }
  }

  async list(tenantId: string, query: AccessEventQuery): Promise<Page<AccessEventRecord>> {
    const index = query.facilityId
      ? { name: 'FacilityTimeIndex', key: 'tenantFacility', value: `${tenantId}#${query.facilityId}` }
      : query.deviceId
        ? { name: 'DeviceTimeIndex', key: 'tenantDevice', value: `${tenantId}#${query.deviceId}` }
        : { name: 'TenantTimeIndex', key: 'tenantId', value: tenantId };
    const names: Record<string, string> = { '#pk': index.key, '#time': 'timeKey' };
    const values: Record<string, unknown> = { ':pk': index.value };
    let keyCondition = '#pk = :pk';
    if (query.from && query.to) {
      keyCondition += ' AND #time BETWEEN :from AND :to';
      values[':from'] = `${query.from}#`;
      values[':to'] = `${query.to}#\uffff`;
    } else if (query.from) {
      keyCondition += ' AND #time >= :from';
      values[':from'] = `${query.from}#`;
    } else if (query.to) {
      keyCondition += ' AND #time <= :to';
      values[':to'] = `${query.to}#\uffff`;
    }
    const filters: string[] = [];
    if (query.decision) {
      names['#decision'] = 'decision';
      values[':decision'] = query.decision;
      filters.push('#decision = :decision');
    }
    if (query.facilityId && query.deviceId) {
      names['#deviceId'] = 'deviceId';
      values[':deviceId'] = query.deviceId;
      filters.push('#deviceId = :deviceId');
    }
    const input: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: index.name,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ExclusiveStartKey: decodeToken(query.nextToken),
      Limit: query.limit,
      ScanIndexForward: false,
      ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}),
    };
    const result = await this.client.send(new QueryCommand(input));
    return {
      items: (result.Items ?? []) as AccessEventRecord[],
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey) } : {}),
    };
  }
}
