import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: { global: 'globalThis' },
    optimizeDeps: {
      esbuildOptions: { define: { global: 'globalThis' } },
    },
    server: {
      port: 5173,
      ...(env.VITE_PROXY_TARGET ? {
        proxy: {
          '/api': {
            target: env.VITE_PROXY_TARGET,
            changeOrigin: true,
            secure: true,
          },
        },
      } : {}),
    },
  };
});
