const base = () => "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ACCESS = "volleyball_access";
const REFRESH = "volleyball_refresh";

export function getAccessToken() {
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

let _onAuthFailure: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

/** Register a callback for when token refresh fails. Returns a cleanup function. */
export function onAuthFailure(handler: () => void): () => void {
  _onAuthFailure = handler;
  return () => {
    _onAuthFailure = null;
  };
}

async function performRefresh() {
  const r = getRefreshToken();
  if (!r) return null;
  const res = await fetch(`${base()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: r }),
  });
  if (!res.ok) {
    clearTokens();
    _onAuthFailure?.();
    return null;
  }
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

function refreshOnce() {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function api<T>(
  path: string,
  init?: RequestInit & { _retry?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  if (res.status === 401 && !init?._retry && getRefreshToken()) {
    const latestToken = getAccessToken();
    if (token && latestToken && latestToken !== token) {
      return api<T>(path, { ...init, _retry: true });
    }
    const newAccess = await refreshOnce();
    if (newAccess) {
      return api<T>(path, { ...init, _retry: true });
    }
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new ApiError(res.status, j.code ?? "HTTP", j.message ?? res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
