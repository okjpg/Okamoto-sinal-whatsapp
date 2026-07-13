import { pool } from "@workspace/db";
import type { EvolutionConfig } from "./evolution-api";
import {
  evolutionWebhookUrl,
  fetchConnectionState,
  fetchEvolutionInstanceDetails,
  fetchEvolutionServerInfo,
  fetchEvolutionWebhook,
  getEvolutionConfig,
  getSuggestedInstanceName,
  instanceExistsOnServer,
  isEvolutionConnected,
  type EvolutionInstanceDetails,
  type EvolutionServerInfo,
} from "./evolution-api";
import { OWNER } from "./scope";
import {
  computeWebhookHealth,
  webhookUrlsMatch,
  type WebhookHealth,
} from "./webhook-health";

export interface MessageMirror {
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  totalMessages: number;
  privateChats: number;
  groupChats: number;
}

export interface WhatsAppConnectionStatus {
  configured: boolean;
  connected: boolean;
  state: string;
  instance: string | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  webhookRegistered: boolean;
  webhookRegisteredUrl: string | null;
  instanceExists: boolean;
  suggestedInstanceName: string;
  ownerPhone: string;
  server: EvolutionServerInfo | null;
  instanceDetails: EvolutionInstanceDetails | null;
  mirror: MessageMirror;
  phoneMatchesOwner: boolean | null;
  lastWebhookAt: string | null;
  minutesSinceLastWebhook: number | null;
  minutesSinceLastMessage: number | null;
  webhookStale: boolean;
  webhookStaleReason: string | null;
}

export type { WebhookHealth };

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function getMessageMirror(
  owner = OWNER,
): Promise<MessageMirror> {
  if (!owner) {
    return {
      firstMessageAt: null,
      lastMessageAt: null,
      totalMessages: 0,
      privateChats: 0,
      groupChats: 0,
    };
  }
  const { rows } = await pool.query<{
    first_at: Date | null;
    last_at: Date | null;
    total: number;
    private_chats: number;
    group_chats: number;
  }>(
    `select min(message_created_at) as first_at,
            max(message_created_at) as last_at,
            count(*)::int as total,
            count(distinct chat_id) filter (
              where chat_type = 'private' and chat_id is not null
            )::int as private_chats,
            count(distinct chat_id) filter (
              where chat_type = 'group' and chat_id is not null
            )::int as group_chats
       from whatsapp_messages
      where whatsapp_owner = $1`,
    [owner],
  );
  const r = rows[0];
  return {
    firstMessageAt: r?.first_at ? new Date(r.first_at).toISOString() : null,
    lastMessageAt: r?.last_at ? new Date(r.last_at).toISOString() : null,
    totalMessages: r?.total ?? 0,
    privateChats: r?.private_chats ?? 0,
    groupChats: r?.group_chats ?? 0,
  };
}

export async function getWhatsAppConnectionStatus(
  cfg: EvolutionConfig | null,
): Promise<WhatsAppConnectionStatus> {
  const ownerPhone = OWNER ?? "";
  const suggestedInstanceName = OWNER ? getSuggestedInstanceName(OWNER) : "sinal";
  const webhookUrl = evolutionWebhookUrl();
  const mirror = await getMessageMirror();
  const health = computeWebhookHealth(mirror, false);

  const base: WhatsAppConnectionStatus = {
    configured: false,
    connected: false,
    state: "unconfigured",
    instance: null,
    webhookUrl,
    webhookConfigured: Boolean(webhookUrl),
    webhookRegistered: false,
    webhookRegisteredUrl: null,
    instanceExists: false,
    suggestedInstanceName,
    ownerPhone,
    server: null,
    instanceDetails: null,
    mirror,
    phoneMatchesOwner: null,
    ...health,
  };

  if (!cfg) return base;

  try {
    const [state, instanceExists, instanceDetails, server, evolutionWebhook] =
      await Promise.all([
        fetchConnectionState(cfg),
        instanceExistsOnServer(cfg),
        fetchEvolutionInstanceDetails(cfg),
        fetchEvolutionServerInfo(cfg),
        fetchEvolutionWebhook(cfg),
      ]);
    const liveState = instanceDetails?.connectionStatus ?? state;
    const connected = isEvolutionConnected(liveState);
    const health = computeWebhookHealth(mirror, connected);
    const webhookRegistered = Boolean(
      evolutionWebhook?.enabled &&
        webhookUrlsMatch(webhookUrl, evolutionWebhook.url),
    );
    const evolutionPhone =
      instanceDetails?.number ??
      (instanceDetails?.ownerJid
        ? instanceDetails.ownerJid.replace(/@.*$/, "")
        : null);
    const phoneMatchesOwner = evolutionPhone
      ? digitsOnly(evolutionPhone) === digitsOnly(ownerPhone)
      : null;

    return {
      configured: true,
      connected,
      state: liveState,
      instance: cfg.instance,
      webhookUrl,
      webhookConfigured: Boolean(webhookUrl),
      webhookRegistered,
      webhookRegisteredUrl: evolutionWebhook?.url ?? null,
      instanceExists,
      suggestedInstanceName,
      ownerPhone,
      server,
      instanceDetails,
      mirror,
      phoneMatchesOwner,
      ...health,
    };
  } catch {
    return {
      ...base,
      configured: true,
      state: "error",
      instance: cfg.instance,
    };
  }
}

export async function getDefaultWhatsAppConnectionStatus(): Promise<WhatsAppConnectionStatus> {
  return getWhatsAppConnectionStatus(getEvolutionConfig());
}
