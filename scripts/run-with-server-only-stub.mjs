/**
 * Stub `server-only` then run a tsx script (for Vault/Cosmo one-off imports).
 * Usage: node scripts/with-env.mjs vault node scripts/run-with-server-only-stub.mjs scripts/foo.mts [--apply]
 */
import Module from "node:module"
import { register } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const orig = Module.prototype.require
Module.prototype.require = function patchedRequire(id) {
  if (id === "server-only") return {}
  return orig.apply(this, arguments)
}

register("tsx/esm", pathToFileURL("./"))

const scriptArg = process.argv[2]
if (!scriptArg) {
  console.error("Usage: node scripts/run-with-server-only-stub.mjs <script.mts> [...args]")
  process.exit(1)
}

const scriptPath = resolve(scriptArg)
process.argv = [process.argv[0], scriptPath, ...process.argv.slice(3)]
await import(pathToFileURL(scriptPath).href)
