import { execSync } from "node:child_process";

const requiredEnv = {
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_COSMETICS_API_URL: "https://os.cosmetics.lk",
};

const output = execSync("npx expo config --type public --json", {
  encoding: "utf8",
  env: {
    ...process.env,
    ...requiredEnv,
    // Cosmetics-only for now — do not inherit a leftover Vault URL from the shell.
    EXPO_PUBLIC_VAULT_API_URL: "",
  },
});

const config = JSON.parse(output);
const extra = config.extra ?? {};
const missing = [];

if (!extra.cosmeticsApiUrl) missing.push("extra.cosmeticsApiUrl");

if (!config.runtimeVersion) {
  missing.push("runtimeVersion (required for EAS Update)");
}

if (!config.updates?.enabled) {
  missing.push("updates.enabled must be true for OTA");
}

if (!config.updates?.url) {
  missing.push("updates.url (EAS project update URL)");
}

if (missing.length > 0) {
  console.error("[verify:release] APK config check failed. Missing:", missing.join(", "));
  process.exit(1);
}

console.log("[verify:release] OK");
console.log("  cosmetics:", extra.cosmeticsApiUrl);
console.log("  vault:", extra.vaultApiUrl ?? "(disabled)");
console.log("  appEnv:", extra.appEnv ?? config.name);
console.log("  updates:", config.updates.url);
console.log("  runtimeVersion:", JSON.stringify(config.runtimeVersion));
