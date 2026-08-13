import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { AMIGO_DEV_ORIGIN } from "../apps/web/server/lib/dev-origin";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

function parseRenderedWranglerConfig(source: string) {
  const withoutComments = source.replace(/^\s*\/\/.*$/gm, "");
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas) as {
    secrets?: { required?: string[] };
  };
}

function createDevEnv(outputPath: string, overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    WRANGLER_RENDER_OUTPUT: outputPath,
    APP_ENV: "development",
    APP_ORIGIN: AMIGO_DEV_ORIGIN,
    CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk",
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_D1_DATABASE_ID: undefined,
    CLOUDFLARE_KV_NAMESPACE_ID: undefined,
    CLOUDFLARE_CUSTOM_DOMAIN: undefined,
    ...overrides,
  };

  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }

  return env;
}

describe("render-wrangler-deploy-config", () => {
  it("keeps local dev binding ids on the public placeholders", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "amigo-wrangler-"));
    const outputPath = path.join(tmpDir, ".wrangler.dev.jsonc");

    try {
      await execFileAsync("node", ["scripts/render-wrangler-deploy-config.mjs"], {
        cwd: repoRoot,
        env: createDevEnv(outputPath),
      });

      const rendered = await readFile(outputPath, "utf8");
      expect(rendered).not.toContain('"account_id"');
      expect(rendered).toContain(
        '"database_id": "00000000-0000-0000-0000-000000000000"'
      );
      expect(rendered).toContain('"id": "00000000000000000000000000000000"');
      expect(rendered).toContain('"routes": []');
      expect(rendered).toContain(`"APP_ORIGIN": "${AMIGO_DEV_ORIGIN}"`);
      expect(rendered).toContain(
        '"CLERK_PUBLISHABLE_KEY": "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk"'
      );
      const requiredSecrets = parseRenderedWranglerConfig(rendered).secrets?.required ?? [];
      expect(requiredSecrets).toContain("AGENT_LOGIN_EMAIL");
      expect(requiredSecrets).not.toContain("AGENT_LOGIN_PASSWORD");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not require Cloudflare binding env vars for dev config output", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "amigo-wrangler-"));
    const outputPath = path.join(tmpDir, ".wrangler.dev.jsonc");

    try {
      await expect(
        execFileAsync("node", ["scripts/render-wrangler-deploy-config.mjs"], {
          cwd: repoRoot,
          env: createDevEnv(outputPath),
        })
      ).resolves.toBeDefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
