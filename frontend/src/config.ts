export interface RuntimeConfig {
  apiBaseUrl: string;
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  demoMode?: boolean;
}

function isConfig(value: unknown): value is RuntimeConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return ['apiBaseUrl', 'region', 'userPoolId', 'userPoolClientId']
    .every((key) => typeof config[key] === 'string' && Boolean(config[key]));
}

export async function loadConfig(
  fetcher: typeof fetch = fetch,
): Promise<RuntimeConfig> {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    return {
      apiBaseUrl: '/api',
      region: 'static-demo',
      userPoolId: 'demo',
      userPoolClientId: 'demo',
      demoMode: true,
    };
  }
  const response = await fetcher('/api/config', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Runtime configuration request failed with HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  if (!isConfig(value)) throw new Error('Runtime configuration is invalid');
  return value;
}
