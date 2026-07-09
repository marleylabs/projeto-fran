# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base
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
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
