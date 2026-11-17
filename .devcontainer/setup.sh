#!/usr/bin/env bash
# Runs once, when the codespace is created: installs dependencies,
# prepares backend/.env and loads the demo church.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Instalando dependencias del servidor…"
(cd backend && npm ci --no-audit --no-fund)
echo "▸ Instalando dependencias de la aplicación…"
(cd frontend && npm ci --no-audit --no-fund)

bash .devcontainer/prepare-env.sh
echo "✔ Listo. Sanctuary se abrirá en el puerto 5173."
