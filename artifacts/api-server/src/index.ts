import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

logger.info({ port }, "Booting Gavhah API");
const { default: app } = await import("./app");
logger.info("Application modules loaded");

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to listen");
  process.exit(1);
});
