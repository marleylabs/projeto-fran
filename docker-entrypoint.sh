#!/bin/sh
# Entrypoint dos containers (web e document-worker), executado como root:
# 1) garante a pasta do armazenamento privado (volume) com dono nextjs, já que o volume nasce como root;
# 2) aplica as migrations pendentes (prisma migrate deploy) — toda subida de container migra o banco;
# 3) executa o comando recebido (ex.: o worker) ou, sem argumentos, o servidor Next.js.
# Os processos rodam como o usuário sem privilégios nextjs via su-exec; `exec` repassa sinais (SIGTERM).
set -e

mkdir -p "${PRIVATE_STORAGE_ROOT:-/app/storage}"
chown -R nextjs:nodejs "${PRIVATE_STORAGE_ROOT:-/app/storage}"

echo "Aplicando migrations do banco de dados..."
su-exec nextjs:nodejs npx prisma migrate deploy

if [ "$#" -gt 0 ]; then
  echo "Iniciando processo configurado..."
  exec su-exec nextjs:nodejs "$@"
fi

echo "Iniciando servidor..."
exec su-exec nextjs:nodejs npm run start
