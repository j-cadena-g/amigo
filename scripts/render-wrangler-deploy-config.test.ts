import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("render-wrangler-deploy-config", () => {
  it("keeps local dev binding ids on the public placeholders", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "amigo-wrangler-"));
    const outputPath = path.join(tmpDir, ".wrangler.dev.jsonc");

    try {
      await execFileAsync("node", ["scripts/render-wrangler-deploy-config.mjs"], {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: {
          ...process.env,
          WRANGLER_RENDER_OUTPUT: outputPath,
          CLOUDFLARE_ACCOUNT_ID: "11111111111111111111111111111111",
          CLOUDFLARE_D1_DATABASE_ID: "22222222-2222-4222-8222-222222222222",
          CLOUDFLARE_KV_NAMESPACE_ID: "33333333333333333333333333333333",
          CLOUDFLARE_CUSTOM_DOMAIN: "app.example.test",
          APP_ENV: "development",
          APP_ORIGIN: "http://localhost:5173",
          CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk",
        },
      });

      const rendered = await readFile(outputPath, "utf8");
      expect(rendered).not.toContain('"account_id"');
      expect(rendered).toContain(
        '"database_id": "00000000-0000-0000-0000-000000000000"'
      );
      expect(rendered).toContain('"id": "00000000000000000000000000000000"');
      expect(rendered).toContain('"routes": []');
      expect(rendered).toContain('"APP_ORIGIN": "http://localhost:5173"');
      expect(rendered).toContain(
        '"CLERK_PUBLISHABLE_KEY": "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk"'
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
