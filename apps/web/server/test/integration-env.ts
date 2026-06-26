import { env } from "cloudflare:workers";
import type { Env } from "../env";

export function getIntegrationEnv(): Env {
  return env as unknown as Env;
}
