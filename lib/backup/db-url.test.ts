import { describe, expect, it } from "vitest";

import {
  assertDirectDatabaseUrl,
  hostnameFromDatabaseUrl,
  isCrossProductLiveTarget,
  isLiveTarget,
} from "./db-url";

const direct =
  "postgresql://neondb_owner:x@ep-abc.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const pooled =
  "postgresql://neondb_owner:x@ep-abc-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("assertDirectDatabaseUrl", () => {
  it("allows compute host", () => {
    expect(() => assertDirectDatabaseUrl(direct)).not.toThrow();
  });

  it("rejects pooler host", () => {
    expect(() => assertDirectDatabaseUrl(pooled)).toThrow(/Pooled connection/);
  });
});

describe("live target gates", () => {
  const env = {
    BACKUP_LIVE_HOST_VAULT: "vault.neon.tech",
    BACKUP_LIVE_HOST_COSMO_PROD: "ep-abc.ap-southeast-1.aws.neon.tech",
    BACKUP_LIVE_HOST_COSMO_DEV: "dev.neon.tech",
  };

  it("detects live prod host", () => {
    expect(isLiveTarget("cosmo-prod", direct, env)).toBe(true);
    expect(isLiveTarget("vault", direct, env)).toBe(false);
  });

  it("detects vault dump aimed at cosmo live", () => {
    expect(isCrossProductLiveTarget("vault", direct, env)).toBe(true);
    expect(isCrossProductLiveTarget("cosmo-prod", direct, env)).toBe(false);
  });

  it("hostnameFromDatabaseUrl does not include userinfo", () => {
    expect(hostnameFromDatabaseUrl(direct)).toBe(
      "ep-abc.ap-southeast-1.aws.neon.tech",
    );
  });
});
