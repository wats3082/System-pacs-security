import type {
  AccessEvent,
  AccessEventCreate,
  AccessEventQuery,
  Device,
  DeviceCreate,
  DeviceHeartbeat,
  DeviceQuery,
  DeviceUpdate,
  ErrorEnvelope,
  KpiSummary,
  Page,
  VideoAsset,
  VideoCreate,
  VideoQuery,
  VideoStatusUpdate,
} from '@sop/contracts';
import type { AuthClient } from './auth';
import type { RuntimeConfig } from './config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined>;

export class ApiClient {
  private readonly baseUrl: string;

  constructor(
    config: RuntimeConfig,
    private readonly auth: Pick<AuthClient, 'token'>,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, '');
  }

  events(query: Partial<AccessEventQuery> = {}): Promise<Page<AccessEvent>> {
    return this.request('/events', { query });
  }

  ingestEvent(input: AccessEventCreate): Promise<{ item: AccessEvent; created: boolean }> {
    return this.request('/events', { method: 'POST', body: input });
  }

  devices(query: Partial<DeviceQuery> = {}): Promise<Page<Device>> {
    return this.request('/devices', { query });
  }

  registerDevice(input: DeviceCreate): Promise<Device> {
    return this.request('/devices', { method: 'POST', body: input });
  }

  updateDevice(deviceId: string, input: DeviceUpdate): Promise<Device> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      body: input,
    });
  }

  heartbeat(deviceId: string, input: DeviceHeartbeat): Promise<Device> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
      method: 'POST',
      body: input,
    });
  }

  videos(query: Partial<VideoQuery> = {}): Promise<Page<VideoAsset>> {
    return this.request('/videos', { query });
  }

  registerVideo(input: VideoCreate): Promise<VideoAsset> {
    return this.request('/videos', { method: 'POST', body: input });
  }

  updateVideoStatus(videoId: string, input: VideoStatusUpdate): Promise<VideoAsset> {
    return this.request(`/videos/${encodeURIComponent(videoId)}`, {
      method: 'PATCH',
      body: input,
    });
  }

  kpis(windowDays = 7): Promise<KpiSummary> {
    return this.request('/kpis/summary', { query: { windowDays } });
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; query?: Query } = {},
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const response = await this.fetcher(
      `${this.baseUrl}${path}${params.size ? `?${params}` : ''}`,
      {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: await this.auth.token(),
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'API returned invalid JSON');
    }
    if (!response.ok) {
      const envelope = payload as Partial<ErrorEnvelope>;
      throw new ApiError(
        response.status,
        envelope.error?.code ?? 'REQUEST_FAILED',
        envelope.error?.message ?? `Request failed with HTTP ${response.status}`,
        envelope.error?.requestId,
      );
    }
    return payload as T;
  }
}
