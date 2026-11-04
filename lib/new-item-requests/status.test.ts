import { describe, expect, it } from "vitest";

import { assertStatusChange } from "@/lib/new-item-requests/status";

describe("assertStatusChange", () => {
  it("allows open to already_have", () => {
    expect(assertStatusChange("open", "already_have")).toEqual({ ok: "change" });
  });

  it("allows open to closed", () => {
    expect(assertStatusChange("open", "closed")).toEqual({ ok: "change" });
  });

  it("allows open to ordered", () => {
    expect(assertStatusChange("open", "ordered")).toEqual({ ok: "change" });
  });

  it("is idempotent for the same status", () => {
    expect(assertStatusChange("already_have", "already_have")).toEqual({ ok: "noop" });
    expect(assertStatusChange("ordered", "ordered")).toEqual({ ok: "noop" });
    expect(assertStatusChange("closed", "closed")).toEqual({ ok: "noop" });
    expect(assertStatusChange("open", "open")).toEqual({ ok: "noop" });
  });

  it("rejects already_have to closed", () => {
    expect(assertStatusChange("already_have", "closed")).toEqual({ ok: "reject" });
  });

  it("rejects closed to already_have", () => {
    expect(assertStatusChange("closed", "already_have")).toEqual({ ok: "reject" });
  });

  it("rejects ordered to closed", () => {
    expect(assertStatusChange("ordered", "closed")).toEqual({ ok: "reject" });
  });

  it("rejects closed to open", () => {
    expect(assertStatusChange("closed", "open")).toEqual({ ok: "reject" });
  });
});
