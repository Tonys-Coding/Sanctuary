#!/usr/bin/env bash
# Starts Sanctuary inside the codespace: the API (port 5001) and the app (port 5173).
# Runs automatically when the codespace starts; safe to run again by hand at any time:
#   bash .devcontainer/start.sh
# Logs: /tmp/sanctuary-api.log and /tmp/sanctuary-web.log
cd "$(dirname "$0")/.."

# If the first-time setup never finished, do it now; otherwise just check .env and the database.
if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
  echo "▸ La instalación inicial no se completó; ejecutándola ahora…"
  bash .devcontainer/setup.sh || { echo "✖ La instalación falló. Revisa los mensajes de arriba."; exit 1; }
else
  bash .devcontainer/prepare-env.sh || exit 1
fi

answers() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1$2"; }

launch() { # name, folder, log, port, path to probe, stale-process pattern, dev args
  local name=$1 dir=$2 log=$3 port=$4 probe=$5 stale=$6; shift 6
  if answers "$port" "$probe"; then
    echo "▸ $name: ya estaba en marcha (puerto $port)"
    return
  fi
  # A server that runs but can't be reached (or crashed half-way) is stopped before starting again.
  pkill -f "$stale" 2>/dev/null && sleep 1
  # setsid -f detaches the server completely, so it keeps running after this script ends
  # and nothing holds this script's output open.
  (cd "$dir" && setsid -f npm run dev -- "$@" > "$log" 2>&1 < /dev/null)
  for _ in $(seq 1 45); do
    sleep 1
    if answers "$port" "$probe"; then echo "✔ $name: en marcha en el puerto $port"; return; fi
  done
  echo "✖ $name no arrancó. Últimas líneas de $log:"
  tail -n 25 "$log" | sed 's/^/    /'
  FAILED=1
}

FAILED=0
launch "API" backend /tmp/sanctuary-api.log 5001 /api/health "$PWD/backend/node_modules/"
# --host 0.0.0.0 so Codespaces' port forwarding can reach it; --strictPort so it never drifts to 5174.
launch "Aplicación" frontend /tmp/sanctuary-web.log 5173 / "$PWD/frontend/node_modules/" --host 0.0.0.0 --port 5173 --strictPort

if [ "$FAILED" = 0 ]; then
  echo ""
  echo "  Abre la pestaña «Ports» (Puertos), busca el puerto 5173 y haz clic en el globo 🌐."
  echo "  Entra con demo@sanctuary.app / sanctuary123"
fi
exit "$FAILED"
