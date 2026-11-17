#!/usr/bin/env bash
# Makes sure backend/.env works inside the codespace and the database is ready.
# Safe to run any number of times; called by setup.sh and start.sh.
set -euo pipefail
cd "$(dirname "$0")/../backend"

CODESPACE_DB="postgresql://sanctuary:sanctuary@localhost:5432/sanctuary"

if [ ! -f .env ]; then
  cp .env.example .env
  touch /tmp/sanctuary-env-changed
  echo "▸ Se creó backend/.env"
fi

# Replace placeholder values copied from .env.example. Real values someone typed in are left alone.
set_var() { # name, value
  if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi
  touch /tmp/sanctuary-env-changed   # tells start.sh to restart a running API
}
current() { grep -m1 "^$1=" .env | cut -d= -f2- || true; }

case "$(current DATABASE_URL)" in
  ""|*usuario:*) set_var DATABASE_URL "$CODESPACE_DB"; echo "▸ DATABASE_URL apunta ahora a la base de datos del codespace" ;;
esac
case "$(current JWT_SECRET)" in
  ""|cambia-esta-frase*) set_var JWT_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"; echo "▸ Se generó una clave de sesión nueva" ;;
esac
# In a codespace the app's address is worked out automatically; a localhost value would break e-mail links.
if [ "${CODESPACES:-}" = "true" ] && [ "$(current APP_URL)" = "http://localhost:5173" ]; then
  set_var APP_URL ""
fi

echo "▸ Esperando a la base de datos…"
check='require("dotenv").config({quiet:true});const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL});
c.connect().then(()=>c.query("SELECT to_regclass($$sanctuary.organizations$$) IS NOT NULL AS ready")).then(async r=>{
  const n=r.rows[0].ready?(await c.query("SELECT count(*)::int AS n FROM sanctuary.organizations")).rows[0].n:0;console.log(n);await c.end()})
.catch(e=>{console.error(e.message);process.exit(1)})'
for i in $(seq 1 30); do
  if churches=$(node -e "$check" 2>/tmp/sanctuary-db-check.log); then break; fi
  if grep -qiE "authentication|does not exist" /tmp/sanctuary-db-check.log; then
    echo "✖ La base de datos rechazó la conexión: $(cat /tmp/sanctuary-db-check.log)"
    echo "  Revisa DATABASE_URL en backend/.env (en un codespace debe ser $CODESPACE_DB)"
    exit 1
  fi
  [ "$i" = 30 ] && { echo "✖ La base de datos no respondió: $(cat /tmp/sanctuary-db-check.log)"; exit 1; }
  sleep 2
done

if [ "$churches" = "0" ]; then
  echo "▸ Cargando la iglesia de demostración…"
  npm run --silent seed
fi
