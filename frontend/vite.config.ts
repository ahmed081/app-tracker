/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { mockApi } from './mock/vite-mock-api.ts';

// VITE_MOCK_API=1 serves the API from mock/fixtures (no backend needed).
// Otherwise /api is proxied to the backend during development.
const useMock = process.env.VITE_MOCK_API === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(useMock ? [mockApi()] : [])],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: useMock ? undefined : { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8081' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
