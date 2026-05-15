import { API_BASE_URL } from "@/src/config";
import { loadSession } from "@/src/storage/session";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await loadSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: Record<string, unknown>) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
};
