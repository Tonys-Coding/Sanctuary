#!/usr/bin/env bash
# Runs once, when the codespace is created: installs dependencies,
# writes backend/.env and loads the demo church.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Instalando dependencias del servidor…"
(cd backend && npm ci --no-audit --no-fund)
echo "▸ Instalando dependencias de la aplicación…"
(cd frontend && npm ci --no-audit --no-fund)

if [ ! -f backend/.env ]; then
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  # Keys left empty here are filled from Codespaces secrets, which take precedence over .env.
  sed -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://sanctuary:sanctuary@localhost:5432/sanctuary#" \
      -e "s#^JWT_SECRET=.*#JWT_SECRET=${secret}#" \
      -e "s#^APP_URL=.*#APP_URL=#" \
      backend/.env.example > backend/.env
  echo "▸ Se creó backend/.env"
fi

echo "▸ Esperando a la base de datos…"
for i in $(seq 1 30); do
  if (cd backend && node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgresql://sanctuary:sanctuary@localhost:5432/sanctuary'});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))"); then
    break
  fi
  [ "$i" = 30 ] && { echo "✖ La base de datos no respondió."; exit 1; }
  sleep 2
done

echo "▸ Cargando la iglesia de demostración…"
(cd backend && npm run seed)
echo "✔ Listo. Sanctuary se abrirá en el puerto 5173."
