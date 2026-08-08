import { describe, expect, it, vi } from 'vitest';
import type {
  AccessEventQuery,
  DeviceQuery,
  Page,
  VideoQuery,
} from '@sop/contracts';
import type {
  AccessEventRecord,
  AccessEventStore,
  DeviceRecord,
  DeviceStore,
  VideoRecord,
  VideoStore,
} from '../src/domain';
import { AccessEventService } from '../src/services/events';
import { DeviceService } from '../src/services/devices';
import { computeKpis, KpiService } from '../src/services/kpis';
import { VideoService } from '../src/services/videos';

const now = new Date('2026-08-08T12:00:00.000Z');
const emptyPage = <T>(): Page<T> => ({ items: [] });

class EventMemoryStore implements AccessEventStore {
  readonly items = new Map<string, AccessEventRecord>();

  async put(item: AccessEventRecord): Promise<boolean> {
    if (this.items.has(item.eventId)) return false;
    this.items.set(item.eventId, item);
    return true;
  }

  async get(eventId: string): Promise<AccessEventRecord | undefined> {
    return this.items.get(eventId);
  }

  async list(_tenantId: string, _query: AccessEventQuery): Promise<Page<AccessEventRecord>> {
    return { items: [...this.items.values()] };
  }
}

class DeviceMemoryStore implements DeviceStore {
  readonly items = new Map<string, DeviceRecord>();

  async put(item: DeviceRecord): Promise<boolean> {
    if (this.items.has(item.deviceId)) return false;
    this.items.set(item.deviceId, item);
    return true;
  }

  async get(deviceId: string): Promise<DeviceRecord | undefined> {
    return this.items.get(deviceId);
  }

  async update(
    tenantId: string,
    deviceId: string,
    changes: Partial<DeviceRecord>,
  ): Promise<DeviceRecord | undefined> {
    const current = this.items.get(deviceId);
    if (!current || current.tenantId !== tenantId) return undefined;
    const next = { ...current, ...changes };
    this.items.set(deviceId, next);
    return next;
  }

  async heartbeat(
    tenantId: string,
    deviceId: string,
    observedAt: string,
    status: DeviceRecord['status'],
  ): Promise<DeviceRecord | undefined> {
    const current = this.items.get(deviceId);
    if (!current || current.tenantId !== tenantId) return undefined;
    if (current.lastHeartbeatAt && current.lastHeartbeatAt >= observedAt) return current;
    const next = {
      ...current,
      status,
      lastHeartbeatAt: observedAt,
      updatedAt: observedAt,
      updatedAtDeviceId: `${observedAt}#${deviceId}`,
    };
    this.items.set(deviceId, next);
    return next;
  }

  async list(_tenantId: string, _query: DeviceQuery): Promise<Page<DeviceRecord>> {
    return emptyPage();
  }
}

class VideoMemoryStore implements VideoStore {
  readonly items = new Map<string, VideoRecord>();

  async put(item: VideoRecord): Promise<boolean> {
    if (this.items.has(item.videoId)) return false;
    this.items.set(item.videoId, item);
    return true;
  }

  async get(videoId: string): Promise<VideoRecord | undefined> {
    return this.items.get(videoId);
  }

  async update(
    tenantId: string,
    videoId: string,
    changes: Partial<VideoRecord>,
  ): Promise<VideoRecord | undefined> {
    const current = this.items.get(videoId);
    if (!current || current.tenantId !== tenantId) return undefined;
    const next = { ...current, ...changes };
    this.items.set(videoId, next);
    return next;
  }

  async list(_tenantId: string, _query: VideoQuery): Promise<Page<VideoRecord>> {
    return emptyPage();
  }
}

describe('AccessEventService', () => {
  const input = {
    eventId: 'd469d282-a3f7-43dc-9ec5-e1f04956b9df',
    deviceId: 'reader-1',
    facilityId: 'hq',
    subjectId: 'badge-7',
    decision: 'GRANTED' as const,
    occurredAt: '2026-08-08T11:59:00.000Z',
  };

  it('is idempotent for the same event payload', async () => {
    const service = new AccessEventService(new EventMemoryStore(), () => now);
    const first = await service.ingest('default', 'user-1', input);
    const second = await service.ingest('default', 'user-1', input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.item).toEqual(first.item);
  });

  it('rejects reuse of an event id with a different payload', async () => {
    const service = new AccessEventService(new EventMemoryStore(), () => now);
    await service.ingest('default', 'user-1', input);
    await expect(service.ingest('default', 'user-1', {
      ...input,
      decision: 'DENIED',
    })).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('persists normalized UTC timestamps for chronological indexes', async () => {
    const store = new EventMemoryStore();
    const service = new AccessEventService(store, () => now);
    await service.ingest('default', 'user-1', {
      ...input,
      occurredAt: '2026-08-08T13:59:00.000+02:00',
    });
    expect(store.items.get(input.eventId)?.timeKey)
      .toBe(`2026-08-08T11:59:00.000Z#${input.eventId}`);
  });
});

describe('DeviceService', () => {
  it('registers offline and records a heartbeat transition', async () => {
    const service = new DeviceService(new DeviceMemoryStore(), () => now);
    const device = await service.register('default', {
      deviceId: 'reader-1',
      name: 'North entrance',
      type: 'ACCESS_READER',
      facilityId: 'hq',
      location: 'Floor 1',
    });
    expect(device.status).toBe('OFFLINE');
    const updated = await service.heartbeat('default', 'reader-1', { status: 'ONLINE' });
    expect(updated).toMatchObject({
      status: 'ONLINE',
      lastHeartbeatAt: now.toISOString(),
    });
  });

  it('ignores a delayed heartbeat older than persisted device state', async () => {
    const store = new DeviceMemoryStore();
    const service = new DeviceService(store, () => now);
    await service.register('default', {
      deviceId: 'reader-1',
      name: 'North entrance',
      type: 'ACCESS_READER',
      facilityId: 'hq',
      location: 'Floor 1',
    });
    await service.heartbeat('default', 'reader-1', {
      status: 'ONLINE',
      observedAt: '2026-08-08T12:00:00.000Z',
    });
    const delayed = await service.heartbeat('default', 'reader-1', {
      status: 'OFFLINE',
      observedAt: '2026-08-08T11:00:00.000Z',
    });
    expect(delayed).toMatchObject({
      status: 'ONLINE',
      lastHeartbeatAt: '2026-08-08T12:00:00.000Z',
    });
  });
});

describe('VideoService', () => {
  it('registers metadata as queued and advances processing status', async () => {
    const service = new VideoService(new VideoMemoryStore(), () => now);
    const video = await service.register('default', 'user-1', {
      videoId: '5a6b8c4f-5955-4ee8-b7b9-87e3850683c8',
      title: 'North entrance clip',
      facilityId: 'hq',
      recordedAt: '2026-08-08T11:30:00.000Z',
      contentType: 'video/mp4',
      tags: ['entrance'],
    });
    expect(video.status).toBe('QUEUED');
    const updated = await service.updateStatus('default', video.videoId, {
      status: 'COMPLETE',
    });
    expect(updated.status).toBe('COMPLETE');
  });
});

describe('computeKpis', () => {
  it('derives dashboard metrics from persisted records', () => {
    const result = computeKpis({
      events: [
        { decision: 'GRANTED', occurredAt: '2026-08-08T10:00:00.000Z' },
        { decision: 'DENIED', occurredAt: '2026-08-08T11:00:00.000Z' },
      ] as AccessEventRecord[],
      devices: [
        { status: 'ONLINE' },
        { status: 'OFFLINE' },
      ] as DeviceRecord[],
      videos: [
        { status: 'COMPLETE' },
        { status: 'FAILED' },
      ] as VideoRecord[],
    }, 7, now);
    expect(result.access).toEqual({
      total: 2,
      granted: 1,
      denied: 1,
      denialRatePercent: 50,
    });
    expect(result.devices.availabilityPercent).toBe(50);
    expect(result.videos).toMatchObject({ total: 2, complete: 1, failed: 1 });
    expect(result.dailyAccess).toEqual([
      { date: '2026-08-08', total: 2, granted: 1, denied: 1 },
    ]);
  });

  it('loads records with both declared window bounds', async () => {
    const store = {
      load: vi.fn().mockResolvedValue({ events: [], devices: [], videos: [] }),
    };
    const service = new KpiService(store, () => now);
    await service.summary('default', 7);
    expect(store.load).toHaveBeenCalledWith(
      'default',
      '2026-08-01T12:00:00.000Z',
      '2026-08-08T12:00:00.000Z',
    );
  });
});
