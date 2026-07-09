#!/bin/sh
set -e

echo "Aplicando migrations do banco de dados..."
npx prisma migrate deploy

echo "Iniciando servidor..."
exec npm run start
