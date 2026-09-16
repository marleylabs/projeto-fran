#!/bin/sh
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
