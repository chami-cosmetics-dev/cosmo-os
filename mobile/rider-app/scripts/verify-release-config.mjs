import { execSync } from "node:child_process";

const requiredEnv = {
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_COSMETICS_API_URL: "https://os.cosmetics.lk",
  EXPO_PUBLIC_VAULT_API_URL: "https://vault-os-sandy.vercel.app",
};

const output = execSync("npx expo config --type public --json", {
  encoding: "utf8",
  env: { ...process.env, ...requiredEnv },
});

const config = JSON.parse(output);
const extra = config.extra ?? {};
const missing = [];

if (!extra.cosmeticsApiUrl) missing.push("extra.cosmeticsApiUrl");
if (!extra.vaultApiUrl) missing.push("extra.vaultApiUrl");

if (config.runtimeVersion) {
  missing.push("runtimeVersion should be omitted for release APK");
}

if (config.updates && config.updates.enabled !== false && config.updates.url) {
  missing.push("expo-updates should be disabled for internal APK");
}

if (missing.length > 0) {
  console.error("[verify:release] APK config check failed. Missing:", missing.join(", "));
  process.exit(1);
}

console.log("[verify:release] OK");
console.log("  cosmetics:", extra.cosmeticsApiUrl);
console.log("  vault:", extra.vaultApiUrl);
console.log("  appEnv:", extra.appEnv ?? config.name);
