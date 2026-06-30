import {
  pool,
  MVP_TENANT_ID,
  startRefreshRun,
  executeRefreshRun,
  RefreshAlreadyRunningError,
} from "@workspace/db";
import { logger } from "./logger";
import { sendRefreshAlerts } from "./refresh-alerts";

// In-process automatic data refresh. Runs the same incremental pipeline as the
// manual "Atualizar" button every 6 hours so the dashboard stays current even
// when nobody clicks. Shares the DB concurrency lock, so it never collides with
// a manual run (or with a separately configured Scheduled Deployment running
// `refresh-all` — whichever fires first wins, the other is skipped).
//
// Disable with AUTO_REFRESH_DISABLED=1 (e.g. when you prefer a dedicated
// Scheduled Deployment). Interval overridable via AUTO_REFRESH_INTERVAL_MS.
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function startAutoRefreshScheduler(): void {
  const disabled =
    process.env.AUTO_REFRESH_DISABLED === "1" ||
    process.env.AUTO_REFRESH_DISABLED === "true";
  if (disabled) {
    logger.info("auto-refresh scheduler disabled (AUTO_REFRESH_DISABLED)");
    return;
  }

  const intervalMs = Number(process.env.AUTO_REFRESH_INTERVAL_MS) || SIX_HOURS_MS;

  const tick = async (): Promise<void> => {
    try {
      const run = await startRefreshRun(pool, {
        tenantId: MVP_TENANT_ID,
        trigger: "scheduled",
      });
      logger.info({ runId: run.id }, "auto-refresh started");
      const done = await executeRefreshRun(pool, run);
      await sendRefreshAlerts(MVP_TENANT_ID, done);
      logger.info(
        { runId: done.id, status: done.status },
        "auto-refresh finished",
      );
    } catch (e) {
      if (e instanceof RefreshAlreadyRunningError) {
        logger.info("auto-refresh skipped — a cycle is already running");
        return;
      }
      logger.error({ err: e }, "auto-refresh tick failed");
    }
  };

  // Interval only — do NOT run on boot, so frequent dev restarts don't spawn the
  // pipeline repeatedly. The first automatic cycle fires after `intervalMs`.
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  logger.info({ intervalMs }, "auto-refresh scheduler started");
}
