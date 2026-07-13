#!/usr/bin/env bash
# Sobe ngrok + API (8787) + site (5173) com passo a passo no terminal.
# Uso: bash scripts/start-all.sh
# Mac: dê duplo clique em "Iniciar Sinal.command" na raiz do projeto.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT=8787
WEB_PORT=5173
NGROK_PID=""

# ── UI ──────────────────────────────────────────────────────────────────────
banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  SINAL — ambiente local (WhatsApp + dashboard)           ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
}

step() {
  echo ""
  echo "[$1/$TOTAL_STEPS] $2"
  echo "────────────────────────────────────────────────────────────"
}

ok()   { echo "  ✓ $*"; }
info() { echo "  → $*"; }
warn() { echo "  ⚠ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

TOTAL_STEPS=6

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    info "Liberando porta $port..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.5
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

update_env_webhook_url() {
  local url=$1
  local file="$ROOT/.env"
  if grep -q '^EVOLUTION_WEBHOOK_URL=' "$file"; then
    sed -i '' "s|^EVOLUTION_WEBHOOK_URL=.*|EVOLUTION_WEBHOOK_URL=${url}|" "$file"
  else
    echo "EVOLUTION_WEBHOOK_URL=${url}" >> "$file"
  fi
}

update_env_public_url() {
  local url=$1
  local file="$ROOT/.env"
  if grep -q '^SINAL_PUBLIC_URL=' "$file"; then
    sed -i '' "s|^SINAL_PUBLIC_URL=.*|SINAL_PUBLIC_URL=${url}|" "$file"
  else
    echo "SINAL_PUBLIC_URL=${url}" >> "$file"
  fi
}

wait_ngrok_url() {
  local url=""
  for _ in $(seq 1 60); do
    url=$(curl -sf "http://127.0.0.1:4040/api/tunnels" 2>/dev/null \
      | node -e "
        let d=''; process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          try {
            const j=JSON.parse(d);
            const t=(j.tunnels||[]).find(x=>x.public_url&&x.public_url.startsWith('https'));
            process.stdout.write(t?.public_url||'');
          } catch { process.stdout.write(''); }
        });
      " 2>/dev/null || true)
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 0.5
  done
  return 1
}

register_evolution_webhook() {
  local inst="${EVOLUTION_INSTANCE:-sinal}"
  local hook="${EVOLUTION_WEBHOOK_URL:-}"
  local key="${EVOLUTION_API_KEY:-}"
  local base="${EVOLUTION_API_URL:-}"
  local secret="${EVOLUTION_WEBHOOK_SECRET:-}"
  if [ -z "$hook" ] || [ -z "$key" ] || [ -z "$base" ]; then
    warn "Evolution não configurada — pule o registro do webhook."
    return 0
  fi
  local headers_json="null"
  if [ -n "$secret" ]; then
    headers_json="{\"x-webhook-secret\":\"${secret}\"}"
  fi
  curl -sf -X POST \
    -H "apikey: ${key}" \
    -H "Content-Type: application/json" \
    "${base%/}/webhook/set/${inst}" \
    -d "{\"webhook\":{\"enabled\":true,\"url\":\"${hook}\",\"webhookByEvents\":false,\"events\":[\"MESSAGES_UPSERT\"],\"headers\":${headers_json}}}" \
    >/dev/null \
    && ok "Webhook registrado na instância \"${inst}\"" \
    || warn "Não foi possível registrar webhook (conecte em Conectores se precisar)."
}

cleanup() {
  echo ""
  echo "Encerrando Sinal, ngrok e servidores..."
  kill $(jobs -p) 2>/dev/null || true
  if [ -n "$NGROK_PID" ]; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
  pkill -f "ngrok http ${API_PORT}" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Até logo."
}
trap cleanup EXIT INT TERM

# ── Início ──────────────────────────────────────────────────────────────────
banner

step 1 "Preparando ambiente"
SINAL_ENV_QUIET=1
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
command -v node >/dev/null 2>&1 || fail "Node não encontrado. Instale via nvm."
command -v pnpm >/dev/null 2>&1 || fail "pnpm não encontrado."
ok "Pasta: whats_page"
ok "Node e pnpm OK"
free_port "$API_PORT"
free_port "$WEB_PORT"

step 2 "Abrindo túnel público (ngrok) para o WhatsApp enviar mensagens"
NGROK_BIN="$(command -v ngrok 2>/dev/null || echo /opt/homebrew/bin/ngrok)"
if [ ! -x "$NGROK_BIN" ]; then
  fail "ngrok não instalado. Rode: brew install ngrok"
fi
if ! "$NGROK_BIN" config check >/dev/null 2>&1; then
  fail "ngrok sem authtoken. Rode: ngrok config add-authtoken SEU_TOKEN"
fi
pkill -f "ngrok http ${API_PORT}" 2>/dev/null || true
sleep 0.3
"$NGROK_BIN" http "$API_PORT" --log=stdout >/tmp/sinal-ngrok.log 2>&1 &
NGROK_PID=$!
PUBLIC_URL=""
PUBLIC_URL="$(wait_ngrok_url)" || fail "ngrok não subiu. Veja /tmp/sinal-ngrok.log"
WEBHOOK_URL="${PUBLIC_URL}/api/evolution/webhook"
update_env_webhook_url "$WEBHOOK_URL"
update_env_public_url "$PUBLIC_URL"
set -a
# shellcheck source=/dev/null
source "$ROOT/.env"
set +a
ok "Túnel: ${PUBLIC_URL}"
ok "Webhook salvo no .env"
if [ -z "${GOOGLE_CLIENT_ID:-}" ] || [ -z "${GOOGLE_CLIENT_SECRET:-}" ]; then
  warn "Google OAuth não configurado — defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env (Conectores → Como configurar)."
fi

step 3 "Subindo API (porta ${API_PORT})"
export SINAL_PROJECT_ROOT="$ROOT"
PORT=$API_PORT SINAL_PROJECT_ROOT="$ROOT" pnpm dev:api &
API_PID=$!
ready=0
for _ in $(seq 1 120); do
  if curl -sf "http://localhost:${API_PORT}/api/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  kill -0 "$API_PID" 2>/dev/null || fail "API encerrou antes de ficar pronta."
  sleep 0.5
done
[ "$ready" -eq 1 ] || fail "API não respondeu em :${API_PORT}"
ok "API online"

step 4 "Subindo site (porta ${WEB_PORT})"
info "Abra no navegador: http://localhost:${WEB_PORT}"
PORT=$WEB_PORT BASE_PATH=/ API_PROXY_TARGET="http://localhost:${API_PORT}" pnpm dev:web &
WEB_PID=$!
sleep 2
ok "Site online"

step 5 "Conectando webhook na Evolution API"
register_evolution_webhook

step 6 "Telegram (menu local + alertas WA)"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  if ! grep -q '^TELEGRAM_WA_OFFLINE_ALERTS=' "$ROOT/.env" 2>/dev/null; then
    echo "TELEGRAM_WA_OFFLINE_ALERTS=1" >> "$ROOT/.env"
    ok "TELEGRAM_WA_OFFLINE_ALERTS=1 adicionado ao .env"
  fi
  PORT=$API_PORT SINAL_PROJECT_ROOT="$ROOT" pnpm --filter @workspace/scripts run telegram-poll >/tmp/sinal-telegram-poll.log 2>&1 &
  TELEGRAM_PID=$!
  sleep 1
  if kill -0 "$TELEGRAM_PID" 2>/dev/null; then
    ok "telegram-poll rodando (menu + comandos no Telegram)"
    info "Log: /tmp/sinal-telegram-poll.log"
  else
    warn "telegram-poll não iniciou — veja /tmp/sinal-telegram-poll.log"
  fi
else
  warn "Telegram não configurado — defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env"
fi

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  PRONTO — jornada completa                              │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │  ONDE ABRIR                                             │"
echo "  │  Dashboard Sinal:  http://localhost:${WEB_PORT}              │"
echo "  │  Login:             ADMIN_EMAIL / ADMIN_PASSWORD (.env) │"
echo "  │  Painel ngrok:       http://127.0.0.1:4040              │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  WHATSAPP → SINAL (fluxo)                               │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │  1. Celular conectado na Evolution (Conectores)         │"
echo "  │  2. Nova mensagem chega → ngrok → API → Supabase        │"
echo "  │  3. No terminal (outra aba), após mensagens:             │"
echo "  │     source scripts/env.sh                               │"
echo "  │     pnpm --filter @workspace/scripts run refresh-all    │"
echo "  │  4. Recarregue o dashboard                              │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
warn "Mantenha ESTA janela aberta. Ctrl+C encerra tudo (site + API + ngrok + telegram-poll)."
echo ""

wait "$API_PID" "$WEB_PID"
