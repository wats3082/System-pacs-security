import type { AccessEvent, AccessEventCreate, AccessEventQuery, Page } from '@sop/contracts';
import type { AccessEventRecord, AccessEventStore } from '../domain';
import { AppError, conflict } from '../lib/errors';
import { payloadHash } from '../lib/hash';

function toAccessEvent(item: AccessEventRecord): AccessEvent {
  return {
    eventId: item.eventId,
    deviceId: item.deviceId,
    facilityId: item.facilityId,
    subjectId: item.subjectId,
    decision: item.decision,
    occurredAt: item.occurredAt,
    actorId: item.actorId,
    ingestedAt: item.ingestedAt,
    ...(item.reason ? { reason: item.reason } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
  };
}

export class AccessEventService {
  constructor(
    private readonly store: AccessEventStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ingest(
    tenantId: string,
    actorId: string,
    input: AccessEventCreate,
  ): Promise<{ item: AccessEvent; created: boolean }> {
    const ingestedAt = this.clock().toISOString();
    const normalized = {
      ...input,
      occurredAt: new Date(input.occurredAt).toISOString(),
    };
    const hash = payloadHash(normalized);
    const record: AccessEventRecord = {
      ...normalized,
      tenantId,
      actorId,
      ingestedAt,
      payloadHash: hash,
      timeKey: `${normalized.occurredAt}#${input.eventId}`,
      tenantFacility: `${tenantId}#${input.facilityId}`,
      tenantDevice: `${tenantId}#${input.deviceId}`,
    };
    if (await this.store.put(record)) {
      return { item: toAccessEvent(record), created: true };
    }
    const existing = await this.store.get(input.eventId);
    if (!existing) {
      throw new AppError(500, 'IDEMPOTENCY_CHECK_FAILED', 'Event idempotency check failed');
    }
    if (existing.tenantId !== tenantId || existing.payloadHash !== hash) {
      throw conflict('eventId already exists with a different payload');
    }
    return { item: toAccessEvent(existing), created: false };
  }

  async list(
    tenantId: string,
    query: AccessEventQuery,
  ): Promise<Page<AccessEvent>> {
    const page = await this.store.list(tenantId, query);
    return {
      items: page.items.map(toAccessEvent),
      ...(page.nextToken ? { nextToken: page.nextToken } : {}),
    };
  }
}
