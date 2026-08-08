import type {
  Device,
  DeviceCreate,
  DeviceHeartbeat,
  DeviceQuery,
  DeviceUpdate,
  Page,
} from '@sop/contracts';
import type { DeviceRecord, DeviceStore } from '../domain';
import { conflict, notFound } from '../lib/errors';

function toDevice(item: DeviceRecord): Device {
  return {
    deviceId: item.deviceId,
    name: item.name,
    type: item.type,
    facilityId: item.facilityId,
    location: item.location,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.lastHeartbeatAt ? { lastHeartbeatAt: item.lastHeartbeatAt } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
  };
}

export class DeviceService {
  constructor(
    private readonly store: DeviceStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async register(tenantId: string, input: DeviceCreate): Promise<Device> {
    const now = this.clock().toISOString();
    const record: DeviceRecord = {
      ...input,
      tenantId,
      status: 'OFFLINE',
      createdAt: now,
      updatedAt: now,
      updatedAtDeviceId: `${now}#${input.deviceId}`,
    };
    if (!await this.store.put(record)) throw conflict('deviceId already exists');
    return toDevice(record);
  }

  async update(tenantId: string, deviceId: string, input: DeviceUpdate): Promise<Device> {
    const updatedAt = this.clock().toISOString();
    const item = await this.store.update(tenantId, deviceId, {
      ...input,
      updatedAt,
      updatedAtDeviceId: `${updatedAt}#${deviceId}`,
    });
    if (!item) throw notFound('Device');
    return toDevice(item);
  }

  async heartbeat(
    tenantId: string,
    deviceId: string,
    input: DeviceHeartbeat,
  ): Promise<Device> {
    const observedAt = input.observedAt
      ? new Date(input.observedAt).toISOString()
      : this.clock().toISOString();
    const item = await this.store.heartbeat(
      tenantId,
      deviceId,
      observedAt,
      input.status,
    );
    if (!item) throw notFound('Device');
    return toDevice(item);
  }

  async list(tenantId: string, query: DeviceQuery): Promise<Page<Device>> {
    const page = await this.store.list(tenantId, query);
    return {
      items: page.items.map(toDevice),
      ...(page.nextToken ? { nextToken: page.nextToken } : {}),
    };
  }
}
