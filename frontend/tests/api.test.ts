import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/api';

const config = {
  apiBaseUrl: '/api',
  region: 'us-east-1',
  userPoolId: 'us-east-1_example',
  userPoolClientId: 'client',
};

describe('ApiClient', () => {
  it('surfaces API failures instead of returning fallback data', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'UPSTREAM_FAILURE',
        message: 'DynamoDB unavailable',
        requestId: 'request-7',
      },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    const api = new ApiClient(config, { token: async () => 'jwt' }, fetcher);
    await expect(api.devices()).rejects.toEqual(
      new ApiError(503, 'UPSTREAM_FAILURE', 'DynamoDB unavailable', 'request-7'),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('sends policy evaluations and investigation dispositions to dedicated endpoints', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true, item: {} }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ eventId: 'event-1' }), { status: 200 }));
    const api = new ApiClient(config, { token: async () => 'jwt' }, fetcher);
    await api.evaluateAccess({
      eventId: 'd469d282-a3f7-43dc-9ec5-e1f04956b9df',
      deviceId: 'reader-1',
      facilityId: 'hq',
      subjectId: 'badge-7',
      subjectRoles: ['employee'],
      credentialStatus: 'ACTIVE',
      occurredAt: '2026-08-08T12:00:00.000Z',
      policy: { policyId: 'hq', allowedRoles: ['employee'] },
    });
    await api.investigateEvent('event-1', { status: 'RESOLVED', note: 'Reviewed evidence' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/events/evaluate');
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/events/event-1/investigation');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
  });
});
