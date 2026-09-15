# Fase 2 — Validação Técnica do Projeto

> Nenhuma correção foi aplicada nesta etapa. Este documento confirma, com evidência de execução real (install, lint, typecheck, build, prisma validate/generate, execução dos scripts de teste manuais) e leitura de código, o que a auditoria inicial (`AUDITORIA-COMPLETA-PROJETO.md`) havia levantado — corrigindo dois pontos que a auditoria errou.

---

## 1. Estado real do ambiente

| Item | Esperado pelo projeto | Encontrado neste ambiente | OK? |
|---|---|---|---|
| Node.js | `node:20-alpine` (Dockerfile); sem `engines` no `package.json` (não há trava de versão declarada) | v22.22.2 | ⚠️ Ambiente de auditoria roda Node 22, produção (Docker) roda Node 20 — build e testes abaixo rodaram em Node 22 e passaram, mas isso não substitui validar em Node 20 antes de produção. |
| Package manager | npm (`package-lock.json` presente, sem `yarn.lock`/`pnpm-lock.yaml`) | npm 10.9.7 | ✅ |
| Lockfile | `package-lock.json` | Presente e consistente (`npm ci` funcionou sem reescrevê-lo) | ✅ |
| Prisma | `prisma@^7.8.0`, `@prisma/client@^7.8.0`, `@prisma/adapter-pg@^7.8.0` | 7.8.0 instalado | ✅ |
| PostgreSQL | Requerido via `DATABASE_URL` (`docker-compose.yml` sobe Postgres 16) | **Não disponível neste ambiente** (sem Docker daemon, sem Postgres rodando) | ⚠️ Não foi possível validar contra banco real — ver seção 7. |
| Variável obrigatória | `DATABASE_URL` (schema Prisma sem valor default; `prisma.config.ts` exige) | Confirmada como obrigatória; sem ela, `prisma generate`/`validate`/build falham | ✅ Confirma achado da auditoria (falta de `.env.example`) |
| Variáveis opcionais | `SECURE_COOKIES`, `POSTGRES_USER/PASSWORD/DB`, `DB_PORT`, `WEB_PORT` | Confirmadas no código (`session.ts`, `docker-compose.yml`) | ✅ |

## 2. Resultado do install

```text
COMANDO: npm ci
RESULTADO: SUCESSO
```

- 575 pacotes instalados.
- `npm audit`: **19 vulnerabilidades** (1 crítica, 11 altas, 7 moderadas) — detalhes na seção 11 (Vulnerabilidades).

## 3. Resultado do lint

```text
COMANDO: npm run lint
RESULTADO: SUCESSO (0 erros, 2 avisos)
```

Os dois avisos são do React Compiler, não de bug funcional:

```text
COMANDO: npm run lint
RESULTADO: PASSOU (com avisos)
ERRO: "Compilation Skipped: Use of incompatible library" em EmployeeTable.tsx:71 e SinteticoTable.tsx:63
ARQUIVO: src/components/EmployeeTable.tsx, src/components/SinteticoTable.tsx
CAUSA PROVÁVEL: `useReactTable()` do @tanstack/react-table retorna funções não memoizáveis com segurança; o React Compiler (ativo por padrão no Next 16) detecta isso e desativa a otimização automática só nesses dois componentes.
SEVERIDADE: Baixa — não é um erro, é o compiler recuando com segurança. Sem impacto funcional.
CORREÇÃO RECOMENDADA: Nenhuma ação obrigatória. Se quiser eliminar o aviso, envolveria isolar o hook do tanstack table num componente memoizado manualmente — não vale o esforço agora.
```

## 4. Resultado do typecheck

Não existe script `typecheck` no `package.json`. Rodei `npx tsc --noEmit` diretamente.

```text
COMANDO: npx tsc --noEmit  (executado ANTES do build)
RESULTADO: FALHOU (2 erros)
ERRO: TS2304: Cannot find name 'RouteContext'
ARQUIVO: src/app/api/uploads/[id]/route.ts:7, src/app/api/users/[id]/route.ts:7
CAUSA PROVÁVEL: `RouteContext<"/api/...">` é um tipo *gerado pelo próprio Next.js* (rotas tipadas), escrito em `.next/types/routes.d.ts` durante `next build`/`next dev`. Rodar `tsc` isolado, sem nunca ter buildado o projeto, não encontra esse tipo.
SEVERIDADE: Falso positivo — não é um bug do projeto.
CORREÇÃO RECOMENDADA: Nenhuma. Confirmado abaixo que, após `next build` gerar `.next/types/`, `tsc --noEmit` roda limpo.
```

```text
COMANDO: npx tsc --noEmit  (executado DEPOIS do build)
RESULTADO: SUCESSO — 0 erros
```

**Conclusão**: o typecheck do projeto está limpo. O único jeito de validar isso corretamente é via `npm run build` (que roda o typecheck do Next internamente) ou `tsc` após um build prévio. Recomendo adicionar um script dedicado:

```json
"typecheck": "next build --no-lint > /dev/null && tsc --noEmit"
```

ou, mais simples, aceitar que `next build` já cobre isso e não ter script `typecheck` separado.

## 5. Resultado dos testes

```text
COMANDO: npm test
RESULTADO: NÃO EXISTE — nenhum script "test" no package.json, nenhum framework de teste (Jest/Vitest/etc.) instalado.
```

Existem 6 scripts manuais em `scripts/test-*.ts`, sem asserts automatizados. Rodei os que não dependem de um PDF externo não versionado:

```text
COMANDO: npx tsx scripts/test-sintetico.ts
RESULTADO: SUCESSO
```
Roda o parser do Relatório Sintético (`parseSinteticoRows`, `parseSinteticoCompanyInfo`, `computeSinteticoTotais`) contra *fixtures sintéticas construídas no próprio script* (linhas `PdfRow` montadas manualmente, não um PDF real). Saída: 2 colaboradores extraídos corretamente, valores monetários BR convertidos certo (`3117,21` → `3117.21`), totais batendo.

```text
COMANDO: npx tsx scripts/generate-test-sintetico-pdf.ts <arquivo> && npx tsx scripts/test-sintetico-e2e.ts <arquivo>
RESULTADO: SUCESSO
```
Gerei um PDF sintético (via `pdf-lib`, reproduzindo o layout do Relatório Sintético) e rodei o **pipeline completo real** (`parsePayrollPdfAny` → `extractPdfRows` com `pdfjs-dist` → `detectFormat` → `parseSinteticoFromPages`) contra ele. Resultado: formato detectado corretamente como `relatorio-sintetico`, 3 colaboradores extraídos, valores com separador de milhar (`3.117,21`) convertidos corretamente, totais consistentes.

⚠️ Aviso não-fatal do pdfjs-dist durante a extração: `UnknownErrorException: Ensure that the 'standardFontDataUrl' API parameter is provided` — não impediu a extração de texto neste teste, mas indica que fontes padrão não estão configuradas; vale investigar se algum PDF real com fontes incomuns depende disso para render (não deveria afetar extração de *texto*, só rasterização, mas registra o aviso para acompanhar).

```text
COMANDO: npx tsx scripts/test-parse.ts / test-router.ts / test-excel-output.ts / test-unified-excel.ts
RESULTADO: NÃO EXECUTADO
CAUSA: Dependem de um arquivo "../FOLHAD_2.PDF" — um PDF real de folha de pagamento, fora do repositório (não versionado, corretamente, por conter dados sensíveis) e não disponível neste ambiente.
```

**Conclusão**: o parser do "Relatório Sintético" **funciona corretamente contra um PDF sintético fiel ao layout esperado**, o que é uma evidência positiva forte — mas isso ainda **não é o mesmo que validar contra um PDF real** exportado pelo sistema de folha de pagamento de um cliente (fontes, quebras de linha, variações de layout, múltiplas páginas, casos de borda). O rótulo "experimental" no `page.tsx` continua justificado até isso acontecer. Ver seção 13.

## 6. Resultado do build

```text
COMANDO: npm run build  (com DATABASE_URL fictícia, igual ao Dockerfile)
RESULTADO: BUILD OK
```

```text
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 7.4s
✓ TypeScript: sem erros
✓ 12 rotas geradas (3 estáticas: /, /login, /usuarios; 7 dinâmicas de API; 1 not-found)
✓ Proxy (Middleware) registrado corretamente — confirma que src/proxy.ts está sendo reconhecido pelo Next 16 no lugar do antigo middleware.ts
Nenhum warning de build.
```

**Build classificado como: `BUILD OK`.**

Confirmações específicas pedidas:
- **Server/Client Components**: build separou corretamente estático (`○`) vs dinâmico (`ƒ`) — `/`, `/login`, `/usuarios` prerenderizados como estático (client components com fetch no `useEffect`, esperado), todas as rotas `/api/**` como dinâmicas (`runtime: "nodejs"` declarado em cada uma).
- **proxy.ts**: reconhecido e listado como `ƒ Proxy (Middleware)` — confirma que a migração para o nome novo do Next 16 está correta.
- **Prisma**: `prisma generate` roda antes do build (replicei o passo do Dockerfile) sem erro.
- **Variáveis de ambiente**: build só precisa de `DATABASE_URL` (mesmo que fictícia) para o `prisma generate`; nenhuma outra variável é exigida em tempo de build.
- **Imports/rotas dinâmicas**: sem erros de módulo não encontrado.

## 7. Estado do Prisma

```text
COMANDO: npx prisma validate
RESULTADO: SUCESSO — "The schema at prisma/schema.prisma is valid 🚀"
```

```text
COMANDO: npx prisma generate
RESULTADO: SUCESSO — Prisma Client (v7.8.0) gerado em ./src/generated/prisma
```

```text
COMANDO: npx prisma migrate status / npx prisma migrate deploy
RESULTADO: NÃO EXECUTADO
CAUSA: Não há PostgreSQL acessível neste ambiente (sem Docker daemon disponível, sem instância de banco configurada). Confirmar via docker compose up -d db + npx prisma migrate status assim que houver ambiente com Docker.
```

Validação estática (schema × migrations), sem banco vivo — já feita na auditoria inicial e reconfirmada agora: as 3 migrations (`init`, `add_duplicate_keys`, `add_auth`) reproduzem exatamente o `schema.prisma` atual, sem colunas ou tabelas órfãs.

### Perguntas da seção 5 do escopo (User / Session / Upload) — resposta via análise estática do schema

| Pergunta | Resposta (evidência: `prisma/schema.prisma` + migrations) |
|---|---|
| Relacionamentos | `Session.userId → User.id`, único FK do sistema. `Upload` não se relaciona com nada — está isolado por design (ver auditoria, seção 9). |
| Cascade | `Session` tem `onDelete: Cascade` em relação a `User` — deletar um usuário apaga automaticamente suas sessões no banco (garantido pelo Postgres, não pela aplicação). |
| Unique constraints | `User.email` é `@unique`. Nenhuma constraint unique em `Upload` (a checagem de duplicado é feita em código via `findFirst`, não via constraint de banco — ver risco abaixo). |
| Timestamps | Todos os models têm `createdAt` com `@default(now())`. Nenhum tem `updatedAt`. |
| Exclusões | `deleteUser` e `deleteUpload` fazem hard delete direto (`prisma.X.delete`), sem soft delete/auditoria de quem excluiu. |
| Sessões expiradas | **Confirmado por leitura de código** (`src/lib/auth/session.ts`): sessões expiradas não são fisicamente removidas — `getSessionUser`/`isAuthenticated` apenas checam `expiresAt < new Date()` e tratam como inválida. **Não existe rotina de limpeza** (nenhum cron/job encontrado no código) — linhas de `Session` expiradas se acumulam indefinidamente no banco. Risco baixo (crescimento lento de tabela pequena), mas é um débito real. |
| Uploads sem usuário | Por design, **todo** `Upload` "não tem usuário" — não existe FK `Upload.userId`. Não é uma falha, é uma decisão de modelo (uploads são recurso compartilhado por todos os usuários logados). |
| Usuários sem sessão | Possível e normal — usuário criado nunca logou, ou todas as sessões expiraram/foram deletadas no logout. Sem problema. |
| Constraint ausente digna de nota | A checagem de upload duplicado (`empresaChave + periodoChave + formato`) é feita **só na aplicação**, sem `@@unique` no banco — duas requisições simultâneas de upload do mesmo período poderiam, em teoria, criar dois registros duplicados (condição de corrida). Risco baixo dado o volume de uso esperado (upload manual, não concorrente), mas vale registrar como débito técnico (P2). |

## 8. Problemas confirmados (da auditoria original)

| Problema da auditoria | Confirmado? | Evidência desta fase |
|---|---|---|
| Sem rate limiting no login | ✅ Confirmado | Ver seção 10. |
| Sem RBAC — qualquer usuário cria/apaga contas | ✅ Confirmado | Ver seção 9 (tabela de operações administrativas). |
| Edição de colaborador não persiste no banco | ✅ Confirmado | Ver seção 14. |
| Relatório Sintético experimental | ✅ Confirmado, com evidência nova (funciona em PDF sintético, não validado em PDF real) | Ver seção 13. |
| OCR anunciado mas não implementado | ✅ Confirmado | Ver seção 15. |
| `.env.example` ausente | ✅ Confirmado | — |
| Falta de endpoint de exclusão de upload | ✅ Confirmado | `deleteUpload()` existe em `src/lib/db/uploads.ts`, só chamado internamente em `POST /api/extract` (fluxo de substituição de duplicado). |

## 9. Problemas descartados / corrigidos em relação à auditoria original

A auditoria original errou em um ponto, corrigido agora com evidência de execução real (`npm run lint`, que reporta uso de bibliotecas):

```text
ERRO NA AUDITORIA ORIGINAL: "react-hook-form e @tanstack/react-table declarados mas sem uso aparente — candidatos a dependência morta"
CORREÇÃO: Ambas ESTÃO em uso.
  - @tanstack/react-table: usado em src/components/EmployeeTable.tsx e SinteticoTable.tsx (useReactTable) — confirmado pelo próprio lint, que emite aviso do React Compiler especificamente sobre essas duas chamadas.
  - react-hook-form: usado em src/components/EditColaboradorForm.tsx (useForm) — confirmado por leitura direta do arquivo.
CAUSA DO ERRO: A busca inicial da auditoria (grep por TODO/FIXME/mock etc.) não incluiu uma checagem de uso real de dependências; a conclusão foi tirada só da ausência dessas strings nos arquivos varridos naquele momento, sem grep dedicado a "react-hook-form"/"react-table".
```

Nenhuma dependência morta foi confirmada nesta fase — não há candidatos remanescentes.

## 10. Novos problemas encontrados nesta fase

```text
PROBLEMA: Exportação (CSV/Excel/JSON) ignora os filtros aplicados na tela — sempre exporta a lista completa, não a filtrada
ARQUIVO: src/app/page.tsx (linhas onde <ExportButtons result={extrato} /> e <ExportButtons result={sintetico} /> são chamados)
EVIDÊNCIA: ExportButtons recebe result={extrato}/result={sintetico} (o objeto completo), não filteredColaboradores/filteredLinhas (as listas já filtradas usadas para renderizar a tabela na tela)
CAUSA PROVÁVEL: Export foi implementado antes dos filtros, ou os dois nunca foram conectados
IMPACTO: Usuário aplica um filtro (ex.: só um departamento), vê a tabela filtrada na tela, clica em "Exportar" e recebe um arquivo com TODOS os colaboradores — comportamento que contraria a expectativa natural de "exportar o que estou vendo"
SEVERIDADE: Média-Alta (funcional, pode gerar confusão real no uso diário — é justamente o tipo de "dados exibidos ≠ dados exportados" que a Fase 2 pediu para verificar)
CORREÇÃO RECOMENDADA: Passar a lista já filtrada (filteredColaboradores / filteredLinhas) para ExportButtons em vez do result completo
```

```text
PROBLEMA: Checagem de upload duplicado não é garantida por constraint de banco (condição de corrida)
ARQUIVO: src/lib/db/uploads.ts (findDuplicateUpload), prisma/schema.prisma (Upload sem @@unique)
EVIDÊNCIA: findDuplicateUpload usa findFirst (leitura), sem transação/constraint que impeça duas gravações concorrentes
IMPACTO: Baixo na prática (uploads são manuais, um de cada vez), mas é uma falha teórica de consistência
CORREÇÃO RECOMENDADA: Considerar índice único parcial (formato, empresaChave, periodoChave) quando ambos não forem nulos, se o caso de uso justificar
SEVERIDADE: Baixa
```

```text
PROBLEMA: Sem rotina de limpeza de sessões expiradas
ARQUIVO: src/lib/auth/session.ts, prisma/schema.prisma (Session)
EVIDÊNCIA: Nenhum código de deleteMany/cron encontrado; sessões expiradas só são ignoradas na leitura, nunca removidas
IMPACTO: Crescimento lento e ilimitado da tabela Session ao longo do tempo
CORREÇÃO RECOMENDADA: Job periódico simples (ex.: rodar deleteMany({ where: { expiresAt: { lt: new Date() } } }) num cron leve, ou at simplest, limpar de forma oportunista a cada login)
SEVERIDADE: Baixa
```

```text
PROBLEMA: Ambiente de execução real (Node 20, definido no Dockerfile) diverge do Node instalado neste ambiente de auditoria (Node 22)
ARQUIVO: Dockerfile (FROM node:20-alpine)
IMPACTO: Build/typecheck/lint validados aqui rodaram em Node 22 — não é garantia total de comportamento idêntico em Node 20 de produção
CORREÇÃO RECOMENDADA: Rodar esta mesma bateria de validação (build ao menos) num container Docker real antes de considerar definitivamente validado para produção
SEVERIDADE: Baixa (nenhuma divergência foi observada; é uma lacuna de cobertura, não um erro confirmado)
```

## 11. Vulnerabilidades (`npm audit`)

19 vulnerabilidades reportadas. Classificação por relevância real (não só severidade CVE) — a maioria está em **dependências transitivas de ferramentas de desenvolvimento do Prisma** (CLI/Studio), não em código que roda em produção:

| Severidade CVE | Pacote | Onde entra na árvore | Relevante para produção? |
|---|---|---|---|
| 🔴 Crítica | `next` (16.2.10) | Dependência direta, é o próprio framework | **Sim — a mais importante.** `npm audit` aponta correção não-major disponível: `next@16.3.5`. Recomendo atualizar assim que possível (é um patch, não upgrade major). |
| 🟠 Alta | `prisma` / `@prisma/config` / `@prisma/dev` | Dependência direta (CLI) | Parcialmente — CLI é usado em build/migrate, não em runtime da aplicação. `npm audit` sugere downgrade para `prisma@6.19.3`, mas isso seria **regredir** uma versão major (o projeto está deliberadamente em 7.8.0) — **não seguir essa sugestão automaticamente**; validar se há um patch 7.x mais novo que resolva antes de considerar qualquer mudança de versão. |
| 🟠 Alta | `mysql2`, `hono`, `@hono/node-server` | Transitivas de `@prisma/dev` (usadas pelo Prisma Studio/dev server interno) | Baixa — não fazem parte do caminho de execução em produção (`npm run start` não usa Prisma Studio). |
| 🟠 Alta | `sharp` | Transitiva de `next` (otimização de imagem) | Baixa/Média — o projeto não usa `next/image` em lugar nenhum identificado no código; risco só se essa funcionalidade for usada no futuro. |
| 🟠/🟡 Alta/Moderada | `brace-expansion`, `browserslist`, `postcss`, `js-yaml`, `fast-uri`, `deepmerge-ts`, `nanoid`, `uuid`, `valibot`, `baseline-browser-mapping` | Transitivas de toolchain (build/lint/CLI) | Baixa — ferramentas de build/dev, não código servido. |

**Recomendação objetiva**: atualizar `next` para `16.3.5` (patch, sem breaking change esperado) é o único item desta lista com prioridade real antes de produção. O restante pode ficar registrado como débito técnico (P2/P3) e revisado periodicamente com `npm audit`, sem ação imediata.

## 12. Autorização — mapa confirmado por código

```text
Frontend (src/app/usuarios/page.tsx)
  → fetch("/api/users", { method: "GET"/"POST" }) ou fetch(`/api/users/${id}`, { method: "DELETE" })
  → src/app/api/users/route.ts / src/app/api/users/[id]/route.ts
  → requireUser() [src/lib/auth/session.ts] — valida SÓ que existe uma sessão válida no cookie
  → (nenhuma checagem de papel/permissão — não existe código para isso)
  → operação direta no banco via src/lib/db/users.ts (createUser / listUsers / deleteUser)
```

| Operação | Requer login | Verifica permissão | Vulnerável |
|---|---|---|---|
| Listar usuários | ✅ Sim (`requireUser()` em `GET /api/users`) | ❌ Não | ✅ Sim — qualquer conta autenticada vê todos os usuários |
| Criar usuário | ✅ Sim (`requireUser()` em `POST /api/users`) | ❌ Não | ✅ Sim — qualquer conta autenticada cria novas contas |
| Alterar usuário | — | — | Não se aplica — **não existe endpoint de alteração** (não há `PATCH`/`PUT` em `/api/users/[id]`) |
| Excluir usuário | ✅ Sim (`requireUser()` em `DELETE /api/users/[id]`) | ⚠️ Parcial — só bloqueia excluir a **própria** conta (`if (id === user.id)`), nenhuma outra checagem | ✅ Sim — qualquer conta autenticada apaga qualquer outra conta |
| Resetar senha | — | — | Não se aplica — **funcionalidade não existe** no sistema |

**Confirmação direta da auditoria original**: sim, está confirmado por código — `requireUser()` (linha 62-68 de `src/lib/auth/session.ts`) só verifica se existe uma `Session` válida no banco vinculada ao cookie; não existe em nenhum lugar do código um conceito de `role`/`perfil`/`permissão`. É uma vulnerabilidade real de controle de acesso quebrado (qualquer conta = admin de fato), não uma suposição.

## 13. Proposta de modelo de permissão (ADMIN / USER)

Validando a proposta padrão do escopo contra o funcionamento real do sistema:

### ADMIN
- Criar, listar, excluir usuários (as únicas operações de usuário que já existem hoje).
- (Não existe "editar usuário" hoje — se for criado futuramente, também seria admin-only.)

### USER
- Fazer upload de PDF (`POST /api/extract`).
- Consultar/listar histórico de uploads (`GET /api/uploads`, `GET /api/uploads/[id]`) — hoje esse histórico é **compartilhado entre todos os usuários** (sem dono), então "consultar o próprio histórico" não se aplica ao modelo atual sem uma mudança maior (adicionar `Upload.userId`). Recomendo, na primeira versão do RBAC, manter uploads como recurso compartilhado (mudar isso é uma decisão de produto separada, maior).
- Usar filtros, exportar resultados.

**Validação contra o sistema real**: o modelo ADMIN/USER proposto no escopo **é adequado e suficiente** para o tamanho atual do projeto — só existe hoje uma área administrativa real (`/usuarios` e suas 3 rotas de API). Não recomendo nada mais granular (ex.: permissões por módulo) neste momento — seria over-engineering para 3 telas e 12 rotas.

Implementação mínima sugerida (não aplicada nesta fase, só desenhada):
1. Adicionar `role String @default("USER")` em `User` (migration simples, não destrutiva, com default).
2. Criar um `requireAdmin()` em `src/lib/auth/session.ts` que chama `requireUser()` e depois checa `user.role === "ADMIN"`.
3. Usar `requireAdmin()` em `POST /api/users`, `DELETE /api/users/[id]`, `GET /api/users` (listar usuários também deveria ser admin-only, não é informação de negócio necessária para o usuário comum).
4. `scripts/seed-admin.ts` passa a criar o primeiro usuário já com `role: "ADMIN"`.
5. Primeiro usuário do sistema nunca pode ficar sem nenhum admin — vale considerar uma checagem extra em `deleteUser`/mudança de papel para impedir remover o último ADMIN (fora do escopo do mínimo, mas fácil de adicionar).

## 14. Rate limit do login

Confirmado por código (`src/app/api/auth/login/route.ts` + `src/lib/auth/session.ts` + `src/lib/auth/password.ts`):

- **Endpoint**: `POST /api/auth/login`, sem server action envolvida (é uma API route pura).
- **bcrypt**: `bcrypt.compare` roda **sempre**, mesmo quando o e-mail não existe (`user ? await verifyPassword(...) : false` — o `verifyPassword` só é chamado se `user` existir; quando o usuário NÃO existe, o código pula direto para `false` sem chamar bcrypt) — isso é uma **pequena diferença de timing observável**: uma resposta para e-mail inexistente é mais rápida (sem custo de bcrypt) do que para e-mail existente com senha errada (com custo de bcrypt). É um vetor de user enumeration por timing, de exploração pouco prática, mas existe.
- **Mensagens de erro**: genéricas e corretas — "Email ou senha inválidos" tanto para e-mail inexistente quanto para senha errada (não revela qual está errado pelo *conteúdo* da mensagem, só pelo timing residual acima).
- **Proteção contra força bruta**: **nenhuma**. Sem contador de tentativas, sem bloqueio temporário, sem CAPTCHA, sem atraso progressivo.
- **Session fixation**: não há risco — `createSession` sempre gera uma `Session` nova (novo `id` via `cuid()`) a cada login bem-sucedido; não há reuso de um ID de sessão pré-existente do cliente.
- **Cookies**: `httpOnly` (não acessível via JS), `sameSite=lax`, `secure` configurável (default `true` em produção). Sem `Max-Age`/`Expires` inconsistente — bate com `expiresAt` da sessão no banco.

**Estratégia de rate limiting recomendada** (compatível com a arquitetura existente, sem infraestrutura nova):

Como o projeto já tem Postgres via Prisma e não tem Redis/fila, a opção mais simples e sem dependência nova é:

- **Opção recomendada — contador em memória por processo** (`Map<string, { count, resetAt }>` chaveado por IP, dentro do próprio módulo da rota, com janela deslizante simples, ex.: 5 tentativas / 5 minutos por IP). Simples, zero infraestrutura nova, funciona bem para o volume de uso esperado (poucos usuários internos). Limitação: reseta se o processo reiniciar, e não escala se um dia houver múltiplas instâncias do container — aceitável para o tamanho atual do projeto.
- **Alternativa mais robusta, se o projeto crescer**: tabela `LoginAttempt` no próprio Postgres (já disponível), com `deleteMany` periódico das tentativas antigas — mais persistente que em memória, ainda sem infraestrutura nova.
- **Não recomendado agora**: Redis ou serviço de rate limiting dedicado — desproporcional ao tamanho e ao número de usuários do sistema.

## 15. Sessões — auditoria aprofundada

- **Criação do token**: `prisma.session.create({ data: { userId, expiresAt } })` — o `id` da sessão é gerado pelo Prisma via `@default(cuid())` no schema. `cuid()` (v1, usado pelo Prisma) gera IDs com boa entropia prática (timestamp + contador + fingerprint de máquina + parte aleatória), **não é um token criptográfico dedicado** (como `crypto.randomBytes`), mas na prática é difícil de adivinhar/enumerar em sequência para um atacante externo sem acesso à máquina. Não é um risco crítico, mas um token de sessão gerado com `crypto.randomBytes(32).toString("hex")` seria uma prática mais forte e explícita para esse uso específico (identificador de sessão de autenticação, não um ID de registro qualquer).
- **Armazenamento**: banco (`Session` table) — verificado a cada requisição, não é JWT autocontido. ✅ Boa prática (permite revogação imediata).
- **Cookie**: nome `session`, `httpOnly: true` ✅, `secure` conforme ambiente ✅, `sameSite: "lax"` ✅, `expires` = mesma data do `expiresAt` da sessão no banco ✅ (consistente).
- **Expiração**: 7 dias fixos (`SESSION_DURATION_MS`), sem renovação deslizante (a sessão não é estendida por uso contínuo — expira 7 dias após o login, mesmo que o usuário use o sistema todo dia).
- **Logout**: apaga a `Session` do banco e limpa o cookie — revogação real, não só client-side. ✅
- **Invalidação/sessões antigas**: como já dito na seção 7/10, não há limpeza automática de sessões expiradas — ficam na tabela indefinidamente (risco baixo, débito técnico).
- **Comportamento após exclusão do usuário**: `onDelete: Cascade` no schema garante que o Postgres apaga automaticamente todas as `Session` daquele usuário quando o `User` é deletado — **efeito colateral correto**: um usuário removido perde acesso imediatamente, mesmo com uma sessão ainda "válida" em tese (o cookie do navegador dele passaria a apontar para uma sessão que não existe mais, e `getSessionUser` retornaria `null` na próxima requisição).

**Riscos identificados**: nenhum crítico. O uso de `cuid()` em vez de um gerador criptográfico dedicado para o token de sessão é o único ponto que vale nota (baixo risco prático, mas não é a prática mais forte disponível).

## 16. Extração de PDF — fluxo detalhado

```text
PDF (Buffer, até 30MB)
↓ extractPdfRows() [src/lib/pdf/extractRows.ts] — pdfjs-dist lê cada página, pega os itens de texto com posição (x, y) do content stream, porque a ordem do pdf.js NÃO é a ordem visual; agrupa itens por Y (tolerância de 2pt) e ordena por X → reconstrói "linhas" como um humano leria
↓ hasExtractableText = totalChars > 20 — se falso, aborta com aviso de "provável imagem escaneada / OCR não disponível"
↓ detectFormat() [formatDetector.ts] — olha só as 2 primeiras páginas:
    - contém "EXTRATO MENSAL" → formato "extrato-mensal"
    - regex /RELAT[OÓ0]RIO\s+SINT[EÉ3]TICO/ (tolera erros de OCR tipo "0" por "O", "3" por "É") OU (menciona "PROVENTOS" + "DESCONTOS" + alguma variação de "CÓDIGO") → "relatorio-sintetico"
    - nenhum dos dois → "desconhecido"
↓ parser específico:
    - Extrato Mensal: parsePayrollPdf.ts → segmentEmployees.ts (separa blocos por colaborador) → employeeParser.ts (campos) + rubricaParser.ts (linhas de proventos/descontos, corte fixo em x ≈ 285pt para separar coluna esquerda/direita) → computeTotals.ts
    - Relatório Sintético: sintetico/parseSintetico.ts → columnAnchors.ts (mapeia posições X de cabeçalho para colunas) → rowParser.ts (associa cada valor à coluna mais próxima) → sintetico/computeTotals.ts
↓ normalização: parseBRNumber() [normalize/money.ts] — remove tudo que não é dígito/ponto/vírgula/sinal, remove pontos de milhar, troca vírgula decimal por ponto; retorna null (não zero) quando não reconhece, para não mascarar erro como "zero"
↓ objeto final: ExtractionResult | SinteticoResult | FormatoDesconhecidoResult
↓ tabela (EmployeeTable/SinteticoTable, via @tanstack/react-table)
↓ exportação (CSV/Excel/JSON, client-side)
```

- **Campos obrigatórios vs. opcionais**: o parser do Extrato Mensal usa `requireNumber(..., lowConfidence)` — quando um campo numérico esperado não é encontrado ou não converte, ele não falha a extração inteira: marca o campo em `camposBaixaConfianca` (mostrado na UI como aviso, na aba "Revisar/corrigir") e segue. **Não há campo que, se ausente, aborte a extração do colaborador inteiro** — é uma extração "best effort" por design, sinalizando incerteza em vez de bloquear.
- **Auto-verificação embutida (achado positivo, não estava na auditoria original)**: `parsePayrollPdf.ts` recalcula os totais gerais a partir dos colaboradores extraídos e **compara com os totais impressos no próprio PDF** (`impresso.totalProventos`, etc.), com uma tolerância (`EPSILON`) — se divergir, gera um aviso explícito ("Total de descontos calculado diverge do total impresso no PDF"). Isso é uma prática de validação cruzada bem desenhada para um parser desse tipo.
- **Números negativos**: o sistema **não representa valores negativos como número negativo** — proventos e descontos são sempre armazenados como valores positivos em campos separados (`proventos`, `descontos`) e o líquido é derivado (`proventos - descontos` conceitualmente, calculado em `computeTotals.ts`). Isso evita ambiguidade de sinal, mas significa que não há tratamento explícito de "o PDF trouxe um valor negativo" — se acontecesse, cairia em `parseBRNumber`, que aceita `-` no regex de limpeza (`[^\d.,-]`) e produziria um número negativo sem tratamento especial adicional.
- **Datas**: convertidas via regex simples `\d{2}\/\d{2}\/\d{4}` (`extractDate` em `money.ts`) — mantidas como string no formato `dd/mm/yyyy`, sem conversão para `Date`/ISO. Não há validação de data inválida (ex.: `32/13/2026` passaria pela regex).
- **Páginas múltiplas**: tratadas nativamente — `extractPdfRows` processa todas as páginas do documento e retorna `pages: PdfPageRows[]`; os parsers (`segmentEmployees`, etc.) trabalham sobre o array completo de linhas de todas as páginas concatenadas, não página a página isoladamente. Multi-empresa/multi-arquivo do mesmo período é tratado numa camada acima (`combineExtratoMensal.ts`), combinando *uploads* diferentes, não páginas.
- **Erros de leitura**: qualquer exceção na extração inteira (ex.: pdfjs-dist não conseguir abrir o arquivo) sobe até `POST /api/extract`, que captura, loga (`console.error`) e retorna 500 com a mensagem do erro ao cliente.

## 17. Relatório Sintético — por que "experimental"

### O que já funciona
- Detecção do formato (regex tolerante a erros de OCR).
- Extração de cabeçalho da empresa (código, nome, departamento, período, emissão).
- Mapeamento de colunas por posição (`columnAnchors.ts`) e parsing de linha por linha (`rowParser.ts`).
- Conversão de números BR (com e sem separador de milhar), incluindo linhas quebradas em duas linhas físicas do PDF (visto no teste: `"000128 MARCELO..."` seguido de uma segunda linha com os valores — o parser junta corretamente).
- Cálculo de totais e comparação com o total geral impresso.
- **Confirmado nesta fase**: pipeline completo (fixture sintética E PDF sintético real via pdfjs-dist) produz resultado correto.

### O que não funciona / não foi testado
- **Nunca foi validado contra um PDF real** gerado por um sistema de folha de pagamento de verdade — só contra fixtures e um PDF sintético gerado pelo próprio time a partir do entendimento do layout. Fontes, kerning, quebras de página, variações de nomenclatura de coluna ("Hora Extra" vs "H.Extra" etc.) de um sistema real podem não bater com o que `columnAnchors.ts` espera.
- Não há tratamento visível para **múltiplos departamentos/páginas com cabeçalhos repetidos** dentro do mesmo relatório sintético (o Extrato Mensal tem lógica de segmentação mais elaborada para isso; o Sintético é mais simples).

### O que pode gerar resultado incorreto silenciosamente
- `columnAnchors.ts` associa cada valor à coluna X mais próxima (`bestDist`) — se o layout real tiver colunas com espaçamento diferente do esperado, um valor pode ser silenciosamente atribuído à coluna errada **sem gerar aviso**, já que o algoritmo sempre encontra "a mais próxima", mesmo que a distância real seja grande. Diferente do Extrato Mensal (que tem `camposBaixaConfianca` bem desenvolvido), o Sintético tem esse campo mas com cobertura aparentemente mais limitada.

### O que precisa ser testado
- Pelo menos 2-3 PDFs reais e variados do "Relatório Sintético" (de departamentos/empresas diferentes) antes de remover o aviso de "experimental" da UI.

## 18. Edição de colaborador — intenção arquitetural

Investigado o fluxo completo (`EmployeeDetailModal.tsx` → `EditColaboradorForm.tsx` → `page.tsx: handleSaveColaborador`):

- A extração já marca campos de baixa confiança (`camposBaixaConfianca`) e o colaborador tem um flag `revisadoManualmente` exibido como selo "revisado" no modal.
- A aba se chama explicitamente **"Revisar / corrigir"**, não "Editar".
- `handleSaveColaborador` atualiza o `state` do React (`setResult`) e **recalcula os totais gerais** (`computeTotaisGerais`) — ou seja, a correção afeta os totais mostrados na tela e, como a exportação usa o mesmo objeto `result`/`extrato` (não uma cópia congelada da extração original), **a correção também é refletida na exportação** (CSV/Excel/JSON) feita na mesma sessão da página.

**Resposta às opções do escopo**: é a opção **D** — os dados exibidos são modificados apenas no frontend antes/durante a exportação, dentro da mesma sessão de uso da página. Não é a opção A pura (não é só "em memória sem propósito": a intenção é servir como etapa de revisão pré-exportação) nem B (não é persistido em `Upload.data`) nem C (não precisa de entidade própria para cumprir esse propósito).

**Intenção arquitetural aparente**: o parser é "best effort" e sinaliza incerteza (`camposBaixaConfianca`); a tela de revisão existe para o usuário **corrigir erros de leitura antes de exportar/usar o dado**, não para editar folha de pagamento como sistema de registro. Isso é coerente com o propósito do sistema (ferramenta de extração/conversão, não um ERP de RH).

**Recomendação**: `Manter edição apenas temporária` — **mas com uma ressalva importante**: se o usuário recarregar a página ou reabrir o upload pelo histórico depois de fechar o navegador, a correção feita é perdida (porque `Upload.data` no banco continua com o valor original). Isso é aceitável para o propósito de "corrigir antes de exportar agora", mas **deveria ficar explícito na UI** (ex.: um aviso "essa correção vale só para esta sessão/exportação atual, não é salva permanentemente") para não confundir o usuário — hoje o selo "revisado" pode dar a falsa impressão de persistência. Persistir de verdade (opção B) só faria sentido se o produto evoluir para ser também um sistema de registro de correções, o que é uma decisão de produto maior, fora do escopo desta validação técnica.

## 19. Histórico de uploads

- **Criação**: todo upload bem-sucedido em `POST /api/extract` chama `saveUpload(fileName, result)` — grava `fileName`, `formato`, `totalColaboradores`, `liquidoGeral`, `empresaChave`/`periodoChave` (se detectáveis) e o **resultado completo da extração** em `data: Json`.
- **PDF original**: **não é armazenado** — só o JSON extraído. O arquivo binário enviado existe apenas durante o processamento em memória da requisição.
- **Vínculo com usuário**: nenhum (`Upload` não tem `userId`) — recurso compartilhado, como já registrado.
- **Tamanho**: não há limite de tamanho do JSON armazenado (Postgres `jsonb` comporta folgadamente o volume esperado de um relatório de folha).
- **Reprocessamento**: não existe — para reprocessar, é preciso enviar o PDF de novo (o original não fica guardado).
- **Download do PDF original**: não existe (nunca foi salvo).
- **Exclusão**: função `deleteUpload(id)` existe em `src/lib/db/uploads.ts`, mas hoje só é chamada internamente quando o usuário escolhe "substituir" um duplicado — **não há rota nem botão para o usuário excluir um upload do histórico por vontade própria**.

**A exclusão manual é realmente necessária?** Avaliando: sim, faz sentido como funcionalidade de baixa prioridade (P2/P3) — casos legítimos: upload de teste, upload errado (arquivo trocado) que não é tecnicamente "duplicado" (períodos diferentes, então não aciona o fluxo de substituição existente). **O que deveria ser removido**: só o registro `Upload` (linha inteira, já que `data` é um blob único sem sub-recursos vinculados) — não há nada mais para limpar em cascata (sem FK apontando para `Upload`). Não é urgente, mas é uma correção simples de se implementar quando chegar a vez (basta expor `DELETE /api/uploads/[id]` reaproveitando `deleteUpload()` já existente).

## 20. Dados sensíveis

Tipos de dado pessoal/sensível que **podem** aparecer nas estruturas do sistema (sem exibir nenhum valor real encontrado):

| Onde | Tipo de dado potencialmente presente |
|---|---|
| `Upload.data` (banco, `jsonb`) | Nome completo, CPF, matrícula, cargo, departamento, salário, proventos, descontos, valores de INSS/FGTS/IRRF — ou seja, dado de folha de pagamento completo de cada colaborador extraído |
| Logs do servidor (`console.error`) | Nas rotas de API, os `console.error` logam mensagens de erro e, em alguns casos, o objeto de erro — não foi encontrado nenhum `console.log`/`console.error` que imprima diretamente dados de colaborador (nome/CPF/salário); os logs de erro são sobre falhas de parsing/banco, não sobre o conteúdo extraído. Nenhuma evidência de vazamento de dado sensível em log. |
| Navegador (browser) | `localStorage` guarda apenas o **ID** do último upload (`extratoMensal:currentUploadId`), não dados sensíveis diretamente — mas o *estado React* em memória (não persistido) contém todos os dados extraídos enquanto a página está aberta, como esperado para a funcionalidade. |
| APIs | `GET /api/uploads/[id]` retorna o `Upload.data` completo (todos os campos de colaborador) para qualquer usuário autenticado — reforça a importância dos itens de segurança já listados (não há restrição de quem pode ver qual upload). |
| Arquivos exportados (CSV/Excel/JSON) | Contêm os mesmos dados pessoais/financeiros, gerados e baixados no navegador do usuário — ficam sob responsabilidade de quem exporta (fora do controle do sistema depois do download). |
| Git | Nenhum dado sensível encontrado versionado — `.gitignore` já exclui `.env*`; nenhum PDF de exemplo com dado real está no repositório (os scripts de teste apontam para um arquivo fora do repo, `../FOLHAD_2.PDF`, que não está commitado). |
| `.env` | Não presente neste ambiente; por padrão `.gitignore` bloqueia `.env*` de ir para o Git — correto. |

**Nenhum dado real foi exposto nesta análise** — apenas os tipos de campo foram identificados via schema/tipos TypeScript (`src/lib/types/payroll.ts`, `sintetico.ts`).

## 21. OCR — o que existe de fato

Todas as referências a "OCR" no código:

```text
src/app/page.tsx:296,299        → texto de UI: "Leitura por texto / OCR" (rótulo, só decorativo)
src/lib/types/payroll.ts:113    → metodoLeitura: "texto" | "ocr"  (campo de tipo, existe mas "ocr" nunca é fruto de OCR real)
src/lib/parser/router.ts:18     → mensagem de erro: "OCR ainda não está disponível nesta versão do sistema."
src/lib/parser/parsePayrollPdf.ts:97-98 → quando a extração de texto falha, marca metodoLeitura: "ocr" e emite a mesma mensagem de aviso
src/lib/parser/combineExtratoMensal.ts:68 → só propaga o metodoLeitura ao combinar uploads (se qualquer fonte foi "ocr", o combinado também é marcado "ocr")
```

- **Não existe** nenhuma dependência de OCR instalada (sem Tesseract, sem serviço de OCR externo, sem nada no `package.json`).
- **Não existe** código incompleto tentando fazer OCR — é só um rótulo (`"ocr"`) usado como *sinalizador de que o texto não pôde ser lido*, não uma funcionalidade real de reconhecimento óptico.
- **É, na prática, apenas uma mensagem de interface/promessa** — quando o PDF é escaneado (sem texto extraível), o sistema informa ao usuário que precisaria de OCR, mas não tenta.

**Recomendação**: `remover a referência` **ou** `deixar planejado para uma etapa posterior` — a decisão depende de quão comum são PDFs escaneados no uso real do sistema (se raro, não vale o investimento agora). Recomendo, no mínimo, **ajustar a mensagem** para não soar como uma funcionalidade "quase pronta" (ex.: "nesta versão do sistema" sugere que é questão de tempo) se não houver plano concreto de implementar — para não criar expectativa. Se o volume de PDFs escaneados for baixo, `remover a referência` a "OCR" especificamente e deixar só "não foi possível extrair texto deste PDF" é a opção mais honesta com o estado atual.

## 22. Proposta de testes automatizados para os parsers

Não implementado nesta fase (só proposta, conforme pedido). Framework sugerido: **Vitest** (mais leve que Jest, integra bem com TypeScript/ESM e com o `tsx` já usado nos scripts existentes) — decisão a confirmar com o time antes de adicionar a dependência.

Casos mínimos recomendados (mapeando o que o escopo pediu para a realidade do sistema):

| Caso | Cobre | Observação |
|---|---|---|
| PDF válido Extrato Mensal | `parsePayrollPdf` fim a fim | Precisa de uma fixture sintética gerada via `pdf-lib` (como já existe para o Sintético em `generate-test-sintetico-pdf.ts`) — hoje só há fixture real não versionada (`FOLHAD_2.PDF`), que não pode virar teste automatizado por conter dado real. |
| PDF válido Relatório Sintético | `parseSinteticoFromPages` fim a fim | Reaproveitar `generate-test-sintetico-pdf.ts`, hoje script manual, como fixture de teste automatizado. |
| PDF desconhecido (outro layout) | `detectFormat` retorna "desconhecido" | Fácil de fixturar (texto qualquer sem os marcadores esperados). |
| PDF vazio (0 páginas ou sem texto) | `hasExtractableText === false` | Já existe o caminho de código (`router.ts`), falta o teste. |
| PDF corrompido | Tratamento de exceção do pdfjs-dist | Testar que `POST /api/extract` retorna 500 com mensagem amigável, não crasha o processo. |
| PDF com múltiplas páginas | `segmentEmployees`/parsers operando sobre `pages` concatenadas | — |
| Campo ausente | `requireNumber` marcando `camposBaixaConfianca` sem abortar | Testar unitariamente `employeeParser.ts`/`rowParser.ts` isoladamente, sem precisar de PDF. |
| Valor monetário BR (com/sem milhar) | `parseBRNumber` | Teste unitário puro, rápido — `"1.234,56"` → `1234.56`, `"0,00"` → `0`, string inválida → `null`. |
| Valor negativo | `parseBRNumber("-123,45")` | Confirmar comportamento hoje implícito (aceita `-` no regex) e decidir se é o esperado. |
| Nome com acento | Encoding correto ao longo de todo o pipeline (pdfjs-dist → parser → export CSV com BOM) | — |
| Linha quebrada (valor numa segunda linha física) | `rowParser.ts` do Sintético já trata isso (visto no teste desta fase) — formalizar como teste de regressão. | |

## 23. Exportações — dados exibidos × dados exportados

```text
dados exibidos (tabela na tela, após filtros)  ≠  dados exportados (CSV/Excel/JSON)
```

**Confirmado como divergência real** — ver o achado detalhado na seção 10 ("Novos problemas encontrados"). A exportação sempre usa o `result` completo (`extrato`/`sintetico`), ignorando `filteredColaboradores`/`filteredLinhas`/busca de texto do Relatório Sintético.

Demais pontos verificados:
- **Alterações manuais** (aba "Revisar/corrigir"): **são** refletidas na exportação, porque tanto a tela quanto a exportação leem do mesmo `state` (`result`) — ver seção 18.
- **Formatação monetária**: CSV e Excel usam `formatBRNumber` (vírgula decimal, padrão BR) — consistente com o restante do sistema.
- **Datas**: exportadas como string, sem conversão adicional — mesmo formato `dd/mm/yyyy` da extração.
- **Encoding/caracteres especiais**: CSV usa BOM UTF-8 explícito (`"﻿" + ...`) especificamente para o Excel reconhecer acentuação corretamente ao abrir — boa prática documentada em comentário no próprio código.
- **Separador CSV**: `;` (ponto e vírgula), não `,` — decisão correta para abrir bem no Excel em configuração regional pt-BR (onde `,` já é o separador decimal).

## 24. Prioridade de correção

### P0 — Corrigir antes de qualquer uso
Nenhum item nesta categoria. Não há falha crítica de build, segurança gravíssima (ex.: RCE, exposição pública de segredo) ou perda de dados identificada. O `BUILD OK` e a ausência de erro de compilação/typecheck removem o único motivo que poderia colocar algo aqui.

### P1 — Corrigir antes de novas funcionalidades
1. **Exportação ignorando filtros** (seção 10/23) — corrige um bug funcional silencioso que já afeta o uso atual.
2. **RBAC mínimo (ADMIN/USER)** para `/api/users/*` (seções 9/12/13) — vulnerabilidade de controle de acesso real, antes de dar acesso a mais pessoas.
3. **Rate limiting no login** (seção 14) — mitigação simples (contador em memória), sem infraestrutura nova.
4. **Atualizar `next` para `16.3.5`** (patch de segurança, seção 11).
5. **Criar `.env.example`** (já confirmado ausente).

### P2 — Corrigir durante a evolução
1. Validar o parser do Relatório Sintético contra PDFs reais e então remover o aviso de "experimental" (seção 17).
2. Deixar explícito na UI que a correção manual do colaborador não é persistida entre sessões (seção 18) — ou decidir persistir, se o produto evoluir nessa direção.
3. Expor exclusão de upload do histórico (`DELETE /api/uploads/[id]`, seção 19).
4. Ajustar/remover a mensagem sobre OCR para não prometer algo sem plano concreto (seção 21).
5. Adicionar rotina de limpeza de sessões expiradas (seção 10/15).
6. Adicionar testes automatizados mínimos para os parsers (seção 22), começando pelos casos de `parseBRNumber` (mais fácil, maior retorno).
7. Corrigir timing residual do login (rodar um `bcrypt.compare` "dummy" mesmo quando o e-mail não existe) — mitigação barata do vetor de enumeração por timing (seção 14).

### P3 — Melhorias futuras
1. Considerar índice único parcial para evitar condição de corrida em upload duplicado (seção 7/10).
2. Considerar gerar o token de sessão com `crypto.randomBytes` em vez de depender só do `cuid()` do Prisma (seção 15).
3. Revisar dependências transitivas do Prisma CLI/toolchain apontadas pelo `npm audit` (seção 11) — sem urgência, não afetam runtime de produção.
4. Validar a mesma bateria de build/lint/typecheck rodando dentro de um container Docker real (Node 20), não só no ambiente de auditoria (Node 22).
5. Formalizar um script `typecheck` no `package.json`.

## 25. Ordem recomendada de implementação

Conforme pedido, a próxima etapa executa correções **uma de cada vez**, começando pelos itens P1 (já que não há P0). Ordem sugerida dentro de P1, da mais simples/isolada para a mais estrutural:

```text
1. Criar .env.example (documentação pura, zero risco)
2. Atualizar next → 16.3.5 (patch, testar build depois)
3. Corrigir exportação para respeitar os filtros ativos (bug isolado, contido em page.tsx/ExportButtons.tsx)
4. Adicionar rate limiting simples no login (isolado em /api/auth/login)
5. Implementar RBAC mínimo (ADMIN/USER) — o item mais estrutural, tocar por último dentro do P1
```

Cada item deve ser implementado, testado (build + os scripts manuais aplicáveis) e revisado isoladamente antes de avançar para o próximo, conforme solicitado. Nenhuma dessas correções foi aplicada nesta fase — este documento é só o diagnóstico e o plano.
