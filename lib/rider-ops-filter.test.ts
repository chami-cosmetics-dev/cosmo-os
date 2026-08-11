import { describe, expect, it } from "vitest";

import {
  isOpenRiderTaskStatus,
  riderTaskMatchesFr003Filter,
  summarizeRiderTaskStatuses,
} from "@/lib/rider-ops-filter";

describe("riderTaskMatchesFr003Filter", () => {
  it("always includes open tasks regardless of assigned day", () => {
    expect(
      riderTaskMatchesFr003Filter(
        {
          status: "assigned",
          assignedAt: "2026-08-01T10:00:00.000Z",
          completedAt: null,
          failedAt: null,
        },
        "2026-08-11",
        "2026-08-11"
      )
    ).toBe(true);
    expect(isOpenRiderTaskStatus("arrived")).toBe(true);
  });

  it("includes completed only when completedAt is in range", () => {
    const completedInRange = riderTaskMatchesFr003Filter(
      {
        status: "completed",
        assignedAt: "2026-08-01T10:00:00.000Z",
        completedAt: "2026-08-11T05:00:00.000Z",
        failedAt: null,
      },
      "2026-08-11",
      "2026-08-11"
    );
    const completedOutOfRange = riderTaskMatchesFr003Filter(
      {
        status: "completed",
        assignedAt: "2026-08-01T10:00:00.000Z",
        completedAt: "2026-08-09T05:00:00.000Z",
        failedAt: null,
      },
      "2026-08-11",
      "2026-08-11"
    );
    expect(completedInRange).toBe(true);
    expect(completedOutOfRange).toBe(false);
  });
});

describe("summarizeRiderTaskStatuses", () => {
  it("buckets statuses", () => {
    expect(
      summarizeRiderTaskStatuses([
        { status: "assigned" },
        { status: "accepted" },
        { status: "completed" },
        { status: "failed" },
      ])
    ).toEqual({
      total: 4,
      assigned: 1,
      inProgress: 1,
      completed: 1,
      failed: 1,
    });
  });
});
