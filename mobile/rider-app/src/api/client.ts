import { getTenantApiUrl } from "@/src/tenants";
import type { TenantId } from "@/src/tenants/config";
import { captureException } from "@/src/lib/monitoring";
import { loadSession, saveSession, type TenantRiderSession } from "@/src/storage/session";
import { removeTenantFromSession } from "@/src/storage/session-types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  tenant: TenantId;
  init?: RequestInit;
};

type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

async function handleUnauthorized(tenant: TenantId) {
  const session = await loadSession();
  if (!session) {
    await unauthorizedHandler?.();
    return;
  }

  const nextSession = removeTenantFromSession(session, tenant);
  if (!nextSession) {
    await clearSessionAndNotify();
    return;
  }

  await saveSession(nextSession);
}

async function clearSessionAndNotify() {
  const { clearSession } = await import("@/src/storage/session");
  await clearSession();
  await unauthorizedHandler?.();
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const apiBaseUrl = getTenantApiUrl(options.tenant);
  if (!apiBaseUrl) {
    throw new ApiError(`API base URL is not configured for ${options.tenant}`, 0);
  }

  const session = await loadSession();
  const accessToken = session?.tenants[options.tenant]?.accessToken;
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options.init,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.init?.headers ?? {}),
      },
    });
  } catch (error) {
    captureException(error, { path, tenant: options.tenant, phase: "network" });
    throw error;
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = errorData?.error ?? "Request failed";
    const apiError = new ApiError(message, response.status);

    if (response.status === 401) {
      await handleUnauthorized(options.tenant);
    } else {
      captureException(apiError, { path, tenant: options.tenant, status: response.status });
    }

    throw apiError;
  }

  return response.json() as Promise<T>;
}

async function publicRequest<T>(
  tenant: TenantId,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const apiBaseUrl = getTenantApiUrl(tenant);
  if (!apiBaseUrl) return null;

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

export const apiClient = {
  get: <T>(tenant: TenantId, path: string) => request<T>(path, { tenant }),
  post: <T>(tenant: TenantId, path: string, body?: Record<string, unknown>) =>
    request<T>(path, {
      tenant,
      init: {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      },
    }),
  login: (tenant: TenantId, body: Record<string, unknown>) =>
    publicRequest<TenantRiderSession>(tenant, "/api/mobile/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: (tenant: TenantId) => postIgnoringErrors(tenant, "/api/mobile/v1/auth/logout"),
};

async function postIgnoringErrors(tenant: TenantId, path: string) {
  try {
    await request(path, { tenant, init: { method: "POST" } });
  } catch {
    // Ignore revoke failures during logout.
  }
}

export async function flushQueuedRequest(params: {
  tenant: TenantId;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
}) {
  const apiBaseUrl = getTenantApiUrl(params.tenant);
  if (!apiBaseUrl) return false;

  const session = await loadSession();
  const accessToken = session?.tenants[params.tenant]?.accessToken;
  if (!accessToken) return false;

  try {
    const response = await fetch(`${apiBaseUrl}${params.endpoint}`, {
      method: params.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(params.body),
    });

    if (response.status === 401) {
      await handleUnauthorized(params.tenant);
    }

    return response.ok;
  } catch {
    return false;
  }
}
