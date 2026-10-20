// Runtime configuration, read from /config.js so one build can be deployed
// against any backend (the frontend is deployed separately from the backend).
//   window.__APP_CONFIG__ = { apiBaseUrl: "https://api.example.com" }
// An empty apiBaseUrl means "same origin" (e.g. behind a reverse proxy).

interface RuntimeConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: (window.__APP_CONFIG__?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
};
