import { Router, type IRouter, type Request, type Response } from "express";
import { MVP_TENANT_ID } from "@workspace/db";
import { sendDailyDigest } from "../lib/daily-digest";

const router: IRouter = Router();

function authorizeCron(req: Request, res: Response): boolean {
  const secret = process.env.SINAL_CRON_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: "cron_not_configured" });
    return false;
  }
  const got =
    (req.headers["x-cron-secret"] as string | undefined) ??
    (req.query.secret as string | undefined);
  if (got !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

router.post("/cron/daily-digest", async (req, res) => {
  if (!authorizeCron(req, res)) return;
  const force = req.query.force === "1" || req.body?.force === true;
  try {
    const result = await sendDailyDigest({
      tenantId: MVP_TENANT_ID,
      force,
    });
    res.json(result);
  } catch (e) {
    req.log.error({ err: e }, "daily-digest cron failed");
    res.status(500).json({ error: "digest_failed" });
  }
});

export default router;
