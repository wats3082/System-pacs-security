import type {
  AccessDecisionRequest,
  AccessEvent,
  AccessEventCreate,
  AccessEventQuery,
  InvestigationUpdate,
  Page,
} from '@sop/contracts';
import type { AccessEventRecord, AccessEventStore } from '../domain';
import { AppError, conflict } from '../lib/errors';
import { notFound } from '../lib/errors';
import { payloadHash } from '../lib/hash';

type PersistableAccessEvent = AccessEventCreate & Partial<
  Pick<AccessEvent, 'evidence' | 'risk' | 'investigation'>
>;

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
    ...(item.evidence ? { evidence: item.evidence } : {}),
    ...(item.risk ? { risk: item.risk } : {}),
    ...(item.investigation ? { investigation: item.investigation } : {}),
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
    input: PersistableAccessEvent,
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

  async evaluate(
    tenantId: string,
    actorId: string,
    input: AccessDecisionRequest,
  ): Promise<{ item: AccessEvent; created: boolean }> {
    const occurredAt = new Date(input.occurredAt);
    const matchedRoles = input.subjectRoles.filter((role) => input.policy.allowedRoles.includes(role));
    const scheduleMatched = input.policy.scheduleUtc
      ? isHourAllowed(
        occurredAt.getUTCHours(),
        input.policy.scheduleUtc.startHour,
        input.policy.scheduleUtc.endHour,
      )
      : true;
    const signals = [
      ...(input.credentialStatus === 'ACTIVE' ? [] : [`CREDENTIAL_${input.credentialStatus}`]),
      ...(matchedRoles.length ? [] : ['ROLE_NOT_AUTHORIZED']),
      ...(scheduleMatched ? [] : ['OUTSIDE_ALLOWED_HOURS']),
    ];
    const decision = signals.length ? 'DENIED' as const : 'GRANTED' as const;
    const riskScore = Math.min(100,
      (decision === 'DENIED' ? 35 : 0)
      + (input.credentialStatus === 'ACTIVE' ? 0 : 40)
      + (matchedRoles.length ? 0 : 20)
      + (scheduleMatched ? 0 : 15));
    const evaluatedAt = this.clock().toISOString();
    return this.ingest(tenantId, actorId, {
      eventId: input.eventId,
      deviceId: input.deviceId,
      facilityId: input.facilityId,
      subjectId: input.subjectId,
      decision,
      occurredAt: input.occurredAt,
      reason: decision === 'GRANTED' ? 'Policy requirements satisfied' : signals.join(', '),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      evidence: {
        policyId: input.policy.policyId,
        credentialStatus: input.credentialStatus,
        matchedRoles,
        scheduleMatched,
        evaluatedAt,
      },
      risk: { score: riskScore, signals },
      investigation: {
        status: 'UNREVIEWED',
        updatedAt: evaluatedAt,
        history: [],
      },
    });
  }

  async investigate(
    tenantId: string,
    actorId: string,
    eventId: string,
    input: InvestigationUpdate,
  ): Promise<AccessEvent> {
    const occurredAt = this.clock().toISOString();
    const item = await this.store.updateInvestigation(tenantId, eventId, input.status, {
      ...input,
      actorId,
      occurredAt,
    });
    if (!item) throw notFound('Access event');
    return toAccessEvent(item);
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

function isHourAllowed(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
