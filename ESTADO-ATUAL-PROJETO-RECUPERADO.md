# Estado Atual do Projeto — Código Recuperado

> Este documento substitui `AUDITORIA-COMPLETA-PROJETO.md` e `PLANO-RETOMADA-FASE-2.md` como referência principal. Aqueles documentos não foram apagados (ficam preservados no histórico, na branch `claude/modest-mccarthy-s7gkqc`), mas descrevem uma versão do sistema muito mais limitada do que a que realmente estava em produção. Ver seção 27.

Branch auditada: **`recuperacao/codigo-completo`** (HEAD `8535f61`)

> **Atualização — Fase 5 (2026-09-16):** PR #1 (`ajuste/vale-transporte-resumo` → `recuperacao/codigo-completo`, mover `<Summary maps={maps}/>` para o final da página de Vale Transporte) foi mesclado via commit `8535f61`. Suíte de validação completa (lint, typecheck, build, testes) re-executada após o merge — todas PASS. Auditoria de dependências (`npm audit`) atualizada na seção 25. Validação de banco de dados real e smoke tests em ambiente com Docker/PostgreSQL **não puderam ser executados nesta sessão remota** (sem acesso a Docker/`DATABASE_URL` de produção) — ver seção 28 para os comandos exatos a rodar localmente.

---

## 1. Resumo executivo

O sistema não é mais "Extrato Mensal" (um extrator de PDF de folha de pagamento). Com o código recuperado, ele é um **sistema de gestão administrativa e Contas a Pagar** completo: RBAC com 6 papéis, dois módulos de obrigação financeira em produção (Vale Transporte e Alimentação), OCR real de documentos, workflow de aprovação configurável, cadastro mestre de colaboradores e entidades administrativas, e o módulo original de Extração de folha de pagamento preservado e funcionando dentro dessa estrutura maior.

37 models Prisma, 19 enums, 28 migrations, 9 páginas, 50 rotas de API, 38 testes automatizados — nenhuma dessas contagens existia na versão que estava publicada em `master`.

## 2. Branch oficial temporária

Enquanto a reconciliação com `master` não acontece, **`recuperacao/codigo-completo` é a fonte da verdade** deste projeto. Qualquer trabalho novo deve partir dela, não de `master`. `master` só deve voltar a ser a base depois da integração descrita na seção 29.

## 3. Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | Next.js ^16.3.1 (App Router, Turbopack) | Atualizado de 16.2.10 |
| Runtime | Node 22 (Docker: `node:22-alpine`, atualizado de `node:20-alpine`) | |
| UI | React 19, Tailwind CSS 4 + **daisyUI 5** (novo) | Design system daisyUI adotado nos módulos novos |
| Ícones | **lucide-react** (novo) | |
| ORM | Prisma ^7.9.1 + `@prisma/adapter-pg` | |
| Banco | PostgreSQL 16 | |
| PDF | pdfjs-dist (extração nativa) | |
| OCR | **tesseract.js 7 + @napi-rs/canvas** (novo) | Ver seção 14 |
| E-mail | **nodemailer** (novo) | Reset de senha |
| Testes | `node:test` via `tsx --test` (novo) | `tests/baseline.test.ts`, 38 testes |
| Export | exceljs | Mantido do módulo original |

## 4. Arquitetura

```text
Usuário → Next.js App Router (React 19, client components)
            ↓
proxy.ts (autenticação de sessão + checagem de user.active)
            ↓
Rotas de API (runtime nodejs) → requirePermission() (RBAC) → Prisma Client
            ↓                                                      ↓
src/modules/**/server.ts (regras de negócio por módulo)      PostgreSQL
            ↓
document-worker.ts (processo separado, fila de OCR/extração via DocumentExtractionJob)
```

Diferença estrutural principal frente à versão antiga: a lógica de negócio migrou de "tudo dentro da rota de API" para `src/modules/<área>/server.ts`, com rotas de API finas que só validam permissão e delegam. Há também, pela primeira vez, um **processo assíncrono separado** (`document-worker.ts`, container Docker próprio) — a aplicação deixou de ser um monólito single-process.

## 5. Páginas

| Rota | Status vs. `master` |
|---|---|
| `/` | Existente (Extração) |
| `/login` | Existente |
| `/usuarios` | Existente |
| `/redefinir-senha` | **NOVA** |
| `/cadastros` | **NOVA** |
| `/cadastros/colaboradores` | **NOVA** |
| `/pagamentos` | **NOVA** (hub de Contas a Pagar) |
| `/pagamentos/[id]` | **NOVA** |
| `/pagamentos/[id]/validacao` | **NOVA** |
| `/pagamentos/vale-transporte` | **NOVA** |
| `/pagamentos/alimentacao` | **NOVA** |
| `/contabilidade/folha` | **NOVA** |

Não existe uma página "Dashboard" dedicada — `/pagamentos` cumpre esse papel para Contas a Pagar (cards de navegação para cada seção de despesa), e `/` cumpre para Extração. Ver tabela completa com proteção por rota na seção do Apêndice (routes table já publicada em `RELATORIO-RECUPERACAO-VS-MASTER.md`, reaproveitada aqui).

## 6. APIs

50 rotas de API no total (41 novas + 9 preexistentes). Ver mapeamento completo por módulo nas seções 11-15 e a tabela de proteção RBAC na seção 10.

## 7. Banco

- 3 tabelas (`master`) → **40 tabelas** (37 models novos + `Upload`/`User`/`Session` preservados).
- `User` ganhou `active` (boolean) e `lastLoginAt`.
- Nenhuma tabela ou coluna antiga foi removida — só extensão aditiva.
- **Não validado contra o banco real** nesta sessão (ver seção 28 — sem acesso a `DATABASE_URL` de produção a partir deste ambiente remoto).

## 8. Models

37 models novos, agrupados por domínio:
- **RBAC**: `Role`, `Permission`, `UserRole`, `RolePermission`
- **Auditoria/segurança**: `PasswordResetToken`, `UserAccessAudit`
- **Master data**: `Company`, `Branch`, `Supplier`, `AdministrativeEntity`, `Project`, `Contract`, `CostCenter`, `Department`, `Category`, `LedgerAccount`
- **Contas a Pagar (núcleo)**: `FinancialSequence`, `FinancialRecord`
- **Alimentação**: `FoodUnitPriceConfig`, `FoodCompetence`, `FoodBatch`, `FoodAllocation`, `FoodBatchIssue`, `FoodEmployee`, `FoodEmployeeAlias`, `FoodMealOccurrence`, `FoodBatchRevision`
- **Vale Transporte**: `TransitVoucherCompetence`, `TransitVoucherMap`, `TransitVoucherAllocation`, `TransitVoucherIssue`
- **Documentos/OCR**: `FinancialDocumentFile`, `DocumentExtractionJob`, `DocumentExtraction`, `DocumentValidationReview`, `DocumentValidationField`
- **Aprovação**: `ApprovalPolicy`, `ApprovalPolicyStep`, `ApprovalRequest`, `ApprovalStepInstance`

19 enums novos (`RecordLifecycleState`, `DocumentState`, `ExtractionState`, `ValidationState`, `ApprovalState`, `PaymentState`, `ReceiptState`, `ReconciliationState`, `AllocationState`, `AccountingState`, `FinancialFileKind`, `ExtractionJobState`, `ValidationDecision`, `ApprovalRequestStatus`, `ApprovalStepStatus`, `FoodBatchStatus`, `FoodOccurrenceValidationStatus`, `FoodOccurrenceMatchMethod`, `FoodOccurrenceDisposition`, `EntryOrigin`).

## 9. Migrations

28 migrations novas, de `20260816120000_add_rbac` a `20260826110000_user_access_management`. Sequência lógica: RBAC → master data → registros financeiros (+ seeds de permissão) → documentos financeiros → jobs de extração → validação de documento → workflow de aprovação (+ seed) → entidades administrativas → vínculo entre entidades e Contas a Pagar → simplificação da criação de obrigação → Alimentação (lote, preço por fornecedor, mapas de vale-transporte, revisão MA, edição MA, ocorrências PA) → vale-transporte (expansão de rateio, revisão de pendência) → ciclos de alimentação → colaboradores mestres → soft delete → rastreio de merge de colaborador → normalização de rótulos organizacionais → quantidade de refeição → gestão de acesso de usuário.

Nenhuma dessas migrations foi executada contra um banco real nesta sessão — só `prisma generate`/`prisma validate` (leitura de schema).

## 10. RBAC

**Conclusão da auditoria antiga (obsoleta)**: "não existe RBAC, todo usuário tem os mesmos poderes."

**Situação real, auditada agora**:

```
Role (6: ADMIN, REQUESTER, ANALYST, APPROVER, FINANCE, CONTROLLER)
  ↓ RolePermission
Permission (14 chaves: users.read/create/delete, roles.manage, accounting.read/upload,
            master-data.read/manage, financial-records.read/create/update/delete,
            document-validation.read/manage)
  ↓ UserRole (N:N usuário↔papel)
User
```

- `ADMIN` recebe **todas** as permissões automaticamente (`SELECT 'role_admin', id FROM Permission` na migration seed) — não precisa ser listado permissão por permissão.
- Os demais papéis têm escopos claramente diferenciados (ex.: `REQUESTER` cria e lê, mas não deleta; só `ADMIN`/`ANALYST` têm `financial-records.delete`; só `ADMIN`/`APPROVER` têm `approvals.act`).
- **Enforcement é no backend**: `requirePermission()` (`src/lib/auth/permissions.ts`) é chamado em **praticamente toda rota de API** que não é auth pública — confirmado por varredura: das 50 rotas de API, as únicas sem `requirePermission`/`requireUser` são `login`, `logout`, `me` e `password-reset` (as 4 legitimamente públicas/self-service). Isso não é "esconder botão no frontend" — uma chamada direta à API sem a permissão certa recebe 401 (sem sessão) ou 403 (sem permissão), mesmo que o usuário engane o frontend.
- `getSessionUser()` já carrega `roles → role → permissions → permission` numa única query, então a checagem de permissão não faz round-trip extra ao banco por request.
- Conta desativada (`active = false`) é bloqueada tanto no login quanto na leitura de sessão (`getSessionUser`) e no `proxy.ts` — uma sessão "viva" de uma conta desativada para de funcionar imediatamente, sem esperar expirar.

**Veredito**: RBAC real, com enforcement correto no backend. A conclusão da auditoria antiga está **obsoleta** para esta versão.

## 11. Contas a pagar (núcleo)

- Página hub: `/pagamentos`. Ciclo de vida genérico de uma obrigação: `RecordLifecycleState` (extração → validação → aprovação → pagamento → recibo → conciliação → contabilização), cada etapa com seu próprio enum de estado.
- `FinancialRecord` é o registro central; `FinancialSequence` gera identificadores sequenciais.
- Soft delete (migration `accounts_payable_soft_delete`) — nada é apagado fisicamente, preserva auditoria.
- APIs: `/api/financial-records`, `/api/financial-records/[id]`, `/api/financial-records/[id]/files`, `/api/financial-records/[id]/validation`, `/api/financial-files/[fileId]`, `/api/financial-files/[fileId]/reprocess`.

## 12. Alimentação

- Página: `/pagamentos/alimentacao`. Dois ciclos regionais (MA/PA), cada um com regras próprias de matching/revisão.
- `FoodBatch` → `FoodAllocation` (rateio por colaborador) → `FoodBatchIssue` (pendência a resolver).
- Preço por fornecedor (`FoodUnitPriceConfig`), deduplicação de colaborador via `FoodEmployeeAlias`.
- 13 rotas de API (`/api/accounts-payable/food/**`) — upload, lançamento manual, edição, finalização de revisão MA, download individual/consolidado, template.

## 13. Vale Transporte

- Página: `/pagamentos/vale-transporte` — a que recebeu o ajuste de layout da Fase 3/PR #1.
- `TransitVoucherMap` (um upload/versão) → `TransitVoucherAllocation` (rateio empresa→departamento→colaborador) → `TransitVoucherIssue` (pendência).
- Upload de XLSX/CSV ou lançamento manual, com seleção múltipla de colaboradores e ajuste individual de valores.
- `Summary` (a barra de indicadores) já está posicionada após a seção Rateio (PR #1, ainda não mesclado).
- 10 rotas de API (`/api/accounts-payable/transit-voucher/**`).

## 14. OCR

**Conclusão da auditoria antiga (obsoleta)**: "OCR ainda não está disponível nesta versão do sistema" (mensagem hardcoded, sem implementação real).

**Situação real, auditada agora**:
- **Biblioteca**: `tesseract.js` 7 (engine LSTM), com `@napi-rs/canvas` para rasterizar páginas de PDF em imagem (`createCanvas`, integrado ao `pdfjs-dist` via `page.render`).
- **Onde é usado**: `src/modules/documents/server/ocr.ts` (`ocrImage`, `ocrScannedPdf`), consumido por `scripts/document-worker.ts` — um **worker separado**, não a rota de upload em si.
- **Tipos de arquivo**: PDF (tenta extração nativa via `pdfjs-dist` primeiro; só aciona OCR se `hasExtractableText` for falso — mesma lógica de detecção do módulo de Extração original) e imagens (`image/*`, direto para OCR). XML é lido nativamente, sem OCR.
- **Fluxo**: upload → `FinancialDocumentFile` salvo em storage privado → `DocumentExtractionJob` criado com estado `PENDING` → `document-worker.ts` faz polling (`claim()` via transação com `updateMany` para evitar dois workers pegarem o mesmo job) → processa → grava `DocumentExtraction` com `rawText`, `engine`, `extractionConfidence`, e campos estruturados (CNPJ com validação de dígito verificador, datas, valores monetários, chave de acesso de NF-e).
- **Limite/fallback**: PDF com mais de 25 páginas rejeita OCR automático (`throw new Error`). Confiança abaixo de 0,65 marca o job como `REVIEW_REQUIRED` em vez de `SUCCESS` — não finge certeza que não tem.
- **Armazenamento**: fora de `/public`, em `PRIVATE_STORAGE_ROOT` (volume Docker dedicado `financeiro_private_storage`), não exposto publicamente.
- **Tratamento de erro**: se o tipo de arquivo não é PDF/imagem/XML reconhecido, cai em `engine = "metadata-only"`, `state = "REVIEW_REQUIRED"` — degrada graciosamente em vez de falhar a fila inteira.
- **Dependências externas**: nenhuma API externa — tudo roda local (Tesseract WASM), sem custo por chamada nem dependência de terceiro online.

**Veredito**: OCR real e razoavelmente bem desenhado (fallback de confiança, worker dedicado, não bloqueia a requisição HTTP). A conclusão da auditoria antiga está **obsoleta**.

## 15. Aprovação

- Models: `ApprovalPolicy` → `ApprovalPolicyStep` (etapas configuráveis) → `ApprovalRequest` (uma solicitação, ligada a um `FinancialRecord`) → `ApprovalStepInstance` (progresso por etapa).
- Permissões dedicadas: `approvals.read`, `approvals.act`, `approvals.manage` — `APPROVER` tem `read`+`act`; só `ADMIN` tem `manage` (configurar as políticas).
- Migration de seed (`seed_approval_defaults`) já cria uma política padrão.

## 16. Uploads

- Extração original (`/api/extract`, `/api/uploads`) preservada, ainda usa `Upload.data: Json` — não migrou para o novo modelo `FinancialRecord`/`DocumentExtractionJob`.
- Novo fluxo de upload (Contas a Pagar) usa storage privado (`PRIVATE_STORAGE_ROOT`) + fila assíncrona, diferente do fluxo síncrono do módulo de Extração original. **Os dois fluxos de upload coexistem, com arquiteturas diferentes** — vale registrar como possível trabalho futuro de unificação, não bloqueia nada agora.

## 17. Fornecedores

- Model `Supplier`, ligado a `AdministrativeEntity` (que é quem efetivamente recebe a obrigação financeira). Gerenciado via `/cadastros` e API `/api/administrative-entities`.

## 18. Pagamentos

- `/pagamentos` é o hub; `PaymentState` (enum) rastreia o estado de pagamento dentro do ciclo de vida do `FinancialRecord`. Não há integração bancária/gateway de pagamento identificada — é controle de estado interno, não pagamento automatizado.

## 19. Rateios

- Vale Transporte: rateio por Empresa → Departamento → Colaborador (`TransitVoucherAllocation`).
- Alimentação: rateio por localidade/colaborador (`FoodAllocation`), com exportação consolidada por competência.
- Ambos exportam XLSX (`exceljs`) — mesma lib usada no módulo de Extração original.

## 20. Integrações

- **E-mail**: SMTP via `nodemailer` (variáveis `SMTP_HOST/PORT/USER/PASSWORD`, `MAIL_FROM`) — usado só no reset de senha.
- **Nenhuma integração de pagamento, ERP externo ou API de terceiros online** foi identificada (o OCR roda 100% local).

## 21. Docker

- Node base: 20 → 22.
- **Novo serviço** `document-worker` (container próprio, roda `document-worker.ts` continuamente).
- **Novos volumes**: `financeiro_private_storage` (documentos), `financeiro_ocr_cache` (cache do Tesseract).
- Segurança de execução melhorada: `su-exec` para trocar para usuário `nextjs` não-root antes de rodar migrations/servidor (antes rodava boot como root até o `chown` final).

## 22. Variáveis de ambiente

Novas em `.env.example` frente à versão antiga: `PRIVATE_STORAGE_ROOT`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Todas com placeholder/vazio — sem segredo real. (Conteúdo completo já auditado em `RELATORIO-RECUPERACAO-VS-MASTER.md`, seção 10.)

## 23. Testes

`tests/baseline.test.ts` — **não existia em `master`**. 38 testes, 0 falhas, cobrindo RBAC, autenticação, Alimentação (MA/PA, consolidado, rateio XLSX), Vale Transporte, colaboradores, design system e shell corporativo. Rodado **após o merge do PR #1** (commit `8535f61`): **PASS 38/38**.

## 24. Build

`npm run build`: **PASS**, 39 rotas geradas (12 estáticas, 27 dinâmicas + proxy), 0 erros, 0 warnings. Rodado novamente após o merge do PR #1 (commit `8535f61`) — resultado idêntico às execuções anteriores (Fase 3 e Fase 4).

Suíte completa pós-merge (Fase 5, Etapa 5): `npm ci` PASS · `prisma validate` PASS · `prisma generate` PASS · `npm run lint` PASS (0 erros, 2 warnings pré-existentes não relacionados ao PR #1, em `EmployeeTable.tsx`/`SinteticoTable.tsx`, incompatibilidade do React Compiler com TanStack Table) · `tsc --noEmit` PASS (0 erros) · `npm run build` PASS · `npm test` PASS (38/38).

## 25. Segurança

| Item | Situação |
|---|---|
| RBAC | Implementado e com enforcement no backend (seção 10); reconfirmado pós-merge — arquivo não tocado pelo PR #1 |
| APIs públicas | Reconfirmado (Fase 5, Etapa 15): apenas `/api/auth/login`, `/api/auth/logout`, `/api/auth/password-reset` não fazem checagem de sessão (esperado). `/api/auth/me` checa sessão e retorna 401 se ausente. Todas as demais ~45 rotas de API usam `requirePermission`/`requireUser`/`getSessionUser`. Nenhuma rota ficou acidentalmente pública. |
| Conta desativável (`active`) | Implementado, checado em login/sessão/proxy |
| Reset de senha | Implementado (e-mail via nodemailer) |
| OCR | Implementado (seção 14); revisão de robustez na seção 14 |
| Segredos versionados | Nenhum encontrado (reconfirmado nesta sessão, ver `RELATORIO-RECUPERACAO-VS-MASTER.md` seção 10) |
| **Rate limiting no login** | **Ainda ausente** — reconfirmado nesta sessão lendo `src/app/api/auth/login/route.ts` linha a linha. Continua sendo um achado válido, não obsoleto. |

### `npm audit` (Fase 5, Etapa 6 — reexecutado pós-merge)

**Total geral** (`npm audit`, inclui devDependencies): 1 crítica, 9 altas, 3 moderadas, 13 total.
**Runtime de produção** (`npm audit --omit=dev`): 1 crítica, 7 altas, 3 moderadas, 11 total.

| Pacote | Severidade | Direto? | Runtime? | Fix disponível |
|---|---|---|---|---|
| `next` | **Crítica** | Sim (direto) | Sim | Sim, sem major bump — RCE não autenticado em servidores Windows e na API de otimização de imagem (AVIF) para `next` `>=16.0.0 <16.3.3` |
| `nodemailer` | Alta | Sim (direto) | Sim | Sim, sem major bump — DoS (complexidade O(n²) no parser de endereço) e bypasses de validação de domínio |
| `fast-uri` (via Prisma) | Alta | Não (transitivo) | Sim | Sim, sem major bump — SSRF/confusão de host |
| `sharp` (via `@napi-rs/canvas`/pipeline de imagem) | Alta | Não (transitivo) | Sim | Sim, sem major bump — vulnerabilidades em `libheif` |
| `mysql2`, `@prisma/config`, `deepmerge-ts`, `prisma` | Alta | `prisma` direto; demais transitivos (toolchain Prisma) | `prisma`/`@prisma/config` não são runtime de produção real (CLI); `mysql2`/`deepmerge-ts` são transitivos do driver Prisma, não usados (o projeto usa `@prisma/adapter-pg`/Postgres) | Só com major bump (`prisma@6.19.3`, downgrade de major — não recomendado às cegas) |
| `exceljs` | Moderada | Sim (direto) | Sim | Só com major bump (`exceljs@3.4.0`) |
| `uuid` (via `exceljs`) | Moderada | Não (transitivo) | Sim | Só com major bump (via `exceljs`) |
| `baseline-browser-mapping` | Moderada | Não (transitivo, toolchain) | Não (build-time) | Sim, sem major bump |

**Conclusão:** a vulnerabilidade crítica está em `next` (dependência direta, runtime de produção) e tem fix disponível sem breaking change — atualizar para `>=16.3.3` é recomendado antes de produção, mas **não foi aplicado nesta sessão** (alteração de dependências fora do escopo autorizado da Fase 5). As vulnerabilidades altas em `nodemailer`, `fast-uri` e `sharp` também têm fix sem major bump. As relacionadas a `prisma`/`mysql2`/`@prisma/config`/`deepmerge-ts`/`exceljs`/`uuid` exigem bump de major version — não corrigidas automaticamente por decisão de escopo (proibição de alterar dependências nesta fase).

## 26. Problemas conhecidos

1. Rate limiting de login ainda não implementado (P1 herdado da auditoria antiga, ainda válido).
2. Dois fluxos de upload/extração paralelos com arquiteturas diferentes (síncrono antigo vs. fila assíncrona nova) — ver seção 16.
3. `npm audit`: vulnerabilidade crítica em `next` (runtime, direto, fix sem major disponível) — recomenda-se atualizar antes de produção. Ver tabela da seção 25.
4. Migrations nunca validadas contra o banco real a partir desta sessão remota (seção 28) — bloqueador para decidir integração final.
5. `scripts/document-worker.ts`: `terminateOcrWorker()` só é chamado no encerramento gracioso do loop principal (`SIGTERM`/`SIGINT`); se `main()` rejeitar de forma não tratada (linha 82, `.catch`), o processo Tesseract iniciado por `getWorker()` não é finalizado explicitamente antes do `process.exitCode = 1` — potencial worker órfão em caso de crash fatal do processo Node (não de um job individual, que já tem tratamento de erro próprio). Não corrigido nesta fase (fora do escopo — nenhuma alteração de código de OCR foi autorizada).
6. `scripts/document-worker.ts`: não há timeout explícito por chamada de `worker.recognize()`/OCR — uma chamada travada só é recuperada pelo mecanismo de lease de 10 minutos (linha 77), que devolve o job para a fila, mas não interrompe o processo OCR em execução. Documentado como observação de robustez, não como bug ativo.

## 27. Conclusões obsoletas das auditorias anteriores

| Documento antigo | Conclusão antiga | Situação atual | Status |
|---|---|---|---|
| `AUDITORIA-COMPLETA-PROJETO.md` | 3 models Prisma (`Upload`, `User`, `Session`) | 40 models (37 novos) | **OBSOLETA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | 3 páginas (`/`, `/login`, `/usuarios`) | 12 páginas | **OBSOLETA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | "sem RBAC (todo usuário logado tem acesso total)" | RBAC completo, enforcement no backend (seção 10) | **OBSOLETA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | "OCR não implementado" | OCR real via Tesseract.js + worker dedicado (seção 14) | **OBSOLETA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | "sem reset de senha" | Fluxo completo implementado (seção 22 do relatório antigo → seção 11 daqui) | **OBSOLETA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | "sem rate limiting no login" | Ainda verdade — reconfirmado nesta auditoria | **AINDA VÁLIDA** |
| `AUDITORIA-COMPLETA-PROJETO.md` | Único módulo: Extração de folha de pagamento | Extração + RBAC + Contas a Pagar (Vale Transporte, Alimentação) + OCR + Aprovação + Cadastros | **OBSOLETA** |
| `PLANO-RETOMADA-FASE-2.md` | "sem script `typecheck`/`test` no package.json" | Ambos existem agora (`npm run typecheck`, `npm test`) | **OBSOLETA** |
| `PLANO-RETOMADA-FASE-2.md` | Backlog P1 "Implementar RBAC mínimo (ADMIN/USER)" | Já implementado, e de forma mais granular (6 papéis, 14 permissões) do que o mínimo sugerido | **OBSOLETA (superada)** |
| `PLANO-RETOMADA-FASE-2.md` | Backlog P1 "Rate limiting no login" | Ainda pendente | **AINDA VÁLIDA** |

Os dois documentos antigos continuam preservados (não apagados), na branch `claude/modest-mccarthy-s7gkqc`, como registro histórico de quando a análise foi feita sobre a versão incompleta.

## 28. Estado do banco real e smoke tests (COMANDOS PARA EXECUÇÃO LOCAL)

**Não validado nesta sessão, em nenhuma das duas fases (4 e 5).** Esta é uma sessão remota (sandbox isolada), sem daemon Docker (`/var/run/docker.sock` inexistente, reconfirmado na Fase 5) e sem acesso à `DATABASE_URL` real de produção. Por instrução explícita do usuário: **nenhum resultado de banco/smoke test foi inventado ou inferido** — os itens abaixo continuam **NÃO VALIDADO** / **NÃO EXECUTADO**, com os comandos exatos, somente leitura, para você rodar localmente.

### 28.1 Migrations e integridade (`_prisma_migrations`)

```cmd
docker exec -it extrato-mensal-web npx prisma migrate status
```

ou, fora do container, com a `DATABASE_URL` real exportada no shell:

```cmd
npx prisma migrate status
```

Consulta somente leitura direto na tabela de controle (rodar via `psql` ou cliente equivalente, apontando para o banco real):

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at;
```

Isso confirma: se as 28 migrations novas estão aplicadas; se há divergência de hash/checksum (migration alterada depois de aplicada); se há migration "não encontrada no diretório" (aplicada no banco, ausente em `prisma/migrations` local); se há `rolled_back_at` preenchido (rollback parcial) ou `applied_steps_count` divergente do esperado.

### 28.2 Comparação schema × banco real

Sem alterar nada, gerar um diff somente leitura entre o schema Prisma e a estrutura real do banco:

```cmd
npx prisma migrate diff --from-url "%DATABASE_URL%" --to-schema-datamodel prisma/schema.prisma --script
```

(o `--script` gera apenas o SQL que *seria* necessário para igualar o banco ao schema — não executa nada. Se a saída vier vazia, banco e schema estão idênticos.) Priorizar na leitura manual do resultado, se houver diferenças: `User`, `Session`, `Role`, `Permission`, tabelas de `pagamentos`/`fornecedores`, `alimentação`, Vale Transporte, aprovação, OCR (`DocumentExtractionJob`, `DocumentExtraction`), rateio, uploads/documentos.

### 28.3 Smoke tests (Etapas 17-28) — roteiro local, sem dados reais

Rodar com o ambiente Docker local do usuário, **nunca contra produção real com dados reais de colaboradores**:

1. **Login/Logout/RBAC/rota protegida:** logar com um usuário de cada papel (ADMIN/REQUESTER/ANALYST/APPROVER/FINANCE/CONTROLLER); confirmar redirecionamento para `/login` ao acessar rota protegida sem sessão; confirmar `/api/*` retorna 401/403 (não HTML) para chamadas sem sessão/sem permissão.
2. **Usuários:** tentar operações de `/api/users` com um usuário sem `users.create`/`users.delete`/`roles.manage` — confirmar 403 no backend, não apenas item de menu escondido no frontend.
3. **Contas a Pagar / Alimentação:** usar apenas fixtures sintéticas (nunca arquivo real de colaboradores) — reaproveitar `tests/fixtures/Mascara_Vale_Transporte.xlsx` (já confirmado sintético) para os testes de Vale Transporte; para Alimentação, gerar uma planilha sintética equivalente antes de testar upload/lote/competência/resumo/download de máscara.
4. **Vale Transporte:** confirmar em `/pagamentos/vale-transporte` que o `Summary` não aparece mais no topo (efeito do PR #1); estado vazio deve mostrar "Nenhum arquivo processado nesta competência." com Empresas:0/Colaboradores:0/Departamentos:0/Valor total:R$0,00; com a fixture sintética carregada, confirmar números reais recalculados e `Summary` no final da página, após a seção "Rateio".
5. **Aprovação:** criação → pendente → aprovação/rejeição/correção → conclusão, validando RBAC em cada transição de estado.
6. **Fornecedores:** leitura, filtros, CRUD com permissão adequada; **nunca excluir um fornecedor real**.
7. **Exportações:** conferir que os dados exportados batem com os dados exibidos na UI, e que os filtros aplicados na tela são respeitados no arquivo exportado; se houver divergência, documentar, não corrigir automaticamente.
8. **Logs/console:** observar durante todo o roteiro acima por 500/401/403/404 inesperados, erros de hidratação, warnings do React, exceções do Prisma, erros do worker de OCR, promise rejections não tratadas, stack traces expostos na resposta HTTP (nenhuma API deveria devolver `technicalStack` ao cliente — conferir especificamente as respostas de erro do fluxo de extração de documentos, já que `errorMessage`/`technicalStack` são persistidos no banco pelo `document-worker.ts`, seção 26 item 5/6).
9. **Integridade pós-teste:** verificar registros órfãos, FKs quebradas, sessões expiradas não limpas, uploads incompletos, duplicatas, transações parciais — **apenas relatar, nunca limpar automaticamente**.

Me cole a saída de cada comando/roteiro assim que rodar, e eu sigo a análise a partir do resultado real, sem supor nada.

## 29. Plano para integração com master

### Tamanho do diff
181 arquivos, +13415/-1144 linhas, 0 remoções de arquivo — puramente aditivo sobre o que já existia em `master`.

### Riscos
- Nenhum conflito de merge esperado a nível de Git: `master` não recebeu nenhum commit desde que `recuperacao/codigo-completo` foi criada a partir dele, então o merge/PR deve ser "fast-forward-like" (sem divergência real para resolver).
- O risco real não é o merge do Git — é o **banco de dados**: 28 migrations precisam ser aplicadas onde quer que `master` vá rodar depois. Isso só é seguro depois da confirmação pedida na seção 28.

### Estratégia recomendada
**Concordo com sua preferência**: manter como **um único PR de recuperação** (`recuperacao/codigo-completo` → `master`), não fatiar em dezenas de PRs. Os módulos são interdependentes de verdade (RBAC é pré-requisito de tudo; Contas a Pagar depende de entidades administrativas e colaboradores; OCR depende do storage privado) — decompor artificialmente aumentaria o risco de deixar o sistema num estado inconsistente entre PRs, sem ganhar nada em segurança real, já que não há conflito de merge a resolver.

### Gate de prontidão para master (Fase 5, Etapa 32)

| Gate | Critério | Status |
|---|---|---|
| Lint | PASS | ✅ **PASS** |
| TypeScript | PASS | ✅ **PASS** |
| Build | PASS | ✅ **PASS** |
| Testes | PASS | ✅ **PASS** (38/38) |
| Prisma validate | PASS | ✅ **PASS** |
| Migrations íntegras | Confirmado contra o banco real | ⛔ **NÃO VALIDADO** (sem acesso a Docker/DB nesta sessão — seção 28.1) |
| Banco × schema compatível | Confirmado contra o banco real | ⛔ **NÃO VALIDADO** (seção 28.2) |
| Smoke test | PASS | ⛔ **NÃO EXECUTADO** (seção 28.3) |
| RBAC validado | Backend, não só frontend | ✅ **VALIDADO** (código-fonte, seção 10 e 25) |
| Nenhum segredo versionado | Confirmado | ✅ **CONFIRMADO** |
| Nenhuma regressão crítica encontrada | Confirmado | ✅ **NENHUMA ENCONTRADA** (no que pôde ser validado por código/build/testes automatizados) |

**Veredito: gate NÃO totalmente satisfeito.** 3 dos 11 critérios (migrations íntegras, banco×schema compatível, smoke test) dependem de acesso ao banco de dados e ambiente real, que esta sessão remota não tem. Por essa razão, **o PR único `recuperacao/codigo-completo` → `master` não foi aberto nesta fase**, conforme a própria regra da solicitação: só abrir se todos os gates estiverem aprovados.

### Ordem para destravar o PR final
1. ~~Mesclar PR #1~~ — **feito** (commit `8535f61`, Fase 5 Etapa 4).
2. Rodar os comandos da seção 28.1/28.2 (`prisma migrate status`, diff schema×banco, query em `_prisma_migrations`) no ambiente real e colar a saída aqui.
3. Rodar o roteiro de smoke test da seção 28.3 no ambiente real (com fixtures sintéticas) e colar os resultados.
4. Com os 3 gates restantes fechados, abro o PR único `recuperacao/codigo-completo` → `master`, com este documento e o `RELATORIO-RECUPERACAO-VS-MASTER.md` linkados na descrição — e paro ali, aguardando sua revisão (sem merge automático, sem deploy).

### Possibilidade de rollback
- A tag `recovery-baseline-2026-09` marca o commit `762fd08` (estado recuperado antes do merge do PR #1) — serve como ponto de retorno caso algo dê errado. **O push da tag para o remoto continua bloqueado nesta sessão (HTTP 403, reconfirmado na Fase 5)** — não é um problema do projeto, é uma restrição desta sessão remota. Comando exato para você rodar localmente:
  ```
  git fetch origin recuperacao/codigo-completo
  git tag -a recovery-baseline-2026-09 762fd08801ea9133554d85376ff570ebec8685ad -m "Baseline de recuperação antes do merge do PR #1"
  git push origin recovery-baseline-2026-09
  ```
  (a tag já existe localmente nesta sessão apontando para o commit correto — não foi recriada em outro commit para contornar o bloqueio, conforme instruído.)
- Se for necessário reverter depois do merge do PR #1: `git revert -m 1 8535f61` em `recuperacao/codigo-completo`, ou `git reset --hard 762fd08` seguido de force-push **somente com autorização explícita sua**, já que é uma operação destrutiva.
- `master` atual continua intacto e recuperável a qualquer momento (`git checkout master`), já que nada foi mesclado nele ainda.
