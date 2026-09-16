# Relatório: `recuperacao/codigo-completo` vs `master`

> Auditoria comparativa entre a versão em produção real (recuperada de código local não commitado) e o histórico até então publicado no GitHub. Nenhuma integração com `master` foi feita nesta etapa — apenas diagnóstico.

---

## 1. Resumo executivo

`master` reflete um estado muito antigo/incompleto do projeto: só tinha o módulo de Extração (Extrato Mensal/Relatório Sintético), Login e Usuários — 3 páginas, 8 rotas de API, 3 tabelas no banco. Esse foi o estado que ficou publicado no GitHub desde julho.

Enquanto isso, o desenvolvimento real continuou **localmente, sem nunca ser commitado**, e evoluiu para um sistema de gestão administrativa completo: RBAC (papéis/permissões), múltiplos módulos de Contas a Pagar (Vale Transporte e Alimentação, com upload, lançamento manual, revisão de pendências, aprovação), cadastro de colaboradores, entidades administrativas, OCR de documentos (Tesseract), reset de senha por e-mail, e um worker dedicado para processamento de documentos. Esse código foi recuperado do container Docker em produção → pasta local do desenvolvedor → branch `recuperacao/codigo-completo`, publicada no GitHub agora pela primeira vez (ver conversa anterior desta sessão).

**Conclusão da auditoria**: o código recuperado está íntegro, sem segredos versionados, sem dado sensível real identificado, e passa em lint/typecheck/testes/build. `master` deve ser tratado como a versão obsoleta; `recuperacao/codigo-completo` é a versão real do sistema. A integração formal (visão de como levar isso para `master` com segurança) é discutida na seção 15.

## 2. Situação das branches

| Branch | Estado | Commits à frente de `master` |
|---|---|---|
| `master` | Versão antiga/incompleta (Extração + Login + Usuários) | — (base) |
| `recuperacao/codigo-completo` | Código completo recuperado, recém publicado | 1 commit grande de recuperação |
| `ajuste/vale-transporte-resumo` | Ajuste visual isolado (barra de resumo movida) sobre `recuperacao/codigo-completo` | 1 commit, já em PR #1 (`ajuste/vale-transporte-resumo` → `recuperacao/codigo-completo`, aberto, não mesclado) |

## 3. Diferenças master × código recuperado

```
git diff --stat master...recuperacao/codigo-completo
181 files changed, 13415 insertions(+), 1144 deletions(-)

git diff --name-status master...recuperacao/codigo-completo
151 arquivos adicionados (A)
 30 arquivos modificados (M)
  0 arquivos removidos (D)
```

Nenhum arquivo foi removido — é puramente uma evolução aditiva sobre a base que já existia (Extração/Login/Usuários continuam presentes e funcionando).

### Arquivos modificados (30) — por área
- **Infra/config**: `.gitignore`, `Dockerfile`, `README.md`, `docker-compose.yml`, `docker-entrypoint.sh`, `package.json`, `package-lock.json`
- **Banco**: `prisma/schema.prisma`
- **Autenticação**: `src/lib/auth/session.ts`, `src/lib/db/users.ts`, `src/proxy.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`
- **Extração (módulo original)**: `src/app/api/extract/route.ts`, `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts`, `src/app/page.tsx`
- **UI/design system**: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/usuarios/page.tsx`, `src/components/{DuplicateUploadModal,EditColaboradorForm,EmployeeTable,ExportButtons,FileUpload,Filters}.tsx`
- **Scripts**: `scripts/seed-admin.ts`

## 4. Novas rotas

**Páginas (9 novas)**: `/cadastros`, `/cadastros/colaboradores`, `/contabilidade/folha`, `/pagamentos`, `/pagamentos/[id]`, `/pagamentos/[id]/validacao`, `/pagamentos/alimentacao`, `/pagamentos/vale-transporte`, `/redefinir-senha`

**APIs (41 novas)** — ver tabela completa na seção 5 (Mapeamento de rotas).

Destaque pedido explicitamente:
- **`/pagamentos`** — não existe em `master`. Hub de "Contas a pagar", lista as obrigações financeiras.
- **`/pagamentos/vale-transporte`** — não existe em `master`. Módulo completo de Vale Transporte (upload, lançamento manual, rateio, revisão de pendências).
- **`/pagamentos/alimentacao`** — não existe em `master`. Módulo completo de Alimentação por fornecedor (MA/PA, revisão, consolidado).
- Todas as demais páginas/rotas listadas acima também são inéditas frente a `master`.

## 5. Novos módulos

| Módulo | Diretório | Função |
|---|---|---|
| RBAC | `prisma` models `Role`, `Permission`, `UserRole`, `RolePermission`; `src/lib/auth/permissions.ts` | Papéis e permissões granulares, substitui o modelo "todo usuário = admin" da `master` |
| Reset de senha | `src/app/api/auth/password-reset`, `src/app/api/users/[id]/password-reset`, `src/lib/auth/password-reset-mail.ts`, `/redefinir-senha` | Fluxo de recuperação de senha por e-mail (nodemailer) — não existe em `master` |
| Entidades administrativas | `src/modules/administrative-entities`, `/api/administrative-entities` | Cadastro de empresas/filiais/fornecedores que recebem obrigações financeiras |
| Colaboradores (mestre) | `src/modules/collaborators`, `/api/collaborators/*`, `/cadastros/colaboradores` | Cadastro central de colaboradores, com merge/deduplicação, import, referências |
| Contas a Pagar — núcleo | `src/modules/accounts-payable/{server,shared,deletion-server}.ts`, `/api/financial-records/*`, `/api/financial-files/*` | Registro financeiro genérico, ciclo de vida (extração → validação → aprovação → pagamento → conciliação), soft delete |
| Contas a Pagar — Vale Transporte | `src/modules/accounts-payable/transit-voucher/*`, `/api/accounts-payable/transit-voucher/*`, `/pagamentos/vale-transporte` | Upload/lançamento manual/rateio por empresa→depto→colaborador, revisão de pendências |
| Contas a Pagar — Alimentação | `src/modules/accounts-payable/food/*`, `/api/accounts-payable/food/*`, `/pagamentos/alimentacao` | Mesma lógica de obrigação, mas para vale-alimentação, com ciclos MA/PA, revisão e preço por fornecedor |
| Documentos/OCR | `src/modules/documents/server/{ocr,privateStorage}.ts`, `scripts/document-worker.ts` | Extração de documentos via Tesseract.js (OCR real, diferente da promessa não implementada que existia em `master`) e armazenamento privado fora de `/public` |
| Aprovação | Models `ApprovalPolicy`, `ApprovalPolicyStep`, `ApprovalRequest`, `ApprovalStepInstance` | Workflow de aprovação configurável para obrigações financeiras |
| Contabilidade/Folha | `/contabilidade/folha`, `src/modules/accounting/payroll` | Nova ala de "workspace" de folha de pagamento, distinta do fluxo antigo de Extração |
| Auditoria de acesso | Model `UserAccessAudit` | Log de mudanças de acesso/permissão de usuário |

## 6. Prisma/banco

### Models novos (só em `recuperacao/codigo-completo`)
```
PasswordResetToken, UserAccessAudit, Role, Permission, UserRole, RolePermission,
Company, Branch, Supplier, AdministrativeEntity, Project, Contract, CostCenter,
Department, Category, LedgerAccount, FinancialSequence, FinancialRecord,
FoodUnitPriceConfig, FoodCompetence, FoodBatch, FoodAllocation, FoodBatchIssue,
FoodEmployee, FoodEmployeeAlias, FoodMealOccurrence, FoodBatchRevision,
TransitVoucherCompetence, TransitVoucherMap, TransitVoucherAllocation,
TransitVoucherIssue, FinancialDocumentFile, DocumentExtractionJob,
DocumentExtraction, DocumentValidationReview, DocumentValidationField,
ApprovalPolicy, ApprovalPolicyStep, ApprovalRequest, ApprovalStepInstance
```
(`master` tinha só `Upload`, `User`, `Session` — todos preservados sem alteração estrutural em `recuperacao/codigo-completo`.)

### Enums novos (19)
```
RecordLifecycleState, DocumentState, ExtractionState, ValidationState,
ApprovalState, PaymentState, ReceiptState, ReconciliationState, AllocationState,
AccountingState, FinancialFileKind, ExtractionJobState, ValidationDecision,
ApprovalRequestStatus, ApprovalStepStatus, FoodBatchStatus,
FoodOccurrenceValidationStatus, FoodOccurrenceMatchMethod,
FoodOccurrenceDisposition, EntryOrigin
```

### Relacionamentos novos
- `User` ganha relação com `Role` (via `UserRole`) e passa a ter campo `active` (usado por login/proxy/sessão para bloquear acesso desativado) e `lastLoginAt`.
- `AdministrativeEntity` é o ponto central que recebe `FinancialRecord`, `FoodBatch` e `TransitVoucherMap` (obrigações financeiras).
- `FoodEmployee`/`FoodEmployeeAlias` e `Collaborator` (mestre) se relacionam para deduplicação de colaboradores entre módulos.
- Cadeia de aprovação: `ApprovalPolicy` → `ApprovalPolicyStep` → `ApprovalRequest` → `ApprovalStepInstance`, associada a `FinancialRecord`.

### Migrations novas
**28 migrations novas** (de `20260816120000_add_rbac` até `20260826110000_user_access_management`), cobrindo: RBAC, master data, registros financeiros + permissões, documentos financeiros, jobs de extração, validação de documentos, workflow de aprovação, entidades administrativas, alimentação (MA/PA, preço por fornecedor, ciclos, ocorrências), vale-transporte (mapas, expansão de rateio, revisão de pendências), colaboradores mestres (merge tracking), normalização de rótulos organizacionais, gestão de acesso de usuário.

**Não executei nenhuma migration** (nem `migrate deploy`, nem `migrate dev`) — só `prisma generate` (que apenas lê o schema, não toca no banco) para permitir lint/typecheck/build.

### Constraints relevantes
- Soft delete em obrigações de Contas a Pagar (migration `accounts_payable_soft_delete`) — exclusão não é física, preserva histórico.
- Seeds de `Permission`/`RolePermission` embutidos nas próprias migrations (`seed_financial_permissions`, `seed_validation_permissions`, `seed_approval_defaults`) — dados de configuração (papéis/permissões), não dados de negócio.

## 7. Dependências (`package.json`)

| Categoria | Adicionado | Observação |
|---|---|---|
| Scripts novos | `typecheck`, `test`, `check` (roda lint+typecheck+test+build em sequência) | `master` só tinha `lint` além dos padrão do Next |
| Runtime novo | `@napi-rs/canvas`, `lucide-react`, `nodemailer`, `tesseract.js` | Canvas (provável suporte a renderização de PDF/imagem para OCR), ícones, e-mail, OCR real |
| Dev novo | `daisyui`, `@types/nodemailer` | Sistema de design (daisyUI sobre Tailwind) usado nas novas telas |
| Atualizados | `next` (16.2.10 → ^16.3.1), `prisma`/`@prisma/client`/`@prisma/adapter-pg` (7.8.0 → 7.9.1), `eslint-config-next` | Patches/minor, sem breaking change identificado no build |
| Removido | nenhum | — |

## 8. Docker

- **Node base**: `node:20-alpine` → `node:22-alpine`.
- **Novo serviço** `document-worker` no `docker-compose.yml`: roda `scripts/document-worker.ts` continuamente, com seus próprios volumes (`financeiro_private_storage`, `financeiro_ocr_cache` para o cache do Tesseract).
- **Novo volume** `financeiro_private_storage`, montado tanto no `web` quanto no `document-worker`, para armazenamento de documentos fora de `/public` (não expostos publicamente).
- **Segurança do container**: antes rodava tudo como root até o `chown` final; agora usa `su-exec` para trocar para o usuário `nextjs` antes de rodar migrations e o servidor — reduz superfície de execução como root.
- `docker-entrypoint.sh` agora cria e ajusta permissão do diretório de storage privado no boot, e aceita um comando customizado (usado pelo `document-worker`).

## 9. Autenticação

- **RBAC real**: sessão agora carrega `roles` → `permissions` do usuário (antes só carregava o usuário puro).
- **Campo `active`**: login (`/api/auth/login`), leitura de sessão (`getSessionUser`) e o `proxy.ts` agora checam `user.active` — uma conta desativada não consegue mais logar nem manter sessão válida, mesmo com cookie ainda "vivo". Esse controle **não existia** em `master`.
- **`lastLoginAt`**: login grava a data do último acesso.
- **Reset de senha**: fluxo novo completo (`/api/auth/password-reset`, `/api/users/[id]/password-reset`, página `/redefinir-senha`), com envio de e-mail via `nodemailer` — resolve uma lacuna identificada nas auditorias anteriores (Fase 1/2 não tinham esse recurso).
- **`proxy.ts`**: rota pública `/redefinir-senha` adicionada; lógica de redirect de usuário já autenticado corrigida para só disparar em `/login` (antes disparava em qualquer rota pública, o que teria quebrado `/redefinir-senha` para usuário logado).

## 10. Arquivos sensíveis

| Arquivo | Tipo de risco verificado | Versionado? |
|---|---|---|
| `.env.example` | Template de variáveis — nenhum valor real, todos placeholders/vazios (`SMTP_PASSWORD=`, `POSTGRES_PASSWORD=defina-uma-senha-forte` etc.) | Sim, corretamente (é o objetivo do arquivo) |
| `.env`, `.env.local`, `.env.production` | — | **Não encontrado** nenhum desses no histórico da branch |
| `node_modules/` | — | **Não versionado** (confirmado por `git ls-tree`) |
| `.next/` | — | **Não versionado** |
| `src/generated/prisma/` (Prisma Client gerado) | — | **Não versionado** |
| `*.log` | — | **Não encontrado** nenhum log versionado |
| Backups/dumps de banco (`*.dump`, `*.sql` de backup) | — | **Não encontrado** — os únicos `.sql` versionados são as migrations do Prisma (schema, não dado) |
| Uploads reais / PDFs reais / planilhas reais | — | **Não encontrado** — único binário versionado é `tests/fixtures/Mascara_Vale_Transporte.xlsx`, **confirmado pelo usuário como fixture de teste sintética**, não dado real |
| Chaves privadas/certificados (`*.pem`, `*.key`, `*.crt`) | — | **Não encontrado** |
| Credenciais hardcoded em código (`DATABASE_URL=`, API keys) | — | **Não encontrado** — buscado em todo `*.ts`/`*.tsx`, só há uso de `process.env.*` |
| Diretório `outputs/` (visto durante a recuperação, com `node_modules` de uma ferramenta de validação) | Continha centenas de arquivos de dependências de terceiros (Playwright, Sharp binário, etc.) | **Excluído deliberadamente do commit** (`git restore --staged`) antes do push — não está na branch |
| Diretórios `.tmp/`, `docs/` | Conteúdo não revisado (potencial risco desconhecido) | **Excluídos deliberadamente do commit** pela mesma razão — permanecem só no disco local do desenvolvedor, nunca chegaram ao Git |

**Nenhum segredo ou dado sensível foi identificado como commitado.**

## 11. Build

```
Comando: npm run build (com DATABASE_URL fictícia)
Resultado: PASS
Next.js 16.3.1 (Turbopack) — 39 rotas geradas, 0 erros, 0 warnings
```

## 12. Lint

```
Comando: npm run lint
Resultado: PASS
0 erros. 2 avisos pré-existentes do React Compiler sobre @tanstack/react-table
(mesmos avisos já documentados nas fases anteriores da auditoria original —
não são bugs, são o compiler recuando com segurança perto dessa lib).
```

## 13. Typecheck

```
Comando: npm run typecheck (tsc --noEmit)
Resultado: PASS (limpo)
Observação: só passou depois de rodar `npx prisma generate` — o Prisma Client
instalado por padrão não conhecia os ~37 models novos do schema desta branch.
Isso é esperado (o client é gerado, não versionado) e não é um bug do código.
```

## 14. Testes

```
Comando: npm test (tsx --test tests/baseline.test.ts)
Resultado: PASS — 38/38 testes passando, 0 falhas
```
Esse arquivo de teste (`tests/baseline.test.ts`, 751 linhas) **não existia em `master`** — é um teste de regressão amplo cobrindo RBAC, autenticação, alimentação (MA/PA, consolidado, rateio XLSX), vale-transporte, colaboradores, design system e shell corporativo. É uma evidência forte de maturidade — a versão recuperada não é só "mais código", já tem cobertura de teste que `master` nunca teve.

## 15. Riscos encontrados

| Risco | Severidade | Detalhe |
|---|---|---|
| Nenhum segredo/dado sensível commitado | — | Confirmado limpo (seção 10) |
| `master` e `recuperacao/codigo-completo` divergem estruturalmente há ~1 mês e meio (jul → ago) sem nenhum commit intermediário | 🟡 Médio | Não há histórico incremental — o merge para `master` vai ser um "salto" grande de uma vez, dificultando `git blame`/bisect futuro. Aceitável dado o contexto (recuperação de trabalho perdido), mas vale documentar isso no PR final. |
| 13 vulnerabilidades reportadas pelo `npm audit` (1 crítica, 9 altas, 3 moderadas) | 🟡 Médio | Mesmo padrão já visto nas fases anteriores — majoritariamente dependências transitivas de toolchain (Prisma CLI, build tools), não do runtime de produção. Vale revisão específica antes de produção, mas não bloqueia esta integração. |
| `RBAC`, `active`, reset de senha resolvem lacunas de segurança identificadas nas auditorias Fase 1/2 (ausência de RBAC, sem rate limit — este último ainda não resolvido) | 🟢 Positivo | A versão recuperada já é estruturalmente mais segura que a `master` antiga em vários pontos levantados anteriormente. Rate limiting de login ainda não foi visto no diff — segue como pendência. |
| Migrations aplicadas automaticamente no boot do container (`prisma migrate deploy` no entrypoint), agora 28 migrations maiores para rodar de uma vez em qualquer ambiente que só tinha as 3 antigas | 🟠 Alto (operacional) | Antes de apontar qualquer ambiente real para este código, rodar `prisma migrate status` contra o banco de produção real primeiro, fora deste fluxo automático, para confirmar que o histórico de migrations bate (o banco de produção já deve ter essas 28 aplicadas, já que é de lá que o container recuperado rodava — mas isso precisa ser confirmado, não presumido). |
| PR #1 (`ajuste/vale-transporte-resumo` → `recuperacao/codigo-completo`) ainda aberto | ℹ️ Informativo | Aguardando sua revisão manual, conforme pedido — não foi mesclado. |

## 16. Recomendação de integração

1. **Não fazer merge direto de `recuperacao/codigo-completo` para `master`** ainda — antes disso, revisar e mesclar o PR #1 (o ajuste pequeno), para `recuperacao/codigo-completo` já sair com esse ajuste incorporado.
2. Confirmar contra o banco de produção real (não a `placeholder` usada nesta auditoria) que `prisma migrate status` bate com as 28 migrations novas antes de considerar `recuperacao/codigo-completo` pronta para qualquer ambiente novo.
3. Depois disso, abrir um PR único `recuperacao/codigo-completo` → `master`, com este relatório linkado na descrição, deixando claro que é uma reconciliação de histórico (código local recuperado), não uma feature comum — para quem revisar não estranhar o tamanho do diff.
4. Após esse merge, `master` passa a ser a fonte da verdade de novo, e a branch `recuperacao/codigo-completo` pode ser arquivada (não excluída, mantida como referência histórica de quando essa recuperação aconteceu).
5. Tratar os itens da seção 15 (rate limiting de login, revisão de `npm audit`) como itens de backlog separados, não bloqueadores desta reconciliação.

---

## Validação executada nesta auditoria (branch `recuperacao/codigo-completo`)

```
npm ci             → PASS (633 pacotes)
npx prisma generate → PASS
npm run lint        → PASS (0 erros)
npx tsc --noEmit    → PASS (0 erros)
npm test            → PASS (38/38)
npm run build       → PASS (39 rotas, 0 erros/warnings)
```

Nenhuma correção foi aplicada. Nenhuma migration foi executada contra um banco real. Nenhum merge, rebase, reset ou push forçado foi realizado.

---

## Apêndice: Mapa completo de rotas (branch `recuperacao/codigo-completo`)

| Rota | Arquivo | Módulo |
|---|---|---|
| `/api/accounts-payable/food/[batchId]/discard` | `src/app/api/accounts-payable/food/[batchId]/discard/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]/download` | `src/app/api/accounts-payable/food/[batchId]/download/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]/edit` | `src/app/api/accounts-payable/food/[batchId]/edit/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]/finalize` | `src/app/api/accounts-payable/food/[batchId]/finalize/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]/records` | `src/app/api/accounts-payable/food/[batchId]/records/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]/review-group` | `src/app/api/accounts-payable/food/[batchId]/review-group/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/[batchId]` | `src/app/api/accounts-payable/food/[batchId]/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/consolidated/download` | `src/app/api/accounts-payable/food/consolidated/download/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/manual` | `src/app/api/accounts-payable/food/manual/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/price` | `src/app/api/accounts-payable/food/price/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food` | `src/app/api/accounts-payable/food/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/template` | `src/app/api/accounts-payable/food/template/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/food/upload` | `src/app/api/accounts-payable/food/upload/route.ts` | Contas a Pagar — Alimentação (**NOVA**) |
| `/api/accounts-payable/transit-voucher/[mapId]/download` | `src/app/api/accounts-payable/transit-voucher/[mapId]/download/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/[mapId]/edit` | `src/app/api/accounts-payable/transit-voucher/[mapId]/edit/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/[mapId]/issues/[issueId]` | `src/app/api/accounts-payable/transit-voucher/[mapId]/issues/[issueId]/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/[mapId]/records` | `src/app/api/accounts-payable/transit-voucher/[mapId]/records/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/[mapId]` | `src/app/api/accounts-payable/transit-voucher/[mapId]/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/manual` | `src/app/api/accounts-payable/transit-voucher/manual/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher` | `src/app/api/accounts-payable/transit-voucher/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/template` | `src/app/api/accounts-payable/transit-voucher/template/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/accounts-payable/transit-voucher/upload` | `src/app/api/accounts-payable/transit-voucher/upload/route.ts` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/api/administrative-entities/[id]` | `src/app/api/administrative-entities/[id]/route.ts` | Entidades administrativas (**NOVA**) |
| `/api/administrative-entities` | `src/app/api/administrative-entities/route.ts` | Entidades administrativas (**NOVA**) |
| `/api/auth/login` | `src/app/api/auth/login/route.ts` | Autenticação (existente) |
| `/api/auth/logout` | `src/app/api/auth/logout/route.ts` | Autenticação (existente) |
| `/api/auth/me` | `src/app/api/auth/me/route.ts` | Autenticação (existente) |
| `/api/auth/password-reset` | `src/app/api/auth/password-reset/route.ts` | Autenticação (**NOVA**) |
| `/api/collaborators/[id]/references` | `src/app/api/collaborators/[id]/references/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/[id]` | `src/app/api/collaborators/[id]/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/bulk` | `src/app/api/collaborators/bulk/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/delete` | `src/app/api/collaborators/delete/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/duplicates` | `src/app/api/collaborators/duplicates/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/import` | `src/app/api/collaborators/import/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/merge` | `src/app/api/collaborators/merge/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators` | `src/app/api/collaborators/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/collaborators/template` | `src/app/api/collaborators/template/route.ts` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/api/extract` | `src/app/api/extract/route.ts` | Extração (módulo original) (existente) |
| `/api/financial-files/[fileId]/reprocess` | `src/app/api/financial-files/[fileId]/reprocess/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/financial-files/[fileId]` | `src/app/api/financial-files/[fileId]/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/financial-records/[id]/files` | `src/app/api/financial-records/[id]/files/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/financial-records/[id]` | `src/app/api/financial-records/[id]/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/financial-records/[id]/validation` | `src/app/api/financial-records/[id]/validation/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/financial-records` | `src/app/api/financial-records/route.ts` | Contas a Pagar — núcleo (**NOVA**) |
| `/api/master-data/[entity]` | `src/app/api/master-data/[entity]/route.ts` | Master data (**NOVA**) |
| `/api/uploads/[id]` | `src/app/api/uploads/[id]/route.ts` | Extração (módulo original) (existente) |
| `/api/uploads` | `src/app/api/uploads/route.ts` | Extração (módulo original) (existente) |
| `/api/users/[id]/password-reset` | `src/app/api/users/[id]/password-reset/route.ts` | Usuários (**NOVA**) |
| `/api/users/[id]` | `src/app/api/users/[id]/route.ts` | Usuários (existente) |
| `/api/users` | `src/app/api/users/route.ts` | Usuários (existente) |
| `/cadastros/colaboradores` | `src/app/cadastros/colaboradores/page.tsx` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/cadastros` | `src/app/cadastros/page.tsx` | Colaboradores (cadastro mestre) (**NOVA**) |
| `/contabilidade/folha` | `src/app/contabilidade/folha/page.tsx` | Contabilidade / Folha (**NOVA**) |
| `/login` | `src/app/login/page.tsx` | Autenticação (existente) |
| `/pagamentos/[id]` | `src/app/pagamentos/[id]/page.tsx` | Contas a Pagar — núcleo (**NOVA**) |
| `/pagamentos/[id]/validacao` | `src/app/pagamentos/[id]/validacao/page.tsx` | Contas a Pagar — núcleo (**NOVA**) |
| `/pagamentos/alimentacao` | `src/app/pagamentos/alimentacao/page.tsx` | Contas a Pagar — Alimentação (**NOVA**) |
| `/pagamentos` | `src/app/pagamentos/page.tsx` | Contas a Pagar — núcleo (**NOVA**) |
| `/pagamentos/vale-transporte` | `src/app/pagamentos/vale-transporte/page.tsx` | Contas a Pagar — Vale Transporte (**NOVA**) |
| `/` | `src/app/page.tsx` | Extração (módulo original) (existente) |
| `/redefinir-senha` | `src/app/redefinir-senha/page.tsx` | Autenticação (**NOVA**) |
| `/usuarios` | `src/app/usuarios/page.tsx` | Usuários (existente) |
