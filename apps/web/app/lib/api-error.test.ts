import { describe, expect, it, vi } from "vitest";
import { readApiErrorMessage, toastMutationFailure } from "./api-error";

describe("readApiErrorMessage", () => {
  it("reads error string from JSON", async () => {
    const res = new Response(JSON.stringify({ error: "Nope" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readApiErrorMessage(res)).resolves.toBe("Nope");
  });

  it("returns null for non-JSON", async () => {
    const res = new Response("plain", { status: 500 });

    await expect(readApiErrorMessage(res)).resolves.toBeNull();
  });

  it("reads message when error is absent", async () => {
    const res = new Response(JSON.stringify({ message: "Budget limit hit" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readApiErrorMessage(res)).resolves.toBe("Budget limit hit");
  });
});

describe("toastMutationFailure", () => {
  it("uses the API error message", async () => {
    const toast = vi.fn();
    const res = new Response(JSON.stringify({ error: "Nope" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    await toastMutationFailure(toast, res, "Update role");

    expect(toast).toHaveBeenCalledWith("Nope", { variant: "error" });
  });

  it("reports a network failure", async () => {
    const toast = vi.fn();

    await toastMutationFailure(toast, null, "Update role");

    expect(toast).toHaveBeenCalledWith(
      "Update role failed — check your connection",
      { variant: "error" }
    );
  });

  it("uses rate-limit copy for a 429 response", async () => {
    const toast = vi.fn();
    const res = new Response(null, { status: 429 });

    await toastMutationFailure(toast, res, "Update role");

    expect(toast).toHaveBeenCalledWith(
      "You're doing that a bit fast — give it a second",
      { variant: "error" }
    );
  });
});
