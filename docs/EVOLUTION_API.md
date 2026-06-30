# WhatsApp via Evolution API (Opção B)

O Sinal **não conecta** ao WhatsApp sozinho. A tela **Conectores → WhatsApp** está como *Em breve*.

Este guia usa **Evolution API** (Baileys) como ponte:

```
WhatsApp (celular)  ←QR→  Evolution API  →  webhook  →  Supabase (whatsapp_messages)  →  Sinal
```

---

## Visão geral (4 peças)

| # | O quê | Onde roda |
|---|--------|-----------|
| 1 | **Evolution API** | Docker na sua máquina ou VPS (porta 8085) |
| 2 | **Webhook Sinal** | Script `evolution-webhook` (porta 9090) |
| 3 | **Túnel público** | ngrok / Cloudflare Tunnel (só se Evolution estiver local) |
| 4 | **Sinal** | api-server + sinal-web (já configurados) |

---

## Passo 1 — Variáveis no `.env`

Adicione ao seu `.env` (não commite):

```bash
# Evolution API
EVOLUTION_API_URL=http://localhost:8085
EVOLUTION_API_KEY=sua-chave-secreta-aqui
EVOLUTION_INSTANCE=sinal

# Webhook (este projeto)
EVOLUTION_WEBHOOK_PORT=9090
EVOLUTION_WEBHOOK_SECRET=openssl rand -hex 16   # gere uma string aleatória

# URL pública do webhook (Evolution precisa alcançar da internet)
# Local: use ngrok — veja passo 4
EVOLUTION_WEBHOOK_URL=https://SEU-TUNEL.ngrok-free.app/webhooks/evolution
```

`WHATSAPP_OWNER` no `.env` deve ser **seu número** (ex. `5531920052288`), igual ao WhatsApp que conectar no QR.

---

## Passo 2 — Subir Evolution API (Docker)

Na raiz do projeto:

```bash
export EVOLUTION_API_KEY=sua-chave-secreta-aqui
docker compose -f docker-compose.evolution.yml up -d
```

Teste: http://localhost:8085 — deve responder (manager ou JSON).

Documentação Evolution: https://doc.evolution-api.com

---

## Passo 3 — Subir o webhook do Sinal

Terminal dedicado:

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:/opt/homebrew/bin:$PATH"
cd whats_page
set -a && source .env && set +a
pnpm --filter @workspace/scripts run evolution-webhook
```

Deve aparecer:

```
Evolution webhook listening on http://0.0.0.0:9090/webhooks/evolution
```

Teste local: `curl http://localhost:9090/healthz` → `ok`

---

## Passo 4 — Expor webhook (desenvolvimento local)

Evolution (Docker) precisa **chamar** seu webhook. Em localhost, use **ngrok**:

```bash
ngrok http 9090
```

Copie a URL HTTPS (ex. `https://abc123.ngrok-free.app`) e no `.env`:

```bash
EVOLUTION_WEBHOOK_URL=https://abc123.ngrok-free.app/webhooks/evolution
```

Em **VPS/Hostinger**, use o domínio real: `https://seu-dominio.com/webhooks/evolution` (reverse proxy para porta 9090).

---

## Passo 5 — Criar instância + QR + registrar webhook

```bash
set -a && source .env && set +a
pnpm --filter @workspace/scripts run evolution-setup
```

1. Abra no browser: `http://localhost:8085/instance/connect/sinal`  
   (header `apikey: SUA_EVOLUTION_API_KEY` se pedir)
2. Escaneie o **QR Code** com WhatsApp → Aparelhos conectados → Conectar
3. O script registra o webhook na Evolution

Envie uma mensagem de teste para o número conectado.

---

## Passo 6 — Verificar Supabase

```bash
pnpm --filter @workspace/scripts run db-stats
```

Deve aparecer contagem em `messages by chat_type`.

Ou no SQL Editor:

```sql
select count(*), max(message_created_at) from whatsapp_messages;
```

---

## Passo 7 — Enriquecer com IA (Sinal)

```bash
pnpm --filter @workspace/scripts run classify-sample
pnpm --filter @workspace/scripts run backfill-contacts
pnpm --filter @workspace/scripts run build-topics
pnpm --filter @workspace/scripts run build-mentions
# ou tudo de uma vez:
pnpm --filter @workspace/scripts run refresh-all
```

Recarregue http://localhost:5173

---

## Diagrama

```
┌─────────────┐     QR      ┌────────────────┐   POST /webhooks/evolution   ┌──────────────┐
│  WhatsApp   │ ◄────────── │ Evolution API  │ ───────────────────────────► │ evolution-   │
│  (celular)  │             │  :8085         │                              │ webhook :9090│
└─────────────┘             └────────────────┘                              └──────┬───────┘
                                                                                    │ INSERT
                                                                                    ▼
                                                                            ┌──────────────┐
                                                                            │  Supabase    │
                                                                            │ whatsapp_    │
                                                                            │ messages     │
                                                                            └──────┬───────┘
                                                                                   │ read
                                                                                   ▼
                                                                            ┌──────────────┐
                                                                            │  Sinal app   │
                                                                            │  :5173       │
                                                                            └──────────────┘
```

---

## Produção (VPS / Hostinger)

1. Evolution API + webhook como serviços systemd ou Docker
2. Nginx/Caddy: `https://api.seudominio.com` → Evolution `:8085`
3. Nginx: `https://hooks.seudominio.com/webhooks/evolution` → webhook `:9090`
4. `EVOLUTION_WEBHOOK_URL` = URL pública do hook
5. Mantenha `EVOLUTION_WEBHOOK_SECRET` e valide no header

---

## Limitações

- **Histórico antigo** não entra automaticamente — só mensagens **depois** do webhook ativo. Para backfill, use export manual ou API Evolution de fetch (futuro).
- **Mídia** (fotos/áudio) grava placeholder; URL de mídia pode ser estendida depois.
- Evolution API **não é oficial** Meta/WhatsApp — use por sua conta e risco.
- A UI **Conectores → WhatsApp** no Sinal continua *Em breve*; este conector roda **fora** do app, via scripts.

---

## Comandos rápidos

```bash
# Evolution
docker compose -f docker-compose.evolution.yml up -d

# Webhook
pnpm --filter @workspace/scripts run evolution-webhook

# Setup QR + webhook
pnpm --filter @workspace/scripts run evolution-setup

# Stats
pnpm --filter @workspace/scripts run db-stats
```
