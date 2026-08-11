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
