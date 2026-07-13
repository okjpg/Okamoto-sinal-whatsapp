# Telegram — resumo diário do Sinal

Receba no Telegram um resumo diário com métricas, pendências e ações sugeridas.

## 1. Criar o bot

1. No Telegram, abra [@BotFather](https://t.me/BotFather)
2. Envie `/newbot` e siga os passos
3. Copie o **token** (ex.: `7123456789:AAH...`) → `TELEGRAM_BOT_TOKEN` no `.env`
4. **Foto do bot (opcional):** no BotFather, `/setuserpic` → envie `artifacts/sinal-web/public/brand/logo-512.png`

Arquivos de marca: `artifacts/sinal-web/public/`
- `image.png` — fonte original
- `logo.png` — logo no app
- `brand/logo-512.png` — avatar do bot no Telegram (512×512)
- Regenerar tamanhos: `pnpm --filter @workspace/scripts run export-brand`

## 2. Descobrir seu chat_id

1. Envie `/start` para o seu bot
2. Abra no navegador (troque o token):

```
https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
```

3. Procure `"chat":{"id":123456789` → esse número é o `TELEGRAM_CHAT_ID`

> Para grupo: adicione o bot ao grupo, envie uma mensagem e use o `id` do chat (negativo para grupos).

## 3. Configurar o `.env`

```bash
TELEGRAM_BOT_TOKEN=7123456789:AAH...
TELEGRAM_CHAT_ID=123456789
TELEGRAM_DIGEST_HOUR=8          # 08:00 no fuso abaixo
TELEGRAM_DIGEST_TZ=America/Sao_Paulo
SINAL_PUBLIC_URL=http://localhost:5173   # link no final da mensagem
```

Carregue o ambiente:

```bash
source scripts/env.sh
```

## 4. Migration (log anti-duplicata)

```bash
pnpm --filter @workspace/scripts run migrate
```

Cria a tabela `daily_digest_log` (evita enviar duas vezes no mesmo dia).

## 5. Menu e comandos interativos

O bot inclui:

**Menu fixo** (botões abaixo do campo de mensagem):
- Resumo diário · Pendências · DMs pendentes · Tasks
- Menções · Atualizar dados · Status · Ajuda
- **WhatsApp** — instância, número, datas, webhook, espelho no banco

**Comandos** (digite `/` no chat):
- `/start` — boas-vindas + menu
- `/resumo` — resumo executivo (volume, fila, DMs com IA)
- `/pendencias` — fila de atenção consolidada
- `/dms` — conversas sem resposta com resumo de IA
- `/tasks` — tasks abertas com vencimento
- `/mencoes` — menções de entidades monitoradas
- `/whatsapp` — conexão Evolution (instância, número, datas, webhook)
- `/atualizar` — dispara o pipeline do Sinal (classify → contacts → topics)
- `/status` — WhatsApp (Evolution), refresh e pipeline
- `/ajuda` — lista completa

**Botões inline** (no resumo):
- Navegação: Resumo, Pendências, Status, DMs, Tasks, Menções
- Ações: Atualizar dados · Atualizar resumo
- Links do dashboard (quando `SINAL_PUBLIC_URL` for público)

**Alertas automáticos:**
- Após cada refresh concluído, o bot envia resumo de pendências (se houver)
- Refresh falho também gera notificação
- **WhatsApp desconectou** ou **webhook parado** (com `TELEGRAM_WA_OFFLINE_ALERTS=1`)
- Opcional: `TELEGRAM_ALERT_ALWAYS=1` para notificar mesmo sem pendências

```bash
TELEGRAM_WA_OFFLINE_ALERTS=1          # alertas WA offline + webhook parado
TELEGRAM_WA_ALERT_COOLDOWN_MS=1800000 # 30 min entre alertas repetidos
WEBHOOK_STALE_MINUTES=360             # 6h sem mensagem = webhook parado
```

`pnpm start` (start-all.sh) já sobe ngrok + API + web + webhook + telegram-poll quando Telegram está configurado.

### Ativar o menu (local, sem ngrok)

Em um **segundo terminal**, com a API rodando (`pnpm dev`):

```bash
source scripts/env.sh
pnpm --filter @workspace/scripts run telegram-poll
```

Depois envie `/start` ao bot no Telegram.

### Ativar o menu (produção / ngrok)

```bash
source scripts/env.sh
pnpm --filter @workspace/scripts run telegram-setup
```

Registra webhook em `SINAL_PUBLIC_URL/api/telegram/webhook` e os comandos no BotFather.

## 6. Testar envio manual

```bash
pnpm --filter @workspace/scripts run daily-digest -- --force
```

O resumo usa **HTML** (negrito, seções, links) e botões inline.

### Exemplo visual

```
SINAL  ·  Resumo diário
domingo, 13 de julho · 08:00

▸ 4 item(ns) pedem atenção

Visão — últimos 7 dias
  Recebidas … 12
  ...

[ Abrir dashboard ] [ Privado | Tasks ]
[ Menções | Contatos ] [ Atualizar resumo ]
```

---

## Como agendar o envio diário

Escolha **uma** opção:

### Opção A — API rodando 24/7 (automático)

Com `pnpm dev` ou API em produção, o scheduler envia **uma vez por dia** na hora configurada (`TELEGRAM_DIGEST_HOUR`).

Requisitos:
- API ligada na hora do envio
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` no `.env`

Desabilitar: `TELEGRAM_DIGEST_DISABLED=1`

### Opção B — Cron no Mac (recomendado se a API não fica 24h ligada)

```bash
crontab -e
```

Adicione (ajuste o caminho):

```cron
0 8 * * * cd "/caminho/para/whats_page" && bash -lc 'source scripts/env.sh && pnpm --filter @workspace/scripts run daily-digest' >> /tmp/sinal-telegram.log 2>&1
```

### Opção C — Supabase pg_cron + API pública

Se a API estiver na internet (ngrok, VPS):

1. Defina `SINAL_CRON_SECRET` no `.env` da API
2. No SQL Editor do Supabase (habilite `pg_net`):

```sql
select cron.schedule(
  'sinal-telegram-daily-digest',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://SEU-DOMINIO/api/cron/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'SEU_SINAL_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

`0 11 * * *` = 11:00 UTC ≈ 08:00 BRT.

---

## Alertas imediatos (após cada refresh)

Além do resumo diário, o Sinal já envia JSON para webhook após refresh:

```bash
SINAL_ALERT_WEBHOOK_URL=https://...
```

Para encaminhar ao Telegram em tempo real, use **n8n** ou **Make**:
webhook → Telegram Send Message.

Ou configure só o resumo diário acima.

---

## Solução de problemas

| Problema | Solução |
| --- | --- |
| `TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente` | Preencha no `.env` e `source scripts/env.sh` |
| `já enviado hoje` | Normal; use `--force` para testar |
| `Telegram API 403` | Você enviou `/start` ao bot? |
| `Telegram API 400 chat not found` | `TELEGRAM_CHAT_ID` errado |
| `inline keyboard button URL ... localhost ... invalid` | Normal em dev; use `SINAL_PUBLIC_URL` com domínio público (ngrok) para botões de link |
| Menu não responde | Rode `telegram-poll` (local) ou `telegram-setup` (webhook) |
| Nada às 8h com API local | Mac/API desligados — use cron (opção B) |
| `relation daily_digest_log does not exist` | Rode `migrate` |
