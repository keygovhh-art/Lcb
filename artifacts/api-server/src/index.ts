import { logger } from "./lib/logger";
import { ensureReservedSuperAdmin } from "./lib/super-admin";
import { activateOwnerApprovedYemotRoot } from "./lib/yemot-owner-approved-root";
import { applyYemotVoiceRepair } from "./lib/yemot-root-voice-repair";
import { installCampaign4444Once } from "./lib/yemot-campaign-4444";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

logger.info({ port }, "Booting Gavhah API");
try {
  await ensureReservedSuperAdmin();
} catch (err) {
  logger.error({ err }, "Super-admin bootstrap failed; continuing server startup");
}
const { default: app } = await import("./app");
logger.info("Application modules loaded");

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
  // One-time root setup only when explicitly queued by the hotline owner.
  void activateOwnerApprovedYemotRoot();
  void applyYemotVoiceRepair();
  // Runs only after explicit database queue approval; never touches root or recordings.
  void installCampaign4444Once();
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to listen");
  process.exit(1);
});
