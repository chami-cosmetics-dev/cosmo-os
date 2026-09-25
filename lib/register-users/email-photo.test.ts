import { describe, expect, it } from "vitest";

import {
  parseStoredEmailPhoto,
  registerEmailPhotoMime,
  safeRegisterEmailPhotoName,
  toEmailPhotoDataUrl,
} from "@/lib/register-users/email-photo";

describe("registerEmailPhotoMime", () => {
  it("maps image/jpg and empty Windows type from extension", () => {
    expect(registerEmailPhotoMime({ name: "pic.jpg", type: "image/jpg" })).toBe(
      "image/jpeg",
    );
    expect(registerEmailPhotoMime({ name: "pic.PNG", type: "" })).toBe(
      "image/png",
    );
  });

  it("rejects unknown types", () => {
    expect(registerEmailPhotoMime({ name: "pic.heic", type: "" })).toBe(null);
  });
});

describe("safeRegisterEmailPhotoName", () => {
  it("strips Windows paths and unsafe characters", () => {
    expect(
      safeRegisterEmailPhotoName("C:\\Users\\Me\\My Photo (1).jpg"),
    ).toBe("My_Photo__1_.jpg");
  });
});

describe("parseStoredEmailPhoto", () => {
  it("reads a data URL and writes one back", () => {
    const dataUrl = toEmailPhotoDataUrl("image/png", Buffer.from("hi"));
    const parsed = parseStoredEmailPhoto(dataUrl);
    expect(parsed?.mime).toBe("image/png");
    expect(parsed?.buffer.toString()).toBe("hi");
  });

  it("ignores remote urls", () => {
    expect(parseStoredEmailPhoto("https://example.com/p.jpg")).toBe(null);
  });
});
