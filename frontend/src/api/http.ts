import { runtimeConfig } from '@/config/runtime';

/**
 * An API failure with the HTTP status (0 = network error), the server's message
 * and, for a rejected form (400), a message per field.
 */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | boolean | null | undefined | readonly string[];

export function buildUrl(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  const qs = params.toString();
  return `${runtimeConfig.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`;
}

// The Settings API, and writes to the watchlist and alerts, need the X-Admin-Key
// header when the server sets ADMIN_KEY.
// The key lives in sessionStorage only: it is forgotten when the tab closes.
const ADMIN_KEY_STORAGE = 'rankline.adminKey';

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string) {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* storage unavailable: the key is asked again */
  }
}

const KEYED_PATHS = ['/api/manage', '/api/watch', '/api/alerts'];

async function request<T>(method: string, path: string, query?: Record<string, QueryValue>, body?: unknown,
  signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const adminKey = KEYED_PATHS.some((p) => path.startsWith(p)) ? getAdminKey() : '';
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let fieldErrors: Record<string, string> = {};
    try {
      const problem = (await res.json()) as { detail?: string; errors?: Record<string, string> };
      if (problem.detail) detail = problem.detail;
      if (problem.errors) fieldErrors = problem.errors;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, detail, fieldErrors);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getJson<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, query, undefined, signal);
}

export function sendJson<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, undefined, body);
}
