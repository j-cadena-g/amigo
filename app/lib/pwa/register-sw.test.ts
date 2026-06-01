import { beforeEach, describe, expect, it, vi } from "vitest";

const registerSWMock = vi.fn();

vi.mock("virtual:pwa-register", () => ({
  registerSW: registerSWMock,
}));

describe("initServiceWorkerRegistration", () => {
  beforeEach(() => {
    registerSWMock.mockReset();
  });

  it("registers the service worker immediately", async () => {
    const { initServiceWorkerRegistration } = await import("./register-sw");

    initServiceWorkerRegistration();

    expect(registerSWMock).toHaveBeenCalledTimes(1);
    expect(registerSWMock).toHaveBeenCalledWith({
      immediate: true,
      onRegisterError: expect.any(Function),
    });
  });

  it("logs service worker registration errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initServiceWorkerRegistration } = await import("./register-sw");

    initServiceWorkerRegistration();

    const options = registerSWMock.mock.calls[0]?.[0] as
      | { onRegisterError?: (error: unknown) => void }
      | undefined;

    expect(options?.onRegisterError).toBeTypeOf("function");
    const error = new Error("boom");
    options?.onRegisterError?.(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Service worker registration failed:",
      error
    );

    consoleErrorSpy.mockRestore();
  });
});
