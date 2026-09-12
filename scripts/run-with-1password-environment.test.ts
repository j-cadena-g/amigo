import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/run-with-1password-environment.sh");

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  delete env.OP_ENVIRONMENT_ID;
  delete env.AMIGO_OP_SERVICE_ACCOUNT_TOKEN;
  delete env.AMIGO_OP_ENVIRONMENT_ID;
  delete env.OP_BIN_DIR;
  delete env.WEB_REFS_FILE;
  return env;
}

function writeFakeOp(binDir: string) {
  const opPath = path.join(binDir, "op");
  writeFileSync(
    opPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" && "\${2:-}" == "--environment" ]]; then
  printf 'environment=%s\\n' "\${3}"
  if [[ -n "\${OP_SERVICE_ACCOUNT_TOKEN:-}" ]]; then
    printf 'has_token=yes\\n'
  else
    printf 'has_token=no\\n'
  fi
  shift 3
  if [[ "\${1:-}" == "--" ]]; then
    shift
  fi
  exec "\$@"
fi
printf 'unexpected: %s\\n' "\$*" >&2
exit 1
`,
  );
  chmodSync(opPath, 0o755);
}

function runScript(
  args: string[],
  envOverrides: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...cleanEnv(), ...envOverrides },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("run-with-1password-environment.sh Cursor aliases", () => {
  it("maps AMIGO_ Cursor secrets onto OP_ names for op run", () => {
    const binDir = mkdtempSync(path.join(tmpdir(), "amigo-op-bin-"));
    writeFakeOp(binDir);

    const result = runScript(["--", "true"], {
      AMIGO_OP_SERVICE_ACCOUNT_TOKEN: "cursor-token",
      AMIGO_OP_ENVIRONMENT_ID: "cursor-env-id",
      OP_BIN_DIR: binDir,
      WEB_REFS_FILE: path.join(binDir, "missing.refs.env"),
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("environment=cursor-env-id");
    expect(result.stdout).toContain("has_token=yes");
  });

  it("keeps unprefixed Workers Builds / local OP_ vars", () => {
    const binDir = mkdtempSync(path.join(tmpdir(), "amigo-op-bin-"));
    writeFakeOp(binDir);

    const result = runScript(["--", "true"], {
      OP_SERVICE_ACCOUNT_TOKEN: "build-token",
      OP_ENVIRONMENT_ID: "build-env-id",
      OP_BIN_DIR: binDir,
      WEB_REFS_FILE: path.join(binDir, "missing.refs.env"),
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("environment=build-env-id");
    expect(result.stdout).toContain("has_token=yes");
  });

  it("does not let AMIGO_ aliases override an already-set OP_ENVIRONMENT_ID", () => {
    const binDir = mkdtempSync(path.join(tmpdir(), "amigo-op-bin-"));
    writeFakeOp(binDir);

    const result = runScript(["--", "true"], {
      OP_SERVICE_ACCOUNT_TOKEN: "build-token",
      OP_ENVIRONMENT_ID: "build-env-id",
      AMIGO_OP_ENVIRONMENT_ID: "cursor-env-id",
      AMIGO_OP_SERVICE_ACCOUNT_TOKEN: "cursor-token",
      OP_BIN_DIR: binDir,
      WEB_REFS_FILE: path.join(binDir, "missing.refs.env"),
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("environment=build-env-id");
    expect(result.stdout).not.toContain("environment=cursor-env-id");
  });

  it("runs the command directly when no environment id is configured", () => {
    const result = runScript(["--", "printf", "passthrough"], {
      WEB_REFS_FILE: path.join(tmpdir(), "amigo-missing-refs.env"),
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("passthrough");
  });
});
