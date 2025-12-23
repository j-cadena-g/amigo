import { setupAuditTriggers } from "./triggers";

async function main() {
  try {
    await setupAuditTriggers();
    process.exit(0);
  } catch (error) {
    console.error("Failed to setup audit triggers:", error);
    process.exit(1);
  }
}

main();
