# Plataforma de Gestão Administrativa

Aplicação corporativa para o setor Administrativo gerenciar cadastros, contas a pagar e rotinas de apoio, preservando o módulo contábil de importação e conferência da folha.

## Stack

- Next.js 16, React 19 e TypeScript
- PostgreSQL 16 e Prisma 7
- Docker Compose
- PDF.js, ExcelJS e TanStack Table

## Ambiente local com Docker

1. Copie `.env.example` para `.env`.
2. Defina uma senha forte em `POSTGRES_PASSWORD`.
3. Em desenvolvimento HTTP local, mantenha `SECURE_COOKIES=false`.
4. Construa e inicie os serviços:

```bash
docker compose up -d --build
```

O Compose inicia:

- aplicação em `http://localhost:3000`;
- PostgreSQL somente em `127.0.0.1:5433`;
- volume persistente `extrato-mensal_extrato_mensal_db_data`.

O container web executa `prisma migrate deploy` antes de iniciar o Next.js.

## Primeiro usuário

Em um banco novo, crie a primeira conta explicitamente:

```bash
docker exec -it extrato-mensal-web npx tsx scripts/seed-admin.ts usuario@empresa.com "senha-forte" "Nome"
```

Não existe cadastro público nem seed automático de credenciais.

## Desenvolvimento sem container web

Com um PostgreSQL acessível e `DATABASE_URL` definida:

```bash
npm ci
npx prisma generate
npm run dev
```

## Verificações

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Ou execute a verificação completa:

```bash
npm run check
```

Os scripts antigos em `scripts/` são diagnósticos manuais. Alguns dependem do arquivo externo `../FOLHAD_2.PDF`. A suíte em `tests/` não depende de documentos privados.

## Banco e migrations

O schema atual possui `Upload`, `User` e `Session`. As migrations ficam em `prisma/migrations`.

Verifique o estado sem modificar o banco:

```bash
docker exec extrato-mensal-web npx prisma migrate status
```

Não use `prisma migrate dev` no container de produção e não apague o volume para corrigir divergências.

## Backup e recuperação

O Git não contém dados do PostgreSQL, `.env`, PDFs privados ou o conteúdo de volumes Docker. Antes de trocar de computador ou recriar o ambiente, faça backup do banco:

```bash
docker exec extrato-mensal-db pg_dump -U extrato -d extrato_mensal -Fc -f /tmp/extrato-mensal.dump
docker cp extrato-mensal-db:/tmp/extrato-mensal.dump ./extrato-mensal.dump
```

Guarde o dump em local seguro; ele pode conter dados pessoais e financeiros. A restauração deve ser testada primeiro em banco separado.

## Arquitetura atual

```text
Browser
  → páginas e componentes React
  → Route Handlers /api
  → parser de PDFs e regras de folha
  → Prisma
  → PostgreSQL
```

O módulo atual será incorporado gradualmente em `Contabilidade > Importações de folha`. Nenhuma tabela existente será removida ou renomeada sem migration compatível, backup e teste de regressão.

Durante a transição, a funcionalidade permanece disponível em `/` e possui a rota canônica `/contabilidade/folha`. O registro de módulos do shell fica em `src/modules/core/navigation/moduleRegistry.ts`.
