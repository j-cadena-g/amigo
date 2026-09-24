import { describe, expect, it } from "vitest";
import { isPushPromptPath } from "./push-prompt-provider";

describe("isPushPromptPath", () => {
  it("prompts on the grocery list", () => {
    expect(isPushPromptPath("/groceries")).toBe(true);
    expect(isPushPromptPath("/groceries/")).toBe(true);
  });

  it("does not prompt anywhere else", () => {
    expect(isPushPromptPath("/dashboard")).toBe(false);
    expect(isPushPromptPath("/settings")).toBe(false);
    expect(isPushPromptPath("/financial")).toBe(false);
    expect(isPushPromptPath("/")).toBe(false);
  });

  it("does not match paths that only share the prefix", () => {
    expect(isPushPromptPath("/groceries-archive")).toBe(false);
  });
});
