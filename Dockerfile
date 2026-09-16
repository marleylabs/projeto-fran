# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# --- Dependências ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# `prisma generate` só lê a estrutura do schema (não conecta no banco), mas o
# prisma.config.ts exige DATABASE_URL definida para carregar — um valor fictício
# é suficiente aqui.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# --- Runtime ---
# Usamos node_modules completo (em vez da saída "standalone") de propósito: o
# `prisma migrate deploy` do entrypoint precisa do CLI do Prisma disponível, e
# tentar recortar manualmente só os arquivos necessários da saída standalone se
# mostrou frágil (já aconteceu com o worker do pdfjs-dist antes).
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache su-exec

COPY --chown=nextjs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/.next ./.next
COPY --chown=nextjs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nextjs:nodejs --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=nextjs:nodejs --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=nextjs:nodejs --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=nextjs:nodejs --from=builder /app/package.json ./package.json
# src/ e scripts/ (código-fonte TS, não o build compilado) ficam disponíveis para
# rodar utilitários como o seed do primeiro usuário via `docker exec ... npx tsx scripts/...`
# em qualquer ambiente novo, sem depender de rodar isso fora do container.
COPY --chown=nextjs:nodejs --from=builder /app/src ./src
COPY --chown=nextjs:nodejs --from=builder /app/scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
