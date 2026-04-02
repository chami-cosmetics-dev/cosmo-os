const DEFAULT_APP_BASE_URL = "http://localhost:3000";

export function getAppBaseUrl() {
  const appBaseUrl =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return (appBaseUrl ?? DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
}

export function getAuthCallbackUrl() {
  return `${getAppBaseUrl()}/auth/callback`;
}
