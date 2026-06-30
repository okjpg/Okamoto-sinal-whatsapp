#!/bin/bash
# Duplo clique no Finder abre o Terminal e inicia o Sinal.
cd "$(dirname "$0")" || exit 1
exec bash scripts/start-all.sh
