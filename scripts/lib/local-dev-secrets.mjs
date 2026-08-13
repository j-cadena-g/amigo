/** Required vs optional secrets for local `pnpm run dev` / `dev:verify`. */

export const REQUIRED_LOCAL_DEV_KEYS = [
  "APP_ENV",
  "APP_ORIGIN",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
];

/** Optional keys for agentic Clerk login; omitted from first-run verify notes. */
export const AGENTIC_LOCAL_DEV_KEYS = [
  "AGENT_LOGIN_EMAIL",
  "AGENT_LOGIN_PASSWORD",
];

/**
 * @param {string[]} manifestKeys keys from apps/web/.dev.vars.example
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function classifyLocalDevSecrets(manifestKeys, env = process.env) {
  const requiredSet = new Set(REQUIRED_LOCAL_DEV_KEYS);
  const agenticSet = new Set(AGENTIC_LOCAL_DEV_KEYS);
  const unknownRequired = REQUIRED_LOCAL_DEV_KEYS.filter(
    (key) => !manifestKeys.includes(key),
  );
  const optionalKeys = manifestKeys.filter((key) => !requiredSet.has(key));
  const runtimeOptionalKeys = optionalKeys.filter((key) => !agenticSet.has(key));
  const agenticKeys = optionalKeys.filter((key) => agenticSet.has(key));

  const missingRequired = REQUIRED_LOCAL_DEV_KEYS.filter(
    (key) => !env[key]?.trim(),
  );
  const missingOptional = runtimeOptionalKeys.filter((key) => !env[key]?.trim());
  const missingAgentic = agenticKeys.filter((key) => !env[key]?.trim());
  const presentRequired = REQUIRED_LOCAL_DEV_KEYS.filter((key) =>
    env[key]?.trim(),
  );
  const presentOptional = runtimeOptionalKeys.filter((key) => env[key]?.trim());
  const presentAgentic = agenticKeys.filter((key) => env[key]?.trim());

  return {
    requiredKeys: REQUIRED_LOCAL_DEV_KEYS,
    optionalKeys: runtimeOptionalKeys,
    agenticKeys,
    unknownRequired,
    missingRequired,
    missingOptional,
    missingAgentic,
    presentRequired,
    presentOptional,
    presentAgentic,
  };
}

/**
 * @param {string[]} missingAgentic
 * @returns {string | null}
 */
export function formatMissingAgenticNote(missingAgentic) {
  if (missingAgentic.length === 0) {
    return null;
  }

  const effects = [];
  if (missingAgentic.includes("AGENT_LOGIN_EMAIL")) {
    effects.push("seed household claim needs AGENT_LOGIN_EMAIL");
  }
  if (missingAgentic.includes("AGENT_LOGIN_PASSWORD")) {
    effects.push(
      "AGENT_LOGIN_PASSWORD is optional last-resort form fill (prefer pnpm run agent:signin-url)",
    );
  }

  const suffix = effects.length > 0 ? ` — ${effects.join("; ")}` : "";
  return `note: agentic login keys not set (${missingAgentic.join(", ")})${suffix}`;
}

/**
 * Env for the local Vite/Workers child. Forwards injected secrets except
 * AGENT_LOGIN_PASSWORD, which is only for browser automation.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function envForLocalViteWorker(env = process.env) {
  const next = { ...env, CLOUDFLARE_INCLUDE_PROCESS_ENV: "true" };
  delete next.AGENT_LOGIN_PASSWORD;
  return next;
}
