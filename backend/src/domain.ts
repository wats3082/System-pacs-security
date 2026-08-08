import type {
  AccessEvent,
  AccessEventCreate,
  AccessEventQuery,
  Device,
  DeviceCreate,
  DeviceHeartbeat,
  DeviceQuery,
  DeviceUpdate,
  Page,
  VideoAsset,
  VideoCreate,
  VideoQuery,
  VideoStatusUpdate,
} from '@sop/contracts';

export interface AccessEventRecord extends AccessEvent {
  tenantId: string;
  timeKey: string;
  tenantFacility: string;
  tenantDevice: string;
  payloadHash: string;
}

export interface DeviceRecord extends Device {
  tenantId: string;
  updatedAtDeviceId: string;
}

export interface VideoRecord extends VideoAsset {
  tenantId: string;
  tenantStatus: string;
  createdAtVideoId: string;
  searchText: string;
}

export interface AccessEventStore {
  put(item: AccessEventRecord): Promise<boolean>;
  get(eventId: string): Promise<AccessEventRecord | undefined>;
  list(tenantId: string, query: AccessEventQuery): Promise<Page<AccessEventRecord>>;
}

export interface DeviceStore {
  put(item: DeviceRecord): Promise<boolean>;
  get(deviceId: string): Promise<DeviceRecord | undefined>;
  update(
    tenantId: string,
    deviceId: string,
    changes: Partial<DeviceRecord>,
  ): Promise<DeviceRecord | undefined>;
  heartbeat(
    tenantId: string,
    deviceId: string,
    observedAt: string,
    status: DeviceRecord['status'],
  ): Promise<DeviceRecord | undefined>;
  list(tenantId: string, query: DeviceQuery): Promise<Page<DeviceRecord>>;
}

export interface VideoStore {
  put(item: VideoRecord): Promise<boolean>;
  get(videoId: string): Promise<VideoRecord | undefined>;
  update(
    tenantId: string,
    videoId: string,
    changes: Partial<VideoRecord>,
  ): Promise<VideoRecord | undefined>;
  list(tenantId: string, query: VideoQuery): Promise<Page<VideoRecord>>;
}

export interface KpiSnapshot {
  events: AccessEventRecord[];
  devices: DeviceRecord[];
  videos: VideoRecord[];
}

export interface KpiStore {
  load(tenantId: string, from: string, to: string): Promise<KpiSnapshot>;
}

export type {
  AccessEventCreate,
  DeviceCreate,
  DeviceHeartbeat,
  DeviceUpdate,
  VideoCreate,
  VideoStatusUpdate,
};
