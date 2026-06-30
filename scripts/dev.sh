#!/usr/bin/env bash
# Sobe API (8787) + frontend (5173) no mesmo terminal. Ctrl+C encerra os dois.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"

API_PORT=8787
WEB_PORT=5173

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "→ Liberando porta $port (processos antigos)..."
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

cleanup() {
  echo
  echo "Encerrando servidores..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

free_port "$API_PORT"
free_port "$WEB_PORT"

echo "→ Iniciando API (porta $API_PORT)..."
export SINAL_PROJECT_ROOT="$ROOT"
PORT=$API_PORT SINAL_PROJECT_ROOT="$ROOT" pnpm dev:api &
API_PID=$!

echo "→ Aguardando API..."
ready=0
for _ in $(seq 1 120); do
  if curl -sf "http://localhost:${API_PORT}/api/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "Erro: processo da API encerrou antes de ficar pronto." >&2
    exit 1
  fi
  sleep 0.5
done

if [ "$ready" -ne 1 ]; then
  echo "Erro: API não respondeu em http://localhost:${API_PORT}" >&2
  exit 1
fi

echo "→ Iniciando frontend (porta $WEB_PORT)..."
echo "→ Abra http://localhost:${WEB_PORT}"
PORT=$WEB_PORT BASE_PATH=/ API_PROXY_TARGET="http://localhost:${API_PORT}" pnpm dev:web &
WEB_PID=$!

wait "$API_PID" "$WEB_PID"
