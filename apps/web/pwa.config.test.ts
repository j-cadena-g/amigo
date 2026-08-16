import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAmigoPwaOptions } from "./pwa.config";

describe("PWA build output", () => {
  it("emits the service worker into the Wrangler assets directory", () => {
    const wrangler = readFileSync(
      path.join(import.meta.dirname, "wrangler.jsonc"),
      "utf8"
    );
    const assetsDirectory = wrangler.match(
      /"assets"\s*:\s*\{[^}]*"directory"\s*:\s*"([^"]+)"/
    )?.[1];

    expect(assetsDirectory).toBe("./build/client");

    const options = createAmigoPwaOptions();
    expect(options.outDir).toBe("build/client");
    expect(options.injectManifest?.globDirectory).toBe("build/client");
  });
});
