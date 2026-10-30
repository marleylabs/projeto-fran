// Configuração do Prisma CLI (generate, migrate, validate): localização do schema e das migrations e a URL do banco.
// DATABASE_URL vem do .env (dotenv) ou do ambiente; é obrigatória mesmo para comandos que não conectam
// (por isso o Dockerfile define um valor fictício antes do `prisma generate`).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
