import { describe, expect, it } from "vitest";
import { createRouterLoadContext } from "../../router-context";
import { localizeResultErrors } from "./localize-error";

const context = createRouterLoadContext({
  app: { cspNonce: "n", sessionStatus: "unauthenticated" },
  cloudflare: { env: {} as never, ctx: {} as ExecutionContext, caches: {} as CacheStorage },
});
type Result = { id: string; success: boolean; error?: string };

const request = (acceptLanguage: string) =>
  new Request("http://localhost/api/sync", { headers: { "Accept-Language": acceptLanguage } });

describe("localizeResultErrors", () => {
  it("translates each failed item for a Spanish reader", async () => {
    const results: Result[] = [
      { id: "a", success: true },
      { id: "b", success: false, error: "Item not found" },
    ];
    await expect(localizeResultErrors(results, context, request("es-CO"))).resolves.toEqual([
      { id: "a", success: true },
      { id: "b", success: false, error: "No se encontró el artículo" },
    ]);
  });

  it("returns the same array when nothing failed or the reader uses English", async () => {
    const ok: Result[] = [{ id: "a", success: true }];
    expect(await localizeResultErrors(ok, context, request("es"))).toBe(ok);
    const failed: Result[] = [{ id: "b", success: false, error: "Item not found" }];
    expect(await localizeResultErrors(failed, context, request("en-CA"))).toBe(failed);
  });
});
