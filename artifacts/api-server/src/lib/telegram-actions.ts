import {
  pool,
  MVP_TENANT_ID,
  startRefreshRun,
  executeRefreshRun,
  RefreshAlreadyRunningError,
} from "@workspace/db";
import { sendRefreshAlerts } from "./refresh-alerts";
import { logger } from "./logger";

export type RefreshTriggerResult =
  | { ok: true; started: true; runId: string }
  | { ok: true; started: false; reason: "already_running" }
  | { ok: false; reason: string };

export async function triggerRefreshFromTelegram(
  tenantId: string = MVP_TENANT_ID,
): Promise<RefreshTriggerResult> {
  try {
    const run = await startRefreshRun(pool, {
      tenantId,
      trigger: "manual",
    });
    void executeRefreshRun(pool, run)
      .then((done) => sendRefreshAlerts(tenantId, done))
      .catch((err) => {
        logger.error({ err }, "telegram-triggered refresh failed");
      });
    return { ok: true, started: true, runId: run.id };
  } catch (e) {
    if (e instanceof RefreshAlreadyRunningError) {
      return { ok: true, started: false, reason: "already_running" };
    }
    return { ok: false, reason: (e as Error).message };
  }
}
