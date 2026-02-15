const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  if (!response.ok) {
    const errorData = isJson ? await response.json().catch(() => null) : null;
    throw new ApiError(
      errorData?.error ?? response.statusText ?? "Request failed",
      response.status,
      errorData
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (isJson ? response.json() : response.text()) as Promise<T>;
}

export const api = {
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, data?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, data?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T>(
    path: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      method: "DELETE",
    });
    return handleResponse<T>(res);
  },
};
