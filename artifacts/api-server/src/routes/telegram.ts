import { Router, type IRouter } from "express";
import {
  ensureTelegramCommands,
  handleTelegramUpdate,
} from "../lib/telegram-bot";

const router: IRouter = Router();

function authorizeWebhook(req: { headers: Record<string, unknown> }): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const got = req.headers["x-telegram-bot-api-secret-token"];
  return got === secret;
}

router.post("/telegram/webhook", async (req, res) => {
  if (!authorizeWebhook(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json({ ok: true });
  try {
    await handleTelegramUpdate(req.body);
  } catch (e) {
    req.log.error({ err: e }, "telegram webhook handler failed");
  }
});

void ensureTelegramCommands();

export default router;
