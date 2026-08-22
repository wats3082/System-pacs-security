import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const textSchema = z.string().trim().min(1).max(200);
const isoDateSchema = z.iso.datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const metadataValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

export const metadataSchema = z.record(
  z.string().min(1).max(64),
  metadataValueSchema,
).refine((value) => Object.keys(value).length <= 20, 'Metadata is limited to 20 fields');

export const accessDecisions = ['GRANTED', 'DENIED'] as const;
export const credentialStatuses = ['ACTIVE', 'SUSPENDED', 'EXPIRED'] as const;
export const investigationStatuses = ['UNREVIEWED', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'] as const;
export const deviceTypes = ['ACCESS_READER', 'CAMERA', 'SENSOR', 'CONTROLLER'] as const;
export const deviceStatuses = ['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE'] as const;
export const videoStatuses = ['QUEUED', 'RUNNING', 'COMPLETE', 'FAILED'] as const;

export const accessEventCreateSchema = z.strictObject({
  eventId: z.uuid(),
  deviceId: idSchema,
  facilityId: idSchema,
  subjectId: idSchema,
  decision: z.enum(accessDecisions),
  reason: z.string().trim().max(300).optional(),
  occurredAt: isoDateSchema,
  metadata: metadataSchema.optional(),
});

export const accessDecisionRequestSchema = z.strictObject({
  eventId: z.uuid(),
  deviceId: idSchema,
  facilityId: idSchema,
  subjectId: idSchema,
  subjectRoles: z.array(idSchema).min(1).max(20),
  credentialStatus: z.enum(credentialStatuses),
  occurredAt: isoDateSchema,
  policy: z.strictObject({
    policyId: idSchema,
    allowedRoles: z.array(idSchema).min(1).max(20),
    scheduleUtc: z.strictObject({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    }).optional(),
  }),
  metadata: metadataSchema.optional(),
});

export const investigationUpdateSchema = z.strictObject({
  status: z.enum(investigationStatuses),
  note: z.string().trim().min(3).max(500),
});

export const accessEventQuerySchema = z.strictObject({
  facilityId: idSchema.optional(),
  deviceId: idSchema.optional(),
  decision: z.enum(accessDecisions).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  nextToken: z.string().max(4096).optional(),
}).refine(
  ({ from, to }) => !from || !to || new Date(from) <= new Date(to),
  { message: '"from" must be before or equal to "to"', path: ['from'] },
);

export const deviceCreateSchema = z.strictObject({
  deviceId: idSchema,
  name: textSchema,
  type: z.enum(deviceTypes),
  facilityId: idSchema,
  location: z.string().trim().min(1).max(300),
  metadata: metadataSchema.optional(),
});

export const deviceUpdateSchema = z.strictObject({
  name: textSchema.optional(),
  facilityId: idSchema.optional(),
  location: z.string().trim().min(1).max(300).optional(),
  status: z.enum(deviceStatuses).optional(),
  metadata: metadataSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const deviceHeartbeatSchema = z.strictObject({
  observedAt: isoDateSchema.optional(),
  status: z.enum(deviceStatuses).default('ONLINE'),
});

export const deviceQuerySchema = z.strictObject({
  type: z.enum(deviceTypes).optional(),
  status: z.enum(deviceStatuses).optional(),
  facilityId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  nextToken: z.string().max(4096).optional(),
});

export const videoCreateSchema = z.strictObject({
  videoId: z.uuid(),
  title: textSchema,
  facilityId: idSchema,
  sourceDeviceId: idSchema.optional(),
  sourceUri: z.url().max(500).optional(),
  recordedAt: isoDateSchema,
  durationSeconds: z.number().positive().max(86400).optional(),
  sizeBytes: z.number().int().positive().max(5_000_000_000_000).optional(),
  contentType: z.string().trim().min(1).max(100).default('video/mp4'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  metadata: metadataSchema.optional(),
});

export const videoStatusUpdateSchema = z.strictObject({
  status: z.enum(videoStatuses),
  errorMessage: z.string().trim().min(1).max(500).optional(),
}).refine(
  ({ status, errorMessage }) => status === 'FAILED' ? Boolean(errorMessage) : !errorMessage,
  { message: 'errorMessage is required only when status is FAILED', path: ['errorMessage'] },
);

export const videoQuerySchema = z.strictObject({
  query: z.string().trim().min(1).max(100).optional(),
  status: z.enum(videoStatuses).optional(),
  facilityId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  nextToken: z.string().max(4096).optional(),
});

export const kpiQuerySchema = z.strictObject({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
});

export type AccessEventCreate = z.infer<typeof accessEventCreateSchema>;
export type AccessEventQuery = z.infer<typeof accessEventQuerySchema>;
export type AccessDecision = typeof accessDecisions[number];
export type AccessDecisionRequest = z.infer<typeof accessDecisionRequestSchema>;
export type CredentialStatus = typeof credentialStatuses[number];
export type InvestigationStatus = typeof investigationStatuses[number];
export type InvestigationUpdate = z.infer<typeof investigationUpdateSchema>;
export type DeviceCreate = z.infer<typeof deviceCreateSchema>;
export type DeviceUpdate = z.infer<typeof deviceUpdateSchema>;
export type DeviceHeartbeat = z.infer<typeof deviceHeartbeatSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;
export type DeviceType = typeof deviceTypes[number];
export type DeviceStatus = typeof deviceStatuses[number];
export type VideoCreate = z.infer<typeof videoCreateSchema>;
export type VideoStatusUpdate = z.infer<typeof videoStatusUpdateSchema>;
export type VideoQuery = z.infer<typeof videoQuerySchema>;
export type VideoStatus = typeof videoStatuses[number];
export type KpiQuery = z.infer<typeof kpiQuerySchema>;

export interface AccessEvent extends AccessEventCreate {
  actorId: string;
  ingestedAt: string;
  evidence?: {
    policyId: string;
    credentialStatus: CredentialStatus;
    matchedRoles: string[];
    scheduleMatched: boolean;
    evaluatedAt: string;
  };
  risk?: { score: number; signals: string[] };
  investigation?: {
    status: InvestigationStatus;
    updatedAt: string;
    history: Array<{
      status: InvestigationStatus;
      note: string;
      actorId: string;
      occurredAt: string;
    }>;
  };
}

export interface Device extends DeviceCreate {
  status: DeviceStatus;
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoAsset extends VideoCreate {
  status: VideoStatus;
  errorMessage?: string;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextToken?: string;
}

export interface KpiSummary {
  window: { days: number; from: string; to: string };
  access: { total: number; granted: number; denied: number; denialRatePercent: number };
  devices: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
    maintenance: number;
    availabilityPercent: number;
  };
  videos: {
    total: number;
    queued: number;
    running: number;
    complete: number;
    failed: number;
  };
  dailyAccess: Array<{ date: string; total: number; granted: number; denied: number }>;
  generatedAt: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
