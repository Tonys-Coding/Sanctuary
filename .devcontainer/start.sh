#!/usr/bin/env bash
# Runs every time the codespace starts: launches the API (port 5001) and the app (port 5173)
# in the background. Logs: /tmp/sanctuary-api.log and /tmp/sanctuary-web.log
cd "$(dirname "$0")/.."

start() { # name, folder, log, port
  if (exec 3<>"/dev/tcp/127.0.0.1/$4") 2>/dev/null; then
    echo "▸ $1: ya estaba en marcha (puerto $4)"
    return
  fi
  # setsid keeps the server alive after this script ends.
  (cd "$2" && setsid nohup npm run dev > "$3" 2>&1 < /dev/null &)
  echo "▸ $1: en marcha en el puerto $4 · registro: $3"
}

start "API" backend /tmp/sanctuary-api.log 5001
start "Aplicación" frontend /tmp/sanctuary-web.log 5173
echo "  Entra con demo@sanctuary.app / sanctuary123"
