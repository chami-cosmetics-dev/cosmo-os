import type { ProtectedSystem } from "./object-key";

export function hostnameFromDatabaseUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error("Invalid database URL");
  }
}

export function assertDirectDatabaseUrl(url: string): void {
  const hostname = hostnameFromDatabaseUrl(url);
  if (hostname.includes("-pooler")) {
    throw new Error(
      "Pooled connection URL is forbidden for dump/restore; use DIRECT_URL",
    );
  }
}

export function liveHostEnvName(system: ProtectedSystem): string {
  switch (system) {
    case "vault":
      return "BACKUP_LIVE_HOST_VAULT";
    case "cosmo-dev":
      return "BACKUP_LIVE_HOST_COSMO_DEV";
    case "cosmo-prod":
      return "BACKUP_LIVE_HOST_COSMO_PROD";
  }
}

export function liveHostFor(
  system: ProtectedSystem,
  env: NodeJS.Dict<string> = process.env,
): string | undefined {
  const raw = env[liveHostEnvName(system)]?.trim();
  return raw || undefined;
}

/** Target matches this system's live host → need CONFIRM_PRODUCTION_RESTORE. */
export function isLiveTarget(
  system: ProtectedSystem,
  targetUrl: string,
  env: NodeJS.Dict<string> = process.env,
): boolean {
  const live = liveHostFor(system, env);
  if (!live) return false;
  return hostnameFromDatabaseUrl(targetUrl) === live;
}

/** Vault dump onto Cosmo live (or reverse). */
export function isCrossProductLiveTarget(
  system: ProtectedSystem,
  targetUrl: string,
  env: NodeJS.Dict<string> = process.env,
): boolean {
  const host = hostnameFromDatabaseUrl(targetUrl);
  if (system === "vault") {
    return (
      host === liveHostFor("cosmo-prod", env) ||
      host === liveHostFor("cosmo-dev", env)
    );
  }
  return host === liveHostFor("vault", env);
}
