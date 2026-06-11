/** Shared env target definitions for multi-tenant local development. */

export const ENV_TARGETS = {
  "cosmo-dev": {
    label: "Cosmo OS (dev)",
    file: ".env.cosmo-dev",
    example: ".env.cosmo-dev.example",
    description: "Cosmetics.lk dev — shared team Neon DB + Cosmo Auth0 dev",
  },
  vault: {
    label: "Vault OS",
    file: ".env.vault",
    example: ".env.vault.example",
    description: "Supplement Vault — Neon DB + Vault Auth0 tenant",
  },
  "cosmo-prod": {
    label: "Cosmo OS (prod)",
    file: ".env.cosmo-prod",
    example: ".env.cosmo-prod.example",
    description: "Cosmetics.lk production — use with care (migrations only)",
  },
};

export const ENV_TARGET_KEYS = Object.keys(ENV_TARGETS);

export function resolveEnvPath(root, target) {
  const entry = ENV_TARGETS[target];
  if (!entry) return null;
  return `${root}/${entry.file}`.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}
