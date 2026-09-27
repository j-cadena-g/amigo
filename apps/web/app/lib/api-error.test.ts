import { describe, expect, it, vi } from "vitest";
import { messagesFor } from "@/app/i18n";
import {
  connectionFailedMessage,
  readApiErrorMessage,
  requestFailedMessage,
  toastMutationFailure,
} from "./api-error";

const en = messagesFor("en").common;
const es = messagesFor("es").common;

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
    expect(requestFailedMessage(en, "add the item")).toBe("Couldn't add the item. Try again.");
    expect(connectionFailedMessage(en, "add the item")).toBe(
      "Couldn't add the item. Check your connection and try again."
    );
    expect(requestFailedMessage(es, "agregar el artículo")).toBe(
      "No se pudo agregar el artículo. Inténtalo de nuevo."
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

    await toastMutationFailure(toast, res, "update the role", en);

    expect(toast).toHaveBeenCalledWith("Nope", { variant: "error" });
  });

  it("falls back to the action when the API sends no message", async () => {
    const toast = vi.fn();
    const res = new Response(null, { status: 500 });

    await toastMutationFailure(toast, res, "update the role", en);

    expect(toast).toHaveBeenCalledWith("Couldn't update the role. Try again.", {
      variant: "error",
    });
  });

  it("reports a network failure", async () => {
    const toast = vi.fn();

    await toastMutationFailure(toast, null, "actualizar el rol", es);

    expect(toast).toHaveBeenCalledWith(
      "No se pudo actualizar el rol. Revisa tu conexión e inténtalo de nuevo.",
      { variant: "error" }
    );
  });

  it("uses rate-limit copy for a 429 response", async () => {
    const toast = vi.fn();
    const res = new Response(null, { status: 429 });

    await toastMutationFailure(toast, res, "update the role", en);

    expect(toast).toHaveBeenCalledWith(
      "Too many changes at once. Wait a moment and try again.",
      { variant: "error" }
    );
  });
});
