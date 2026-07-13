import { MVP_TENANT_ID } from "@workspace/db";
import {
  type EnrichedDigestContext,
  fmtDateBr,
  fmtDue,
  fmtTimeAgo,
  fmtTimeBr,
  loadEnrichedContext,
  resolveAppUrl,
} from "./telegram-data";
import { escapeTelegramHtml } from "./telegram";
import {
  bullet,
  connectionStateLabel,
  fmtIsoBr,
  formatBrazilPhone,
  healthLabel,
  healthLevel,
  metricRow,
  phoneFromJid,
  telegramHeader,
  telegramRule,
  trendLabel,
  truncate,
} from "./telegram-format";
import {
  digestInlineKeyboard,
  dmsInlineKeyboard,
  isTelegramInlineUrl,
  mainMenuKeyboard,
  mentionsInlineKeyboard,
  navInlineKeyboard,
  pendenciasInlineKeyboard,
  tasksInlineKeyboard,
  whatsappInlineKeyboard,
} from "./telegram-keyboards";
import type { SendTelegramOptions } from "./telegram";

export type { Overview7d } from "./telegram-data";
export { loadEnrichedContext as loadDigestContext, resolveAppUrl };

export type DigestContext = EnrichedDigestContext;

function urgentCount(ctx: EnrichedDigestContext): number {
  return (
    ctx.summary.pendingUnanswered +
    ctx.summary.openTasks +
    ctx.summary.mentionsLast24h
  );
}

function statusStrip(ctx: EnrichedDigestContext): string {
  const level = healthLevel(urgentCount(ctx));
  const wa = ctx.whatsapp;
  const conn = connectionStateLabel(wa.state, wa.connected);
  const parts = [
    `<b>${healthLabel(level)}</b>`,
    `<b>${escapeTelegramHtml(conn)}</b>`,
  ];
  if (wa.instanceDetails?.profileName) {
    parts.push(escapeTelegramHtml(wa.instanceDetails.profileName));
  }
  if (ctx.live.refreshRunning) parts.push("refresh em andamento");
  return parts.join("  ·  ");
}

function whatsappSummaryLines(ctx: EnrichedDigestContext): string[] {
  const wa = ctx.whatsapp;
  const d = wa.instanceDetails;
  const lines = [
    "",
    "<b>WhatsApp</b>",
    metricRow(
      "Status",
      connectionStateLabel(wa.state, wa.connected),
      { highlight: !wa.connected },
    ),
    metricRow("Conta Sinal", formatBrazilPhone(wa.ownerPhone)),
  ];
  if (wa.instance) {
    lines.push(metricRow("Instância", wa.instance));
  }
  if (d?.profileName) {
    lines.push(metricRow("Perfil", d.profileName));
  }
  const jidPhone = phoneFromJid(d?.ownerJid);
  if (jidPhone) {
    lines.push(metricRow("Número (Evolution)", formatBrazilPhone(jidPhone)));
  }
  if (wa.phoneMatchesOwner === false) {
    lines.push(
      "  <i>⚠ Número da instância difere do WHATSAPP_OWNER no .env</i>",
    );
  }
  if (d?.disconnectionAt && !wa.connected) {
    lines.push(
      metricRow("Desconectou em", fmtIsoBr(d.disconnectionAt)),
    );
  }
  lines.push(
    metricRow("Msgs no banco", wa.mirror.totalMessages),
    metricRow("Última msg (banco)", fmtTimeAgo(wa.mirror.lastMessageAt)),
  );
  return lines;
}

function buildActions(ctx: EnrichedDigestContext): string[] {
  const { summary, live } = ctx;
  const actions: string[] = [];
  if (summary.pendingUnanswered > 0) {
    actions.push(
      `Responder <b>${summary.pendingUnanswered}</b> DM(s) com IA pendente`,
    );
  }
  if (summary.openTasks > 0) {
    actions.push(`Fechar <b>${summary.openTasks}</b> task(s) aberta(s)`);
  }
  if (summary.mentionsLast24h > 0) {
    actions.push(`Revisar <b>${summary.mentionsLast24h}</b> menção(ões)`);
  }
  if (summary.expiredSnoozes > 0) {
    actions.push(`Revisar <b>${summary.expiredSnoozes}</b> snooze(s) expirado(s)`);
  }
  if (live.unenrichedRecent > 0) {
    actions.push(
      `Rodar atualização — <b>${live.unenrichedRecent}</b> msg(s) sem IA (24h)`,
    );
  }
  if (!ctx.whatsapp.connected && ctx.whatsapp.configured) {
    actions.push("Reconectar WhatsApp no dashboard");
  }
  if (actions.length === 0) {
    actions.push("Cockpit em dia — nenhuma ação urgente");
  }
  return actions;
}

function pendingDmBlock(ctx: EnrichedDigestContext, limit = 3): string[] {
  if (ctx.pendingDms.length === 0) return [];
  const lines = ["", "<b>DMs aguardando resposta</b>"];
  for (const dm of ctx.pendingDms.slice(0, limit)) {
    const who = escapeTelegramHtml(dm.name ?? dm.chat_id);
    const cat = dm.category
      ? ` <code>${escapeTelegramHtml(dm.category)}</code>`
      : "";
    const snippet = dm.summary
      ? `\n${bullet(`<i>${escapeTelegramHtml(truncate(dm.summary, 90))}</i>`)}`
      : "";
    const tasks =
      dm.open_tasks > 0
        ? ` · ${dm.open_tasks} task(s)`
        : "";
    lines.push(
      `${bullet(`<b>${who}</b>${cat} · ${fmtTimeAgo(dm.last_at)}${tasks}`)}${snippet}`,
    );
  }
  if (ctx.summary.pendingUnanswered > limit) {
    lines.push(
      `  <i>… e mais ${ctx.summary.pendingUnanswered - limit} conversa(s)</i>`,
    );
  }
  return lines;
}

export function buildWelcomeMessage(): SendTelegramOptions & { text: string } {
  return {
    text: [
      telegramHeader("SINAL", "WhatsApp Intelligence · cockpit no Telegram"),
      "",
      "Monitore pendências, menções e tasks do Sinal sem abrir o dashboard.",
      "",
      telegramRule(),
      "<b>Menu rápido</b>",
      "Use os botões abaixo ou digite / para ver comandos.",
      "",
      "/resumo — visão completa",
      "/dms — conversas sem resposta (com IA)",
      "/tasks — tarefas abertas",
      "/mencoes — menções recentes",
      "/whatsapp — instância, número e conexão",
      "/atualizar — rodar pipeline de dados",
      "/status — saúde do sistema",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: mainMenuKeyboard(),
  };
}

export function buildHelpMessage(): SendTelegramOptions & { text: string } {
  return {
    text: [
      telegramHeader("Ajuda", "Comandos do Sinal"),
      "",
      "/start — menu principal",
      "/resumo — resumo executivo",
      "/pendencias — fila de atenção",
      "/dms — DMs com resumo de IA",
      "/tasks — tasks em aberto",
      "/mencoes — menções monitoradas",
      "/whatsapp — instância, número e datas da conexão",
      "/atualizar — refresh incremental (classify + contacts + topics)",
      "/status — WhatsApp, refresh e pipeline",
      "",
      "<b>Integração</b>",
      "• Alertas automáticos após cada refresh concluído",
      "• Botões inline abrem o dashboard (URL pública)",
      "• Dados em tempo real do mesmo banco do cockpit",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: mainMenuKeyboard(),
  };
}

export function buildDigestMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const { summary, live, overview, tasks, mentions, latestRun, appUrl, volumeTrend } =
    ctx;
  const urgent = urgentCount(ctx);
  const maxPending = Math.max(summary.pendingUnanswered, 5);

  const parts: string[] = [
    telegramHeader("SINAL · Resumo", `${fmtDateBr()} · ${fmtTimeBr()}`),
    statusStrip(ctx),
    "",
    urgent > 0
      ? `<b>▸ ${urgent} item(ns) na fila de atenção</b>`
      : "<b>▸ Cockpit em dia</b>",
    "",
    "<b>Volume privado (7d)</b>",
    metricRow("Recebidas", overview.received, {
      bar: { value: overview.received, max: Math.max(overview.received, 10) },
    }),
    metricRow("Enviadas", overview.sent),
    metricRow("Tendência", trendLabel(volumeTrend.pctChange)),
    metricRow("Grupos ativos", overview.groups),
    "",
    "<b>Fila de atenção</b>",
    metricRow("DMs sem resposta", summary.pendingUnanswered, {
      bar: { value: summary.pendingUnanswered, max: maxPending },
    }),
    metricRow("Tasks abertas", summary.openTasks),
    metricRow("Menções (24h)", summary.mentionsLast24h),
    metricRow("Snoozes expirados", summary.expiredSnoozes),
    ...whatsappSummaryLines(ctx),
    ...pendingDmBlock(ctx),
    "",
    "<b>Pipeline</b>",
    metricRow("Última mensagem", fmtTimeAgo(live.lastMessageAt)),
    metricRow("Último refresh", fmtTimeAgo(live.lastRefreshAt)),
    metricRow("Sem IA (24h)", live.unenrichedRecent),
  ];

  if (latestRun?.status === "failed") {
    parts.push(
      metricRow("Refresh", latestRun.error ?? "falhou", { highlight: true }),
    );
  }

  if (tasks.length > 0) {
    parts.push("", "<b>Próximas tasks</b>");
    for (const t of tasks.slice(0, 3)) {
      const who = t.contact_name
        ? ` · <i>${escapeTelegramHtml(t.contact_name)}</i>`
        : "";
      const due = t.due_at ? ` · ${fmtDue(t.due_at)}` : "";
      parts.push(bullet(`${escapeTelegramHtml(t.title)}${who}${due}`));
    }
    if (summary.openTasks > 3) {
      parts.push(`  <i>… e mais ${summary.openTasks - 3}</i>`);
    }
  }

  if (mentions.length > 0) {
    parts.push("", "<b>Menções recentes</b>");
    for (const m of mentions.slice(0, 2)) {
      const type = m.mention_type
        ? ` <code>${escapeTelegramHtml(m.mention_type)}</code>`
        : "";
      parts.push(bullet(`${escapeTelegramHtml(m.entity_name)}${type}`));
    }
  }

  parts.push("", "<b>Próximos passos</b>");
  for (const a of buildActions(ctx)) {
    parts.push(`  → ${a}`);
  }

  if (!isTelegramInlineUrl(appUrl)) {
    parts.push(
      "",
      `<i>Dashboard:</i> <code>${escapeTelegramHtml(appUrl)}</code>`,
    );
  }

  return {
    text: parts.join("\n"),
    parseMode: "HTML",
    replyMarkup: digestInlineKeyboard(appUrl),
  };
}

export function buildPendenciasMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const { summary, appUrl } = ctx;
  const parts: string[] = [
    telegramHeader("SINAL · Pendências", fmtDateBr()),
    statusStrip(ctx),
    "",
    metricRow("DMs sem resposta", summary.pendingUnanswered),
    metricRow("Tasks abertas", summary.openTasks),
    metricRow("Menções (24h)", summary.mentionsLast24h),
    metricRow("Snoozes expirados", summary.expiredSnoozes),
    ...pendingDmBlock(ctx, 5),
  ];

  if (urgentCount(ctx) === 0 && summary.expiredSnoozes === 0) {
    parts.push("", "<i>Nada pendente no momento.</i>");
  }

  return {
    text: parts.join("\n"),
    parseMode: "HTML",
    replyMarkup: pendenciasInlineKeyboard(appUrl),
  };
}

export function buildDmsMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const parts: string[] = [
    telegramHeader("SINAL · DMs pendentes", fmtDateBr()),
    `<i>${ctx.summary.pendingUnanswered} conversa(s) com requires_reply</i>`,
    "",
  ];

  if (ctx.pendingDms.length === 0) {
    parts.push("<i>Nenhuma DM pendente — inbox em dia.</i>");
  } else {
    for (const dm of ctx.pendingDms) {
      const who = escapeTelegramHtml(dm.name ?? dm.chat_id);
      const cat = dm.category
        ? `\n${bullet(`Categoria: <code>${escapeTelegramHtml(dm.category)}</code>`)}`
        : "";
      const summary = dm.summary
        ? `\n${bullet(`<i>${escapeTelegramHtml(truncate(dm.summary, 120))}</i>`)}`
        : "";
      const meta = ` · ${fmtTimeAgo(dm.last_at)}${
        dm.open_tasks > 0 ? ` · ${dm.open_tasks} task(s)` : ""
      }`;
      parts.push(`<b>${who}</b>${meta}${cat}${summary}`, "");
    }
  }

  return {
    text: parts.join("\n").trim(),
    parseMode: "HTML",
    replyMarkup: dmsInlineKeyboard(ctx.appUrl),
  };
}

export function buildTasksMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const parts: string[] = [
    telegramHeader("SINAL · Tasks", fmtDateBr()),
    `<i>${ctx.summary.openTasks} em aberto</i>`,
    "",
  ];

  if (ctx.tasks.length === 0) {
    parts.push("<i>Nenhuma task aberta.</i>");
  } else {
    for (const t of ctx.tasks) {
      const who = t.contact_name
        ? ` · <i>${escapeTelegramHtml(t.contact_name)}</i>`
        : "";
      const due = t.due_at ? ` · ${fmtDue(t.due_at)}` : "";
      const dir = t.direction ? ` · ${escapeTelegramHtml(t.direction)}` : "";
      parts.push(bullet(`<b>${escapeTelegramHtml(t.title)}</b>${who}${due}${dir}`));
    }
    if (ctx.summary.openTasks > ctx.tasks.length) {
      parts.push(`  <i>… e mais ${ctx.summary.openTasks - ctx.tasks.length}</i>`);
    }
  }

  return {
    text: parts.join("\n"),
    parseMode: "HTML",
    replyMarkup: tasksInlineKeyboard(ctx.appUrl),
  };
}

export function buildMencoesMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const parts: string[] = [
    telegramHeader("SINAL · Menções", fmtDateBr()),
    `<i>${ctx.summary.mentionsLast24h} nas últimas 24h</i>`,
    "",
  ];

  if (ctx.mentions.length === 0) {
    parts.push("<i>Nenhuma menção recente nas entidades monitoradas.</i>");
  } else {
    for (const m of ctx.mentions) {
      const type = m.mention_type
        ? ` <code>${escapeTelegramHtml(m.mention_type)}</code>`
        : "";
      const sent = m.sentiment
        ? ` · ${escapeTelegramHtml(m.sentiment)}`
        : "";
      const where = m.chat_name
        ? ` · <i>${escapeTelegramHtml(truncate(m.chat_name, 30))}</i>`
        : "";
      const snippet = m.text
        ? `\n${bullet(`<i>${escapeTelegramHtml(truncate(m.text, 100))}</i>`)}`
        : "";
      parts.push(
        `${bullet(`<b>${escapeTelegramHtml(m.entity_name)}</b>${type}${sent}${where} · ${fmtTimeAgo(m.created_at)}`)}${snippet}`,
        "",
      );
    }
  }

  return {
    text: parts.join("\n").trim(),
    parseMode: "HTML",
    replyMarkup: mentionsInlineKeyboard(ctx.appUrl),
  };
}

export function buildWhatsAppMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const wa = ctx.whatsapp;
  const d = wa.instanceDetails;
  const srv = wa.server;
  const conn = connectionStateLabel(wa.state, wa.connected);
  const jidPhone = phoneFromJid(d?.ownerJid);

  const parts: string[] = [
    telegramHeader("SINAL · WhatsApp", `${fmtDateBr()} · ${fmtTimeBr()}`),
    `<b>${escapeTelegramHtml(conn)}</b>  ·  ${escapeTelegramHtml(wa.label)}`,
    "",
    "<b>Conta configurada no Sinal</b>",
    metricRow("WHATSAPP_OWNER", formatBrazilPhone(wa.ownerPhone)),
    metricRow("Tenant", ctx.tenantId.slice(0, 8) + "…"),
  ];

  if (wa.configured) {
    parts.push(
      "",
      "<b>Evolution API</b>",
      metricRow("Servidor", srv?.host ?? "—"),
    );
    if (srv?.version) {
      parts.push(metricRow("Versão", `${srv.version}${srv.clientName ? ` · ${srv.clientName}` : ""}`));
    }
    parts.push(
      metricRow("Instância ativa", wa.instance ?? "—"),
      metricRow("Existe no servidor", wa.instanceExists ? "sim" : "não"),
    );
    if (wa.suggestedInstance && wa.suggestedInstance !== wa.instance) {
      parts.push(metricRow("Sugerida (.env)", wa.suggestedInstance));
    }
    if (d?.integration) {
      parts.push(metricRow("Integração", d.integration));
    }
    if (d?.id) {
      parts.push(metricRow("ID instância", d.id.slice(0, 13) + "…"));
    }

    parts.push(
      "",
      "<b>Sessão WhatsApp</b>",
      metricRow("Status Evolution", d?.connectionStatus ?? wa.state),
    );
    if (d?.profileName) {
      parts.push(metricRow("Nome do perfil", d.profileName));
    }
    if (jidPhone) {
      parts.push(metricRow("Número (ownerJid)", formatBrazilPhone(jidPhone)));
    }
    if (d?.ownerJid) {
      parts.push(`  JID … <code>${escapeTelegramHtml(d.ownerJid)}</code>`);
    }
    if (wa.phoneMatchesOwner === false) {
      parts.push(
        "",
        "<b>⚠ Divergência de número</b>",
        `  O JID da instância (<code>${escapeTelegramHtml(formatBrazilPhone(jidPhone ?? ""))}</code>)`,
        `  difere do <code>WHATSAPP_OWNER</code> (<code>${escapeTelegramHtml(formatBrazilPhone(wa.ownerPhone))}</code>).`,
        "  Ajuste o .env ou reconecte a instância correta em Conectores.",
      );
    } else if (wa.phoneMatchesOwner === true) {
      parts.push(metricRow("Número", "alinhado com WHATSAPP_OWNER ✓"));
    }

    parts.push(
      "",
      "<b>Datas da instância</b>",
      metricRow("Criada em", fmtIsoBr(d?.createdAt)),
      metricRow("Atualizada em", fmtIsoBr(d?.updatedAt)),
    );
    if (d?.disconnectionAt) {
      parts.push(metricRow("Desconectada em", fmtIsoBr(d.disconnectionAt)));
    }
    if (d?.disconnectionReasonCode != null) {
      parts.push(metricRow("Código desconexão", d.disconnectionReasonCode));
    }
    if (d?.disconnectionMessage) {
      parts.push(metricRow("Motivo", truncate(d.disconnectionMessage, 80), { highlight: true }));
    }

    parts.push(
      "",
      "<b>Webhook (mensagens → Sinal)</b>",
      metricRow("Configurado", wa.webhookConfigured ? "sim" : "não"),
    );
    if (wa.webhookUrl) {
      const hook = isTelegramInlineUrl(wa.webhookUrl)
        ? wa.webhookUrl
        : truncate(wa.webhookUrl, 60);
      parts.push(metricRow("URL", `<code>${escapeTelegramHtml(hook)}</code>`));
    }
  } else {
    parts.push(
      "",
      "<i>Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no .env da API.</i>",
    );
  }

  parts.push(
    "",
    "<b>Espelho no banco (whatsapp_messages)</b>",
    metricRow("Total de mensagens", wa.mirror.totalMessages),
    metricRow("Chats privados", wa.mirror.privateChats),
    metricRow("Grupos", wa.mirror.groupChats),
    metricRow("Primeira mensagem", fmtIsoBr(wa.mirror.firstMessageAt)),
    metricRow("Última mensagem", fmtIsoBr(wa.mirror.lastMessageAt)),
    metricRow("Última msg (relativo)", fmtTimeAgo(wa.mirror.lastMessageAt)),
  );

  if (!wa.connected) {
    parts.push(
      "",
      "<b>Reconectar</b>",
      "  Abra o dashboard → Conectores → WhatsApp → Conectar com QR.",
    );
    if (!isTelegramInlineUrl(ctx.appUrl)) {
      parts.push(`  <code>${escapeTelegramHtml(ctx.appUrl)}/conectores</code>`);
    }
  }

  return {
    text: parts.join("\n"),
    parseMode: "HTML",
    replyMarkup: whatsappInlineKeyboard(ctx.appUrl),
  };
}

export function buildStatusMessage(
  ctx: EnrichedDigestContext,
): SendTelegramOptions & { text: string } {
  const { live, latestRun, overview, appUrl, whatsapp, volumeTrend } = ctx;
  const refreshLabel =
    latestRun?.status === "running"
      ? "em andamento"
      : latestRun?.status === "failed"
        ? "falhou"
        : latestRun?.status === "completed"
          ? "ok"
          : "—";

  const parts = [
    telegramHeader("SINAL · Status", `${fmtDateBr()} · ${fmtTimeBr()}`),
    statusStrip(ctx),
    "",
    "<b>WhatsApp</b>",
    metricRow("Status", connectionStateLabel(whatsapp.state, whatsapp.connected)),
    metricRow("Instância", whatsapp.instance ?? "—"),
    metricRow("Perfil", whatsapp.instanceDetails?.profileName ?? "—"),
    metricRow("Conta", formatBrazilPhone(whatsapp.ownerPhone)),
    "",
    "<b>Atividade (7d)</b>",
    metricRow("Mensagens", overview.totalMessages),
    metricRow("Recebidas", overview.received),
    metricRow("Tendência", trendLabel(volumeTrend.pctChange)),
    "",
    "<b>Pipeline de dados</b>",
    metricRow("Refresh", refreshLabel),
    metricRow("Último ciclo", fmtTimeAgo(live.lastRefreshAt)),
    metricRow("Msgs sem IA (24h)", live.unenrichedRecent),
    metricRow("Última mensagem WA", fmtTimeAgo(live.lastMessageAt)),
  ];

  if (latestRun?.status === "failed" && latestRun.error) {
    parts.push(
      "",
      `<code>${escapeTelegramHtml(truncate(latestRun.error, 200))}</code>`,
    );
  }

  if (isTelegramInlineUrl(appUrl)) {
    parts.push("", `<a href="${escapeTelegramHtml(appUrl)}">Abrir dashboard</a>`);
  } else {
    parts.push("", `<i>Dashboard:</i> <code>${escapeTelegramHtml(appUrl)}</code>`);
  }

  return {
    text: parts.join("\n"),
    parseMode: "HTML",
    replyMarkup: navInlineKeyboard(appUrl, "status"),
  };
}

export function buildRefreshStartedMessage(
  runId?: string,
): SendTelegramOptions & { text: string } {
  const id = runId ? `\n<code>${escapeTelegramHtml(runId.slice(0, 8))}</code>` : "";
  return {
    text: [
      telegramHeader("Atualização iniciada", "Pipeline incremental do Sinal"),
      "",
      "Classificação IA → contatos → pautas → menções.",
      "Você receberá um alerta quando concluir." + id,
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: mainMenuKeyboard(),
  };
}

export function buildRefreshBusyMessage(): SendTelegramOptions & { text: string } {
  return {
    text: [
      telegramHeader("Refresh em andamento"),
      "",
      "Já existe um ciclo rodando. Aguarde a conclusão — você será notificado.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: mainMenuKeyboard(),
  };
}

export async function loadDefaultDigestContext(
  appUrl?: string | null,
): Promise<EnrichedDigestContext> {
  return loadEnrichedContext(MVP_TENANT_ID, appUrl);
}
