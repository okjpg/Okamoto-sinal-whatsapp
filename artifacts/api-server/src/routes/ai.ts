import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  pool,
  getTenantAiSettings,
  getTenantOpenRouterCredentials,
  saveTenantAiSettings,
  saveTenantOpenRouterCredentials,
  buildTenantAiEnv,
  isOpenRouterReady,
  hasStoredOpenRouterCredentials,
  maskSecret,
} from "@workspace/db";
import {
  AI_TASK_TYPES,
  AUTO_FREE_TEXT_MODELS,
  DEFAULT_TENANT_AI_SETTINGS,
  OPENROUTER_DEFAULT_BASE_URL,
  applyOpenRouterEnv,
  enrichAndSortModels,
  fetchOpenRouterModels,
  testOpenRouterConnection,
  resolveModelsForSettings,
  type AiSelectionMode,
  type AiTaskType,
} from "@workspace/ai";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { requireOwnerTenant } from "../lib/scope";
import { upsertEnvVars, envFilePath } from "../lib/env-file";

const router: IRouter = Router();
router.use(requireAuth);
router.use(requireOwnerTenant);

const taskKeySchema = z.enum([
  "classify",
  "cluster",
  "mentions",
  "contact_analysis",
  "audio",
  "image",
  "video",
]);

const settingsSchema = z.object({
  mode: z.enum(["auto_free", "pick_free", "pick_paid", "by_task"]),
  selectedFreeModels: z.array(z.string()).optional(),
  selectedPaidModels: z.array(z.string()).optional(),
  // z.record(enum) in Zod v4 requires every key — use partialRecord instead.
  byTask: z.partialRecord(taskKeySchema, z.string()).optional(),
});

const credentialsSchema = z.object({
  apiKey: z.string().min(12),
  baseUrl: z.string().url().optional(),
});

const testConnectionSchema = z.object({
  apiKey: z.string().min(12).optional(),
  baseUrl: z.string().url().optional(),
});

async function syncOpenRouterFromTenant(tenantId: string) {
  const creds = await getTenantOpenRouterCredentials(pool, tenantId);
  if (creds) applyOpenRouterEnv(creds);
  return creds;
}

router.get("/ai/status", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  const creds = await getTenantOpenRouterCredentials(pool, tenantId);
  const storedInDb = await hasStoredOpenRouterCredentials(pool, tenantId);
  res.json({
    openRouterConfigured: isOpenRouterReady(creds),
    apiKeyMasked: maskSecret(creds?.apiKey),
    baseUrl: creds?.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
    storedInDb,
    envFilePath: envFilePath(),
  });
});

router.post("/ai/test-connection", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  const parsed = testConnectionSchema.safeParse(req.body ?? {});
  const storedInDb = await hasStoredOpenRouterCredentials(pool, tenantId);

  let creds = await getTenantOpenRouterCredentials(pool, tenantId);
  if (parsed.success && parsed.data.apiKey?.trim()) {
    creds = {
      apiKey: parsed.data.apiKey.trim(),
      baseUrl: parsed.data.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
    };
  }

  if (!creds?.apiKey) {
    res.json({
      ok: false,
      storedInDb,
      apiKeyMasked: null,
      baseUrl: null,
      error: "no_credentials",
      message: "Nenhuma chave salva. Informe a API Key ou salve antes de testar.",
    });
    return;
  }

  const result = await testOpenRouterConnection(creds);
  res.json({
    ...result,
    storedInDb,
    apiKeyMasked: maskSecret(creds.apiKey),
    baseUrl: creds.baseUrl,
  });
});

router.put("/ai/credentials", async (req: AuthedRequest, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials" });
    return;
  }

  const baseUrl = parsed.data.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL;
  let saved;
  try {
    saved = await saveTenantOpenRouterCredentials(pool, req.auth!.tenantId, {
      apiKey: parsed.data.apiKey,
      baseUrl,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "invalid_api_key_format") {
      res.status(400).json({ error: "invalid_api_key_format" });
      return;
    }
    if (msg === "credential_persist_failed") {
      res.status(500).json({ error: "credential_persist_failed" });
      return;
    }
    if (msg.includes("SESSION_SECRET")) {
      res.status(500).json({ error: "session_secret_required" });
      return;
    }
    throw e;
  }

  applyOpenRouterEnv(saved);

  let envPath: string | null = null;
  try {
    envPath = upsertEnvVars({
      AI_INTEGRATIONS_OPENROUTER_API_KEY: saved.apiKey,
      AI_INTEGRATIONS_OPENROUTER_BASE_URL: saved.baseUrl,
      CLASSIFY_PROVIDER: "openrouter",
    });
  } catch (e) {
    req.log.error({ err: e }, "failed to write .env");
    res.status(500).json({
      error: "env_write_failed",
      message: "Chave criptografada no banco, mas falhou ao atualizar o .env.",
      storedInDb: true,
    });
    return;
  }

  res.json({
    ok: true,
    openRouterConfigured: true,
    apiKeyMasked: maskSecret(saved.apiKey),
    baseUrl: saved.baseUrl,
    envUpdated: true,
    storedInDb: true,
    envFilePath: envPath,
  });
});

router.get("/ai/settings", async (req: AuthedRequest, res) => {
  await syncOpenRouterFromTenant(req.auth!.tenantId);
  const settings = await getTenantAiSettings(pool, req.auth!.tenantId);
  const env = isOpenRouterReady(await getTenantOpenRouterCredentials(pool, req.auth!.tenantId))
    ? await buildTenantAiEnv(pool, req.auth!.tenantId)
    : {};
  res.json({
    settings,
    resolvedModels: {
      classify: env.CLASSIFY_MODEL ?? null,
      cluster: env.CLUSTER_MODEL ?? env.CLASSIFY_MODEL ?? null,
      mentions: env.MENTIONS_MODEL ?? env.CLASSIFY_MODEL ?? null,
      contact_analysis:
        env.CONTACT_ANALYSIS_MODEL ?? env.CLASSIFY_MODEL ?? null,
      audio: env.AUDIO_MODEL ?? null,
      image: env.IMAGE_MODEL ?? null,
      video: env.VIDEO_MODEL ?? null,
    },
    autoFreeDefaults: [...AUTO_FREE_TEXT_MODELS],
  });
});

router.put("/ai/settings", async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ issues: parsed.error.issues }, "invalid ai settings");
    res.status(400).json({ error: "invalid_settings" });
    return;
  }
  const body = parsed.data;
  const saved = await saveTenantAiSettings(pool, req.auth!.tenantId, {
    mode: body.mode as AiSelectionMode,
    selectedFreeModels:
      body.selectedFreeModels ?? DEFAULT_TENANT_AI_SETTINGS.selectedFreeModels,
    selectedPaidModels:
      body.selectedPaidModels ?? DEFAULT_TENANT_AI_SETTINGS.selectedPaidModels,
    byTask: (body.byTask ?? {}) as Partial<Record<AiTaskType, string>>,
  });
  const env = isOpenRouterReady(await getTenantOpenRouterCredentials(pool, req.auth!.tenantId))
    ? await buildTenantAiEnv(pool, req.auth!.tenantId)
    : {};
  res.json({ settings: saved, resolvedModels: env });
});

router.get("/ai/models", async (req: AuthedRequest, res) => {
  const creds = await syncOpenRouterFromTenant(req.auth!.tenantId);
  if (!isOpenRouterReady(creds)) {
    res.status(503).json({ error: "openrouter_not_configured" });
    return;
  }
  const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
  const filterNorm =
    filter === "free" || filter === "paid" ? filter : ("all" as const);
  const raw = await fetchOpenRouterModels();
  const models = enrichAndSortModels(raw, filterNorm);
  res.json({ models, taskTypes: AI_TASK_TYPES, fetchedAt: new Date().toISOString() });
});

router.get("/ai/preview", async (req: AuthedRequest, res) => {
  const creds = await syncOpenRouterFromTenant(req.auth!.tenantId);
  if (!isOpenRouterReady(creds)) {
    res.status(503).json({ error: "openrouter_not_configured" });
    return;
  }
  const settings = await getTenantAiSettings(pool, req.auth!.tenantId);
  const catalog = await fetchOpenRouterModels();
  const resolved = resolveModelsForSettings(settings, catalog);
  res.json({ settings, resolved });
});

export default router;
