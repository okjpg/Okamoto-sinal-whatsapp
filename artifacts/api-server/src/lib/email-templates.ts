/** Branded HTML + plain-text templates for Sinal transactional mail. */

export interface BrandedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailLayoutOptions {
  preheader: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerLines?: string[];
  badge?: string;
}

const BRAND = {
  name: "Sinal",
  tagline: "WhatsApp Intelligence + CRM",
  bg: "#0A0A0C",
  surface: "#121217",
  surface2: "#181820",
  border: "#26262F",
  text: "#ECECF1",
  muted: "#8C8C99",
  muted2: "#5E5E6B",
  accent: "#35E0D8",
  accentText: "#06201e",
  ok: "#4ADE80",
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Shared dark layout — table-based for Gmail/Outlook compatibility. */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const title = escapeHtml(opts.title);
  const subtitle = opts.subtitle ? escapeHtml(opts.subtitle) : "";
  const preheader = escapeHtml(opts.preheader);
  const badge = opts.badge ? escapeHtml(opts.badge) : "";
  const footerLines = opts.footerLines ?? [
    `${BRAND.name} · mensagem automática, não responda.`,
  ];

  const ctaBlock =
    opts.ctaLabel && opts.ctaUrl
      ? `
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="border-radius:9px;background:${BRAND.accent};">
                    <a href="${escapeHtml(opts.ctaUrl)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:1;color:${BRAND.accentText};text-decoration:none;border-radius:9px;">
                      ${escapeHtml(opts.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted2};word-break:break-all;">
              Ou copie e cole no navegador:<br>
              <a href="${escapeHtml(opts.ctaUrl)}" style="color:${BRAND.accent};text-decoration:none;">${escapeHtml(opts.ctaUrl)}</a>
            </td>
          </tr>`
      : "";

  const badgeBlock = badge
    ? `<tr>
         <td style="padding:0 32px 8px 32px;">
           <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:rgba(53,224,216,0.14);border:1px solid rgba(53,224,216,0.35);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.accent};">
             ${badge}
           </span>
         </td>
       </tr>`
    : "";

  const footerHtml = footerLines
    .map(
      (line) =>
        `<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted2};">${escapeHtml(line)}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
  <style>
    @media (prefers-color-scheme: light) {
      .email-bg { background-color: ${BRAND.bg} !important; }
      .email-card { background-color: ${BRAND.surface} !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:${BRAND.bg};color:${BRAND.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:40px 16px 48px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.accentText} 140%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:${BRAND.accentText};">
                    S
                  </td>
                  <td style="padding-left:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <div style="font-size:18px;font-weight:700;letter-spacing:0.02em;color:${BRAND.text};">${BRAND.name}</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:2px;">${BRAND.tagline}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
                ${badgeBlock}
                <tr>
                  <td style="padding:${badge ? "8px" : "32px"} 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.25;color:${BRAND.text};">
                    ${title}
                  </td>
                </tr>
                ${
                  subtitle
                    ? `<tr>
                         <td style="padding:10px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.muted};">
                           ${subtitle}
                         </td>
                       </tr>`
                    : ""
                }
                <tr>
                  <td style="padding:20px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:${BRAND.text};">
                    ${opts.bodyHtml}
                  </td>
                </tr>
                ${ctaBlock}
                <tr>
                  <td style="padding:28px 32px 32px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${BRAND.border};">
                      <tr>
                        <td style="padding-top:20px;">
                          ${footerHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetEmail(opts: {
  resetUrl: string;
  expiresMinutes?: number;
}): BrandedEmail {
  const expires = opts.expiresMinutes ?? 60;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Recebemos um pedido para redefinir a senha da sua conta no <strong style="color:${BRAND.accent};">${BRAND.name}</strong>.</p>
    <p style="margin:0 0 16px 0;">Clique no botão abaixo para escolher uma nova senha. Por segurança, o link expira em <strong>${expires} minutos</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 4px 0;">
      <tr>
        <td style="padding:14px 16px;background-color:${BRAND.surface2};border:1px solid ${BRAND.border};border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.muted};">
          Se você <strong style="color:${BRAND.text};">não solicitou</strong> esta alteração, ignore este e-mail. Sua senha permanece a mesma.
        </td>
      </tr>
    </table>`;

  const html = renderEmailLayout({
    preheader: `Redefina sua senha no ${BRAND.name}. Link válido por ${expires} minutos.`,
    badge: "Recuperação de senha",
    title: "Redefinir sua senha",
    subtitle: "Use o link abaixo para acessar sua conta com segurança.",
    bodyHtml,
    ctaLabel: "Criar nova senha",
    ctaUrl: opts.resetUrl,
    footerLines: [
      `Este link expira em ${expires} minutos e só pode ser usado uma vez.`,
      `${BRAND.name} · mensagem automática, não responda.`,
    ],
  });

  const text = [
    `${BRAND.name} · redefinir senha`,
    "",
    "Recebemos um pedido para redefinir sua senha.",
    "",
    `Abra este link (válido por ${expires} minutos):`,
    opts.resetUrl,
    "",
    "Se você não pediu, ignore este e-mail.",
  ].join("\n");

  return {
    subject: `${BRAND.name} · redefinir senha`,
    text,
    html,
  };
}

export function buildSmtpTestEmail(opts?: {
  appName?: string;
  recipientEmail?: string;
}): BrandedEmail {
  const app = opts?.appName ?? BRAND.name;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Ótima notícia — a conexão SMTP do <strong style="color:${BRAND.accent};">${escapeHtml(app)}</strong> está funcionando.</p>
    <p style="margin:0 0 16px 0;">Este é um e-mail de teste enviado pelo painel administrativo. Quando um usuário clicar em <strong style="color:${BRAND.text};">Esqueci a senha</strong>, ele receberá um layout igual ao da recuperação de senha.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:14px 16px;background-color:${BRAND.surface2};border:1px solid ${BRAND.border};border-radius:9px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};padding-bottom:6px;">Status</td>
            </tr>
            <tr>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BRAND.ok};">
                ✓ SMTP configurado e pronto para envio
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const html = renderEmailLayout({
    preheader: `Teste SMTP concluído com sucesso no ${app}.`,
    badge: "Teste SMTP",
    title: "Conexão verificada",
    subtitle: opts?.recipientEmail
      ? `Enviado para ${escapeHtml(opts.recipientEmail)}`
      : "Seu servidor de e-mail respondeu corretamente.",
    bodyHtml,
    footerLines: [
      "Você pode fechar este e-mail — nenhuma ação é necessária.",
      `${app} · mensagem automática, não responda.`,
    ],
  });

  const text = [
    `${app} · teste SMTP`,
    "",
    "Conexão SMTP OK.",
    "O envio de recuperação de senha está habilitado.",
    "",
    opts?.recipientEmail ? `Destinatário: ${opts.recipientEmail}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${app} · teste SMTP`,
    text,
    html,
  };
}

/** Generic branded notice — reuse for future transactional mail. */
export function buildBrandedNoticeEmail(opts: {
  subject: string;
  preheader: string;
  badge?: string;
  title: string;
  subtitle?: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerLines?: string[];
}): BrandedEmail {
  const bodyHtml = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const html = renderEmailLayout({
    preheader: opts.preheader,
    badge: opts.badge,
    title: opts.title,
    subtitle: opts.subtitle,
    bodyHtml,
    ctaLabel: opts.ctaLabel,
    ctaUrl: opts.ctaUrl,
    footerLines: opts.footerLines,
  });

  return {
    subject: opts.subject,
    text: stripHtml(bodyHtml),
    html,
  };
}
