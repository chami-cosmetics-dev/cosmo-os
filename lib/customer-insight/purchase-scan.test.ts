import { describe, expect, it } from "vitest";

import {
  chunkArray,
  collectAllIdPages,
  forEachIdPage,
} from "@/lib/customer-insight/purchase-scan";

describe("chunkArray", () => {
  it("splits evenly and leftovers", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });
});

describe("forEachIdPage / collectAllIdPages", () => {
  it("walks every page until short page", async () => {
    const pages = [
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
    ];
    let calls = 0;
    const seen: string[] = [];
    await forEachIdPage(
      async ({ cursor }) => {
        const page = pages[calls++] ?? [];
        if (cursor) expect(cursor).toBe(pages[calls - 2]!.at(-1)!.id);
        return page;
      },
      (page) => {
        for (const row of page) seen.push(row.id);
      },
      2
    );
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("collects all rows", async () => {
    const data = [{ id: "1" }, { id: "2" }, { id: "3" }];
    let offset = 0;
    const all = await collectAllIdPages(async ({ take }) => {
      const page = data.slice(offset, offset + take);
      offset += take;
      return page;
    }, 2);
    expect(all.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});
