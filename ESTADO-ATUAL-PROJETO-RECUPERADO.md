# Estado Atual do Projeto — Código Recuperado

> Este documento substitui `AUDITORIA-COMPLETA-PROJETO.md` e `PLANO-RETOMADA-FASE-2.md` como referência principal. Aqueles documentos não foram apagados (ficam preservados no histórico, na branch `claude/modest-mccarthy-s7gkqc`), mas descrevem uma versão do sistema muito mais limitada do que a que realmente estava em produção. Ver seção 27.

Branch auditada: **`recuperacao/codigo-completo`** (HEAD `3d96eb4`)

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

`tests/baseline.test.ts` — **não existia em `master`**. 38 testes, 0 falhas, cobrindo RBAC, autenticação, Alimentação (MA/PA, consolidado, rateio XLSX), Vale Transporte, colaboradores, design system e shell corporativo. Rodado nesta sessão: **PASS 38/38**.

## 24. Build

`npm run build`: **PASS**, 39 rotas geradas (12 estáticas, 27 dinâmicas + proxy), 0 erros, 0 warnings. Rodado duas vezes nesta sessão (Fase 3 e Fase 4), resultado idêntico.

## 25. Segurança

| Item | Situação |
|---|---|
| RBAC | Implementado e com enforcement no backend (seção 10) |
| Conta desativável (`active`) | Implementado, checado em login/sessão/proxy |
| Reset de senha | Implementado (e-mail via nodemailer) |
| OCR | Implementado (seção 14) |
| Segredos versionados | Nenhum encontrado (reconfirmado nesta sessão, ver `RELATORIO-RECUPERACAO-VS-MASTER.md` seção 10) |
| **Rate limiting no login** | **Ainda ausente** — reconfirmado nesta sessão lendo `src/app/api/auth/login/route.ts` linha a linha. Continua sendo um achado válido, não obsoleto. |
| `npm audit` | 13 vulnerabilidades (1 crítica, 9 altas, 3 moderadas) — mesmo padrão já visto antes, majoritariamente toolchain (Prisma CLI), não runtime de produção |

## 26. Problemas conhecidos

1. Rate limiting de login ainda não implementado (P1 herdado da auditoria antiga, ainda válido).
2. Dois fluxos de upload/extração paralelos com arquiteturas diferentes (síncrono antigo vs. fila assíncrona nova) — ver seção 16.
3. `npm audit`: 13 vulnerabilidades, revisão específica recomendada antes de produção (majoritariamente não-bloqueante).
4. Migrations nunca validadas contra o banco real a partir desta sessão remota (seção 28) — bloqueador para decidir integração final.

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

## 28. Estado do banco real

**Não validado nesta sessão.** Esta é uma sessão remota (sandbox isolada) sem acesso à `DATABASE_URL` do ambiente Docker real onde a aplicação roda. Os seguintes itens pedidos (seções 4-8 da solicitação) **não puderam ser executados a partir daqui**:

- `npx prisma migrate status`
- Comparação schema × banco real (tabelas/colunas/tipos/PK/FK/unique/index/enum/default/nullable/cascade)
- Estado da tabela `_prisma_migrations` (aplicadas/pendentes/divergentes/hash incompatível)
- Smoke test funcional contra ambiente real

**Comando exato para você rodar localmente** (na máquina onde o Docker roda, dentro do container ou com a `DATABASE_URL` do ambiente exportada), só leitura, nada destrutivo:

```cmd
docker exec -it extrato-mensal-web npx prisma migrate status
```

ou, fora do container, com a mesma `DATABASE_URL` de produção exportada no shell:

```cmd
npx prisma migrate status
```

Isso vai dizer exatamente:
- se as 28 migrations novas já estão aplicadas no banco real (esperado, já que foi de lá que o container rodando foi construído — mas **isso é inferência, não confirmação**);
- se há qualquer divergência de hash;
- se há migration "não encontrada no diretório" (aplicada no banco mas ausente no `prisma/migrations` local, o que não deveria acontecer já que recuperamos tudo do mesmo checkout, mas vale confirmar).

Me cola a saída assim que rodar, e eu sigo com a análise (seções 6/7/8/10 da sua solicitação) a partir do resultado real, sem supor nada.

## 29. Plano para integração com master

### Tamanho do diff
181 arquivos, +13415/-1144 linhas, 0 remoções de arquivo — puramente aditivo sobre o que já existia em `master`.

### Riscos
- Nenhum conflito de merge esperado a nível de Git: `master` não recebeu nenhum commit desde que `recuperacao/codigo-completo` foi criada a partir dele, então o merge/PR deve ser "fast-forward-like" (sem divergência real para resolver).
- O risco real não é o merge do Git — é o **banco de dados**: 28 migrations precisam ser aplicadas onde quer que `master` vá rodar depois. Isso só é seguro depois da confirmação pedida na seção 28.

### Estratégia recomendada
**Concordo com sua preferência**: manter como **um único PR de recuperação** (`recuperacao/codigo-completo` → `master`), não fatiar em dezenas de PRs. Os módulos são interdependentes de verdade (RBAC é pré-requisito de tudo; Contas a Pagar depende de entidades administrativas e colaboradores; OCR depende do storage privado) — decompor artificialmente aumentaria o risco de deixar o sistema num estado inconsistente entre PRs, sem ganhar nada em segurança real, já que não há conflito de merge a resolver.

Ordem recomendada antes de abrir esse PR:
1. Você mescla o PR #1 (`ajuste/vale-transporte-resumo` → `recuperacao/codigo-completo`) depois de revisar.
2. Você roda `prisma migrate status` no ambiente real (seção 28) e me passa o resultado.
3. Só então abrimos o PR único `recuperacao/codigo-completo` → `master`, com este documento e o `RELATORIO-RECUPERACAO-VS-MASTER.md` linkados na descrição.

### Possibilidade de rollback
- A tag `recovery-baseline-2026-09` (seção 3 da solicitação anterior) marca o commit exato do estado recuperado — serve como ponto de retorno caso algo dê errado depois do merge. **Ainda preciso que você rode o push dela** (ver observação abaixo — o push de tag foi bloqueado nesta sessão).
- `master` atual também continua intacto e recuperável a qualquer momento (`git checkout master`), já que nada foi mesclado nele ainda.
