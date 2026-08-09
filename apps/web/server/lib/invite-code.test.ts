import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
} from "./invite-code";

describe("normalizeInviteCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeInviteCode("  amigo-ab12cd  ")).toBe("AMIGO-AB12CD");
  });
});

describe("hashInviteCode", () => {
  it("returns the same hash for the same normalized input", async () => {
    const a = await hashInviteCode("AMIGO-AB12CD");
    const b = await hashInviteCode("AMIGO-AB12CD");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("generateInviteCode", () => {
  it("returns AMIGO- display code whose hash matches normalize(code)", async () => {
    const generated = await generateInviteCode();
    expect(generated.codeDisplay).toMatch(/^AMIGO-[A-Z2-9]{13}$/);
    expect(generated.code).toBe(generated.codeDisplay);
    expect(generated.codeHash).toBe(
      await hashInviteCode(normalizeInviteCode(generated.code))
    );
  });
});
