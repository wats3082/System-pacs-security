import type { KpiSummary } from '@sop/contracts';
import type { KpiSnapshot, KpiStore } from '../domain';

const percent = (part: number, total: number): number =>
  total ? Math.round((part / total) * 10_000) / 100 : 0;

export function computeKpis(
  snapshot: KpiSnapshot,
  days: number,
  now: Date,
): KpiSummary {
  const granted = snapshot.events.filter((item) => item.decision === 'GRANTED').length;
  const denied = snapshot.events.length - granted;
  const statusCount = (status: string): number =>
    snapshot.devices.filter((item) => item.status === status).length;
  const videoCount = (status: string): number =>
    snapshot.videos.filter((item) => item.status === status).length;
  const daily = new Map<string, { total: number; granted: number; denied: number }>();
  for (const event of snapshot.events) {
    const date = event.occurredAt.slice(0, 10);
    const entry = daily.get(date) ?? { total: 0, granted: 0, denied: 0 };
    entry.total += 1;
    entry[event.decision === 'GRANTED' ? 'granted' : 'denied'] += 1;
    daily.set(date, entry);
  }
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  const online = statusCount('ONLINE');
  return {
    window: { days, from: from.toISOString(), to: now.toISOString() },
    access: {
      total: snapshot.events.length,
      granted,
      denied,
      denialRatePercent: percent(denied, snapshot.events.length),
    },
    devices: {
      total: snapshot.devices.length,
      online,
      degraded: statusCount('DEGRADED'),
      offline: statusCount('OFFLINE'),
      maintenance: statusCount('MAINTENANCE'),
      availabilityPercent: percent(online, snapshot.devices.length),
    },
    videos: {
      total: snapshot.videos.length,
      queued: videoCount('QUEUED'),
      running: videoCount('RUNNING'),
      complete: videoCount('COMPLETE'),
      failed: videoCount('FAILED'),
    },
    dailyAccess: [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({ date, ...value })),
    generatedAt: now.toISOString(),
  };
}

export class KpiService {
  constructor(
    private readonly store: KpiStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async summary(tenantId: string, days: number): Promise<KpiSummary> {
    const now = this.clock();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - days);
    const snapshot = await this.store.load(
      tenantId,
      from.toISOString(),
      now.toISOString(),
    );
    return computeKpis(snapshot, days, now);
  }
}
