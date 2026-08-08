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
});
