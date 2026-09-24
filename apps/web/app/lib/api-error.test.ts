import { describe, expect, it, vi } from "vitest";
import {
  connectionFailedMessage,
  RATE_LIMIT_MESSAGE,
  readApiErrorMessage,
  requestFailedMessage,
  toastMutationFailure,
} from "./api-error";

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

describe("failure messages", () => {
  it("says what failed and what to do", () => {
    expect(requestFailedMessage("Add item")).toBe("Add item failed. Try again.");
    expect(connectionFailedMessage("Add item")).toBe(
      "Add item failed. Check your connection and try again."
    );
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

  it("falls back to the label when the API sends no message", async () => {
    const toast = vi.fn();
    const res = new Response(null, { status: 500 });

    await toastMutationFailure(toast, res, "Update role");

    expect(toast).toHaveBeenCalledWith("Update role failed. Try again.", {
      variant: "error",
    });
  });

  it("reports a network failure", async () => {
    const toast = vi.fn();

    await toastMutationFailure(toast, null, "Update role");

    expect(toast).toHaveBeenCalledWith(
      "Update role failed. Check your connection and try again.",
      { variant: "error" }
    );
  });

  it("uses rate-limit copy for a 429 response", async () => {
    const toast = vi.fn();
    const res = new Response(null, { status: 429 });

    await toastMutationFailure(toast, res, "Update role");

    expect(toast).toHaveBeenCalledWith(RATE_LIMIT_MESSAGE, { variant: "error" });
    expect(RATE_LIMIT_MESSAGE).toBe(
      "Too many changes at once. Wait a moment and try again."
    );
  });
});
