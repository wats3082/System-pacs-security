import type { AccessEvent, Device, KpiSummary, VideoAsset } from '@sop/contracts';

const now = new Date();
const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

let events: AccessEvent[] = [
  decisionEvent('0e41dfd2-e64a-4af2-b2cf-b701121851f8', 'badge-1042', 'DENIED', 12, 70,
    ['ROLE_NOT_AUTHORIZED', 'OUTSIDE_ALLOWED_HOURS'], 'INVESTIGATING'),
  decisionEvent('6dccf419-7a30-45f9-8043-a0a716744e85', 'badge-8831', 'DENIED', 38, 75,
    ['CREDENTIAL_SUSPENDED'], 'UNREVIEWED'),
  decisionEvent('e00f3af7-719a-45cc-ad69-0e0841ae8a47', 'badge-2209', 'GRANTED', 64, 0, [], 'UNREVIEWED'),
];

const devices: Device[] = [
  { deviceId: 'reader-north-01', name: 'North lobby reader', type: 'ACCESS_READER', facilityId: 'hq', location: 'North lobby', status: 'ONLINE', lastHeartbeatAt: iso(2), createdAt: iso(9000), updatedAt: iso(2) },
  { deviceId: 'reader-lab-02', name: 'Restricted lab reader', type: 'ACCESS_READER', facilityId: 'hq', location: 'Research floor', status: 'DEGRADED', lastHeartbeatAt: iso(19), createdAt: iso(8000), updatedAt: iso(19) },
  { deviceId: 'camera-north-01', name: 'North lobby camera', type: 'CAMERA', facilityId: 'hq', location: 'North lobby', status: 'ONLINE', lastHeartbeatAt: iso(1), createdAt: iso(7000), updatedAt: iso(1) },
];

const videos: VideoAsset[] = [{
  videoId: 'b536df80-da1f-411d-b606-2c216ca2872e',
  title: 'North lobby denied access clip',
  facilityId: 'hq',
  sourceDeviceId: 'camera-north-01',
  recordedAt: iso(12),
  contentType: 'video/mp4',
  tags: ['denied-access', 'north-lobby'],
  status: 'COMPLETE',
  registeredBy: 'demo-system',
  createdAt: iso(10),
  updatedAt: iso(8),
}];

export function createDemoFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input), 'https://demo.local');
    const method = init?.method ?? 'GET';
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (url.pathname === '/api/events/evaluate' && method === 'POST') {
      const value = JSON.parse(String(init?.body)) as DemoDecision;
      const roles = value.subjectRoles.filter((role: string) => value.policy.allowedRoles.includes(role));
      const hour = new Date(value.occurredAt).getUTCHours();
      const scheduleMatched = hour >= value.policy.scheduleUtc.startHour && hour < value.policy.scheduleUtc.endHour;
      const signals = [
        ...(value.credentialStatus === 'ACTIVE' ? [] : [`CREDENTIAL_${value.credentialStatus}`]),
        ...(roles.length ? [] : ['ROLE_NOT_AUTHORIZED']),
        ...(scheduleMatched ? [] : ['OUTSIDE_ALLOWED_HOURS']),
      ];
      const item = decisionEvent(value.eventId, value.subjectId, signals.length ? 'DENIED' : 'GRANTED', 0,
        Math.min(100, (signals.length ? 35 : 0) + (value.credentialStatus === 'ACTIVE' ? 0 : 40) + (roles.length ? 0 : 20) + (scheduleMatched ? 0 : 15)),
        signals, 'UNREVIEWED', value);
      events = [item, ...events];
      return response({ item, created: true }, 201);
    }
    const match = url.pathname.match(/^\/api\/events\/([^/]+)\/investigation$/);
    if (match && method === 'PATCH') {
      const value = JSON.parse(String(init?.body)) as {
        status: NonNullable<AccessEvent['investigation']>['status'];
        note: string;
      };
      const item = events.find((entry) => entry.eventId === match[1]);
      if (!item?.investigation) return response({ error: { message: 'Event not found' } }, 404);
      const occurredAt = new Date().toISOString();
      item.investigation = {
        status: value.status,
        updatedAt: occurredAt,
        history: [...item.investigation.history, { ...value, actorId: 'demo-operator', occurredAt }],
      };
      return response(item);
    }
    if (url.pathname === '/api/events') {
      const filtered = events.filter((item) =>
        (!url.searchParams.get('decision') || item.decision === url.searchParams.get('decision'))
        && (!url.searchParams.get('facilityId') || item.facilityId === url.searchParams.get('facilityId'))
        && (!url.searchParams.get('deviceId') || item.deviceId === url.searchParams.get('deviceId')));
      return response({ items: filtered });
    }
    if (url.pathname === '/api/devices') return response({ items: devices });
    if (url.pathname === '/api/videos') return response({ items: videos });
    if (url.pathname === '/api/kpis/summary') return response(kpis());
    return response({ error: { code: 'DEMO_UNSUPPORTED', message: 'This write is unavailable in the static demo.' } }, 501);
  };
}

function decisionEvent(
  eventId: string,
  subjectId: string,
  decision: 'GRANTED' | 'DENIED',
  minutesAgo: number,
  score: number,
  signals: string[],
  status: 'UNREVIEWED' | 'INVESTIGATING',
  value?: DemoDecision,
): AccessEvent {
  const occurredAt = value?.occurredAt ?? iso(minutesAgo);
  return {
    eventId,
    deviceId: value?.deviceId ?? 'reader-north-01',
    facilityId: value?.facilityId ?? 'hq',
    subjectId,
    decision,
    occurredAt,
    actorId: 'policy-engine',
    ingestedAt: new Date().toISOString(),
    reason: decision === 'GRANTED' ? 'Policy requirements satisfied' : signals.join(', '),
    evidence: {
      policyId: value?.policy.policyId ?? 'hq-standard-entry-v1',
      credentialStatus: value?.credentialStatus ?? (signals[0] === 'CREDENTIAL_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
      matchedRoles: value ? value.subjectRoles.filter((role: string) => value.policy.allowedRoles.includes(role)) : [],
      scheduleMatched: !signals.includes('OUTSIDE_ALLOWED_HOURS'),
      evaluatedAt: new Date().toISOString(),
    },
    risk: { score, signals },
    investigation: { status, updatedAt: new Date().toISOString(), history: [] },
  };
}

interface DemoDecision {
  eventId: string;
  deviceId: string;
  facilityId: string;
  subjectId: string;
  subjectRoles: string[];
  credentialStatus: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  occurredAt: string;
  policy: {
    policyId: string;
    allowedRoles: string[];
    scheduleUtc: { startHour: number; endHour: number };
  };
}

function kpis(): KpiSummary {
  const denied = events.filter((item) => item.decision === 'DENIED').length;
  return {
    window: { days: 7, from: iso(10_080), to: new Date().toISOString() },
    access: { total: events.length, granted: events.length - denied, denied, denialRatePercent: Math.round(denied / events.length * 100) },
    devices: { total: devices.length, online: 2, degraded: 1, offline: 0, maintenance: 0, availabilityPercent: 67 },
    videos: { total: 1, queued: 0, running: 0, complete: 1, failed: 0 },
    dailyAccess: [{ date: new Date().toISOString().slice(0, 10), total: events.length, granted: events.length - denied, denied }],
    generatedAt: new Date().toISOString(),
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
