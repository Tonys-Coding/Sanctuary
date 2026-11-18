#!/usr/bin/env bash
# Starts Sanctuary inside the codespace: the API (port 5001) and the app (port 5173).
# Runs automatically when the codespace starts; safe to run again by hand at any time:
#   bash .devcontainer/start.sh
# Logs: /tmp/sanctuary-api.log and /tmp/sanctuary-web.log
#   bash .devcontainer/start.sh --reiniciar   → stops everything, clears the app's cache and starts fresh
cd "$(dirname "$0")/.."
ROOT=$PWD
rm -f /tmp/sanctuary-env-changed

if [ "${1:-}" = "--reiniciar" ] || [ "${1:-}" = "--restart" ]; then
  echo "▸ Deteniendo la API y la aplicación…"
  pkill -f "$ROOT/backend/node_modules/" 2>/dev/null
  pkill -f "$ROOT/frontend/node_modules/.bin/vite" 2>/dev/null
  rm -rf frontend/node_modules/.vite
  sleep 1
  RESTART=1
fi

# If the first-time setup never finished, do it now; otherwise just check .env and the database.
if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
  echo "▸ La instalación inicial no se completó; ejecutándola ahora…"
  bash .devcontainer/setup.sh || { echo "✖ La instalación falló. Revisa los mensajes de arriba."; exit 1; }
else
  # After a "git pull" that added packages, install them before starting.
  for dir in backend frontend; do
    if [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
      echo "▸ Instalando paquetes nuevos en $dir…"
      (cd "$dir" && npm install --no-audit --no-fund >/dev/null) || { echo "✖ No se pudieron instalar los paquetes de $dir."; exit 1; }
      [ "$dir" = backend ] && pkill -f "$PWD/backend/node_modules/" 2>/dev/null
      [ "$dir" = frontend ] && pkill -f "$PWD/frontend/node_modules/.bin/vite" 2>/dev/null
    fi
  done
  bash .devcontainer/prepare-env.sh || exit 1
fi

# "Healthy" means the right program answers, not just that something is listening.
api_ok() { curl -sf --max-time 3 "http://127.0.0.1:5001/api/health" | grep -q '"ok"'; }
app_ok() { curl -sf --max-time 3 "http://127.0.0.1:5173/" | grep -q 'Sanctuary'; }

API_PROCS="$ROOT/backend/node_modules/"
APP_PROCS="$ROOT/frontend/node_modules/.bin/vite"

# A running API keeps the settings it started with, so restart it when .env was just repaired.
if [ -f /tmp/sanctuary-env-changed ]; then
  pkill -f "$API_PROCS" 2>/dev/null && { echo "▸ Reiniciando la API con la configuración nueva…"; sleep 1; }
fi
# Extra copies of the app started by hand (they end up on 5174, 5175…) only cause confusion.
if pgrep -f "$APP_PROCS" >/dev/null && pgrep -af "$APP_PROCS" | grep -vq -- '--strictPort'; then
  pgrep -af "$APP_PROCS" | grep -v -- '--strictPort' | awk '{print $1}' | xargs -r kill 2>/dev/null
  echo "▸ Se cerraron copias extra de la aplicación (puertos 5174 y siguientes)"
fi

launch() { # name, folder, log, port, health check, process pattern, dev args
  local name=$1 dir=$2 log=$3 port=$4 healthy=$5 procs=$6; shift 6
  if $healthy; then
    echo "✔ $name: en marcha (puerto $port)"
    return
  fi
  # Whatever is there is stopped first: a crashed, stuck or outdated server.
  pkill -f "$procs" 2>/dev/null && sleep 1
  # setsid -f detaches the server completely, so it keeps running after this script ends
  # and nothing holds this script's output open.
  (cd "$dir" && setsid -f npm run dev -- "$@" > "$log" 2>&1 < /dev/null)
  for _ in $(seq 1 45); do
    sleep 1
    if $healthy; then echo "✔ $name: en marcha (puerto $port)"; return; fi
  done
  echo "✖ $name no arrancó. Últimas líneas de $log:"
  tail -n 25 "$log" | sed 's/^/    /'
  FAILED=1
}

FAILED=0
launch "API" backend /tmp/sanctuary-api.log 5001 api_ok "$API_PROCS"
# --host 0.0.0.0 so Codespaces' port forwarding can reach it; --strictPort so it never drifts to 5174.
launch "Aplicación" frontend /tmp/sanctuary-web.log 5173 app_ok "$APP_PROCS" --host 0.0.0.0 --port 5173 --strictPort

if [ -n "${RESTART:-}" ] || [ "$FAILED" != 0 ]; then
  echo ""
  echo "── Diagnóstico (copia esto si algo sigue fallando) ──"
  echo "  versión:     $(git log --oneline -1 2>/dev/null)"
  echo "  node:        $(node -v)"
  echo "  API /health: $(curl -s --max-time 3 http://127.0.0.1:5001/api/health || echo 'sin respuesta')"
  echo "  app :5173:   HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:5173/)"
  echo "  módulo main: HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:5173/src/main.tsx)"
  echo "  últimas líneas de la API:"; tail -n 4 /tmp/sanctuary-api.log 2>/dev/null | sed 's/^/    /'
  echo "  últimas líneas de la aplicación:"; tail -n 4 /tmp/sanctuary-web.log 2>/dev/null | sed 's/^/    /'
fi

if [ "$FAILED" = 0 ]; then
  echo ""
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    echo "  Abre Sanctuary aquí (Ctrl/Cmd + clic):"
    echo "    https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo "  Si no abre: pestaña «Ports» → «Forward a Port» → escribe 5173 → Enter → globo 🌐."
  else
    echo "  Abre Sanctuary en http://localhost:5173"
  fi
  echo "  Entra con demo@sanctuary.app / sanctuary123"
fi
exit "$FAILED"
