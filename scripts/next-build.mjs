/**
 * Next typecheck runs in a child process that copies NODE_OPTIONS.
 * Node's default heap here is ~2 GB, and `next build` dies during
 * "Running TypeScript". Raise the floor without lowering a larger
 * limit already set in the environment.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const heapFloorMb = 4096;
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

function nodeOptionsWithHeapFloor(existing) {
  const raw = existing ?? "";
  const match = raw.match(/--max-old-space-size(?:=|\s+)(\d+)/);
  if (match && Number(match[1]) >= heapFloorMb) return raw.trim();
  const stripped = raw.replace(/--max-old-space-size(?:=|\s+)\d+/g, "").trim();
  return `${stripped} --max-old-space-size=${heapFloorMb}`.trim();
}

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptionsWithHeapFloor(process.env.NODE_OPTIONS),
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
