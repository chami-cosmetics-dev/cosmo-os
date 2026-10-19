import { describe, expect, it } from "vitest";

import { readMp4DurationSeconds } from "@/lib/media-duration";

function box(type: string, payload: Uint8Array) {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function mvhdV0(timescale: number, duration: number) {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mvhd", payload);
}

function mvhdV1(timescale: number, duration: number) {
  const payload = new Uint8Array(112);
  payload[0] = 1;
  const view = new DataView(payload.buffer);
  view.setUint32(20, timescale);
  view.setBigUint64(24, BigInt(duration));
  return box("mvhd", payload);
}

describe("readMp4DurationSeconds", () => {
  it("reads a version-0 mvhd after ftyp and mdat", () => {
    const file = concat(
      box("ftyp", new Uint8Array(16)),
      box("mdat", new Uint8Array(64)),
      box("moov", concat(mvhdV0(1000, 45_400), box("trak", new Uint8Array(8)))),
    );
    expect(readMp4DurationSeconds(file)).toBe(45);
  });

  it("reads a version-1 mvhd (long or high-timescale videos)", () => {
    const file = concat(box("ftyp", new Uint8Array(8)), box("moov", mvhdV1(90_000, 90_000 * 312)));
    expect(readMp4DurationSeconds(file)).toBe(312);
  });

  it("returns null for files without moov (e.g. WebM) or garbage", () => {
    expect(readMp4DurationSeconds(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBeNull();
    expect(readMp4DurationSeconds(new Uint8Array(4))).toBeNull();
    expect(readMp4DurationSeconds(concat(box("moov", mvhdV0(0, 100))))).toBeNull();
  });
});
