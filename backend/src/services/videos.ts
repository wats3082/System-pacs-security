import type {
  Page,
  VideoAsset,
  VideoCreate,
  VideoQuery,
  VideoStatusUpdate,
} from '@sop/contracts';
import type { VideoRecord, VideoStore } from '../domain';
import { conflict, notFound } from '../lib/errors';

function toVideo(item: VideoRecord): VideoAsset {
  return {
    videoId: item.videoId,
    title: item.title,
    facilityId: item.facilityId,
    recordedAt: item.recordedAt,
    contentType: item.contentType,
    tags: item.tags,
    status: item.status,
    registeredBy: item.registeredBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.sourceDeviceId ? { sourceDeviceId: item.sourceDeviceId } : {}),
    ...(item.sourceUri ? { sourceUri: item.sourceUri } : {}),
    ...(item.durationSeconds ? { durationSeconds: item.durationSeconds } : {}),
    ...(item.sizeBytes ? { sizeBytes: item.sizeBytes } : {}),
    ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
  };
}

export class VideoService {
  constructor(
    private readonly store: VideoStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async register(
    tenantId: string,
    actorId: string,
    input: VideoCreate,
  ): Promise<VideoAsset> {
    const now = this.clock().toISOString();
    const record: VideoRecord = {
      ...input,
      tenantId,
      status: 'QUEUED',
      registeredBy: actorId,
      createdAt: now,
      updatedAt: now,
      createdAtVideoId: `${now}#${input.videoId}`,
      tenantStatus: `${tenantId}#QUEUED`,
      searchText: [
        input.title,
        input.facilityId,
        input.sourceDeviceId,
        ...input.tags,
      ].filter(Boolean).join(' ').toLocaleLowerCase(),
    };
    if (!await this.store.put(record)) throw conflict('videoId already exists');
    return toVideo(record);
  }

  async updateStatus(
    tenantId: string,
    videoId: string,
    input: VideoStatusUpdate,
  ): Promise<VideoAsset> {
    const updatedAt = this.clock().toISOString();
    const item = await this.store.update(tenantId, videoId, {
      status: input.status,
      tenantStatus: `${tenantId}#${input.status}`,
      updatedAt,
      errorMessage: input.errorMessage ?? '',
    });
    if (!item) throw notFound('Video');
    return toVideo(item);
  }

  async list(tenantId: string, query: VideoQuery): Promise<Page<VideoAsset>> {
    const page = await this.store.list(tenantId, query);
    return {
      items: page.items.map(toVideo),
      ...(page.nextToken ? { nextToken: page.nextToken } : {}),
    };
  }
}
