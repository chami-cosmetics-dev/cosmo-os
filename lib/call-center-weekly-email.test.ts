import { describe, expect, it } from "vitest";

import {
  monthStartYmd,
  weekStartMondayYmd,
} from "@/lib/call-center-weekly-email";

describe("call-center performance email date helpers", () => {
  it("resolves Monday for mid-week and Sunday asOf", () => {
    expect(weekStartMondayYmd("2026-09-14")).toBe("2026-09-14");
    expect(weekStartMondayYmd("2026-09-13")).toBe("2026-09-07");
    expect(weekStartMondayYmd("2026-09-10")).toBe("2026-09-07");
  });

  it("resolves month start", () => {
    expect(monthStartYmd("2026-09-14")).toBe("2026-09-01");
  });
});
