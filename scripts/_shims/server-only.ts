// No-op stand-in for Next's `server-only` guard so CLI scripts can import
// server-side lib modules (lib/prisma.ts and anything depending on it).
// Wired in via tsconfig.scripts.json paths — never used by the Next build.
export {};
