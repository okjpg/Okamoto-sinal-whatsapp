import { Router, type IRouter } from "express";
import {
  pool,
  startRefreshRun,
  executeRefreshRun,
  getLatestRefreshRun,
  RefreshAlreadyRunningError,
} from "@workspace/db";
import { requireOwnerTenant } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getRefreshLiveStats, sendRefreshAlerts } from "../lib/refresh-alerts";
import { startQuickRefresh } from "../lib/refresh-queue";

// Manual data-refresh control. Reuses the shared pipeline + concurrency lock in
// @workspace/db so a click runs the exact same incremental jobs the scheduled
// (6h) automation runs, and the two can never run at the same time.
const router: IRouter = Router();
router.use(requireAuth);
// whatsapp_messages has no tenant_id; only the owner's tenant may trigger/read.
router.use(requireOwnerTenant);

router.get("/refresh/live", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  const run = await getLatestRefreshRun(pool, tenantId);
  const stats = await getRefreshLiveStats(tenantId, run);
  res.json(stats);
});

// Current/last cycle for the tenant — feeds "Atualizando..." + "última
// atualização" and the button's disabled state. Returns null before the first run.
router.get("/refresh/status", async (req: AuthedRequest, res) => {
  const run = await getLatestRefreshRun(pool, req.auth!.tenantId);
  res.json({ run });
});

// Start a manual refresh. Fires the pipeline in the background and
// returns immediately (202). Refuses with 409 if a cycle is already running.
router.post("/refresh", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  try {
    const run = await startRefreshRun(pool, { tenantId, trigger: "manual" });
    void executeRefreshRun(pool, run)
      .then((done) => sendRefreshAlerts(tenantId, done))
      .catch((err) => {
        req.log.error({ err }, "refresh pipeline failed");
      });
    res.status(202).json({ run });
  } catch (e) {
    if (e instanceof RefreshAlreadyRunningError) {
      res.status(409).json({ error: "already_running", run: e.run });
      return;
    }
    throw e;
  }
});

// Lighter incremental refresh (same as post-webhook debounce). Skips topic rebuild.
router.post("/refresh/quick", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  try {
    const run = await startQuickRefresh(tenantId);
    res.status(202).json({ run });
  } catch (e) {
    if (e instanceof RefreshAlreadyRunningError) {
      res.status(409).json({ error: "already_running", run: e.run });
      return;
    }
    throw e;
  }
});

export default router;
