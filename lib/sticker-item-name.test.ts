import { describe, expect, it } from "vitest";

import { cleanStickerItemName } from "@/lib/sticker-item-name";

describe("cleanStickerItemName", () => {
  it("strips trailing (Default Title)", () => {
    expect(cleanStickerItemName("Serum (Default Title)")).toBe("Serum");
    expect(cleanStickerItemName("Serum(Default Title)")).toBe("Serum");
  });

  it("leaves names without default suffix unchanged", () => {
    expect(cleanStickerItemName("Serum (50ml)")).toBe("Serum (50ml)");
  });

  it("returns placeholder for empty / only-default names", () => {
    expect(cleanStickerItemName("")).toBe("-");
    expect(cleanStickerItemName(null)).toBe("-");
    expect(cleanStickerItemName("(Default Title)")).toBe("-");
  });
});
