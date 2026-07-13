import app from "./app";
import { logger } from "./lib/logger";
import { startAutoRefreshScheduler } from "./lib/scheduler";
import { startDailyDigestScheduler } from "./lib/digest-scheduler";
import { startWhatsAppMonitor } from "./lib/whatsapp-monitor";
import { ensureTelegramCommands } from "./lib/telegram-bot";
import { pool, syncMonitoredEntityFromEnv } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  syncMonitoredEntityFromEnv(pool)
    .then((updated) => {
      if (updated) logger.info("Monitored entity synced from env");
    })
    .catch((err) => logger.warn({ err }, "Monitored entity sync failed"));
  // Kick off the 6-hourly automatic data refresh (incremental pipeline).
  startAutoRefreshScheduler();
  startDailyDigestScheduler();
  startWhatsAppMonitor();
  void ensureTelegramCommands();
});
