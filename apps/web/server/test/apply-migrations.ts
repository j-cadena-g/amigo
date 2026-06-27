import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { getIntegrationEnv } from "./integration-env";

type TestBindings = {
  TEST_MIGRATIONS: D1Migration[];
};

await applyD1Migrations(
  getIntegrationEnv().DB,
  (env as unknown as TestBindings).TEST_MIGRATIONS
);
