#!/usr/bin/env bash
# Carrega PATH (pnpm/node) + .env. Uso: cd whats_page && source scripts/env.sh

if [ -n "${ZSH_VERSION:-}" ]; then
  _ENV_SH="${(%):-%x}"
else
  _ENV_SH="${BASH_SOURCE[0]:-$0}"
fi

ROOT="$(cd "$(dirname "$_ENV_SH")/.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:/opt/homebrew/bin:$PATH"
cd "$ROOT" || exit 1

if [ ! -f .env ]; then
  echo "Erro: .env não encontrado em $ROOT" >&2
  return 1 2>/dev/null || exit 1
fi

set -a
# shellcheck source=/dev/null
source .env
set +a
if [ "${SINAL_ENV_QUIET:-}" != "1" ]; then
  echo "OK — pasta: $ROOT"
  echo "OK — node: $(command -v node) | pnpm: $(command -v pnpm)"
fi
