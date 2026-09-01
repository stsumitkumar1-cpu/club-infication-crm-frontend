/**
 * Where API calls go, from VITE_API_BASE_URL (see .env.example).
 *
 * The fallback is not laziness: `/api` is the value that makes the dev proxy
 * work, so a developer with no .env gets a working app rather than requests to
 * `undefined/auth/login`. Any trailing slash is stripped so joining a path that
 * starts with `/` cannot produce a double slash.
 */
const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api'
).replace(/\/+$/, '');

const TOKEN_KEY = 'crm_token';
const REFRESH_KEY = 'crm_refresh_token';
const USER_KEY = 'crm_user';

/**
 * A 401 from these endpoints is a genuine answer (wrong password, dead refresh
 * token) rather than an expired session, so it must not trigger the
 * refresh-and-redirect path — doing so reloads the login page and wipes the
 * error the user needs to read.
 */
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Shared in-flight refresh. Several requests commonly 401 at the same moment
 * (the dashboard fires /auth/me and /customers/stats together); without this
 * they would each POST /auth/refresh independently.
 */
let refreshInFlight: Promise<string | null> | null = null;

function clearSession(): void {
  [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach((key) =>
    localStorage.removeItem(key),
  );
}

function redirectToLogin(): void {
  // Already on the login screen: no need to reload it.
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

async function requestNewAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
    }
    return data.accessToken as string;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Carries the HTTP status so callers can tell *why* a request failed.
 *
 * This distinction matters: "your session is invalid" (401) and "the server is
 * unreachable" (network / 5xx) look identical to a bare `catch`, and treating
 * the second as the first signs the user out over a brief outage.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    /** 0 when the request never reached a server. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Server unreachable, DNS failure, proxy refused — nothing to do with auth. */
  get isUnreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** The session is genuinely no longer valid. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** class-validator returns `message` as an array for validation failures. */
function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return null;
}

export async function fetchApi(url: string, options: RequestInit = {}) {
  const isAuthCall = AUTH_ENDPOINTS.some((path) => url.startsWith(path));

  const send = async (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    try {
      return await fetch(`${BASE_URL}${url}`, { ...options, headers });
    } catch {
      // fetch only rejects when the request never reached a server: the API is
      // down, the dev proxy refused, or the network dropped. Surfaced as status
      // 0 so it is never mistaken for an auth failure.
      throw new ApiError(
        'Cannot reach the server. Check that the API is running.',
        0,
      );
    }
  };

  let response = await send(localStorage.getItem(TOKEN_KEY));

  // Access tokens are short-lived by design, so an expired one is routine:
  // refresh once, replay the original request, and only then give up.
  if (response.status === 401 && !isAuthCall) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      response = await send(newToken);
    }

    if (!newToken || response.status === 401) {
      clearSession();
      redirectToLogin();
      // Thrown rather than falling through, so callers surface one clear
      // message instead of whatever the 401 body happened to contain.
      throw new ApiError(
        'Your session has expired. Please sign in again.',
        401,
      );
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // The dev proxy answers 500 when the API is down, so a 5xx is reported as
    // unreachable rather than as a request the user got wrong.
    const message =
      readErrorMessage(payload) ||
      (response.status >= 500
        ? 'The server is not responding. Check that the API is running.'
        : 'API request failed');
    throw new ApiError(message, response.status);
  }

  // 204 responses have no body to parse.
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
