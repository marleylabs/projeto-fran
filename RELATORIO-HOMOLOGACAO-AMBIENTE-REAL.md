# Relatório de Homologação em Ambiente Real — Fase 6

> Gerado a partir da sessão remota (sandbox isolada, sem Docker e sem `DATABASE_URL` real). Todos os itens que dependem de banco de dados ou de um ambiente rodando estão marcados como **NÃO VALIDADO** / **NÃO EXECUTADO**, com os comandos exatos para você rodar localmente. Nenhum resultado foi inventado ou inferido a partir de código-fonte no lugar de execução real.

Branch avaliada: `recuperacao/codigo-completo`
HEAD no momento desta fase: `0b352c7` (commit de documentação sobre `8535f61`, que incorporou o PR #1)
Baseline de segurança: tag `recovery-baseline-2026-09` → commit `762fd08801ea9133554d85376ff570ebec8685ad`

---

## 1. Ambiente utilizado

Esta sessão remota **não tem** daemon Docker (`/var/run/docker.sock` inexistente) nem `DATABASE_URL` configurada. Confirmado nesta fase:

```
docker ps -a → falha: "no such file or directory" (sem daemon Docker acessível)
DATABASE_URL → não definida no ambiente desta sessão
```

Todo item de banco/smoke test abaixo precisa ser executado por você, na máquina onde o Docker/PostgreSQL real roda, seguindo os comandos desta seção.

## 2. Database validada

**NÃO VALIDADO.** Não foi possível identificar/conectar ao Postgres real desta sessão. Comandos para você confirmar localmente, sem expor segredos:

```bash
# Nos containers do projeto (nomes conforme docker-compose.yml do projeto)
docker compose ps
docker inspect <container-web> --format '{{json .Config.Env}}' | tr ',' '\n' | grep -i DATABASE_URL | sed -E 's/(:\/\/)[^@]+@/\1***:***@/'
```

Isso mostra a `DATABASE_URL` com usuário/senha mascarados — cole apenas a confirmação `DATABASE_URL configurada: SIM`, sem colar o valor real.

Para confirmar que é o banco correto (o que alimenta Contas a Pagar/Alimentação/Vale Transporte/RBAC/OCR), rodar dentro do container da aplicação:

```bash
docker exec -it <container-web> npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('FinancialRecord','FoodBatch','TransitVoucherMap','Role','DocumentExtractionJob');"
```

Se as 5 tabelas aparecerem, é o banco certo.

## 3. Prisma migrate status

**NÃO EXECUTADO nesta sessão.** Comando exato, somente leitura:

```bash
docker exec -it <container-web> npx prisma migrate status
```

ou fora do container, com a `DATABASE_URL` real exportada no shell:

```bash
npx prisma migrate status
```

Classificar o resultado como: `ATUALIZADO` (todas aplicadas, sem pendências) / `PENDENTE` (há migrations não aplicadas) / `DIVERGENTE` (hash/checksum não bate) / `ERRO` (falha de conexão ou schema). **Cole a saída aqui e eu classifico e sigo a análise.**

## 4. `_prisma_migrations`

**NÃO EXECUTADO.** Query somente leitura para rodar via `psql` (ou `prisma db execute`) contra o banco real:

```sql
SELECT
    migration_name,
    started_at,
    finished_at,
    rolled_back_at,
    applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at;
```

Com o resultado, monto a tabela comparativa migration-a-migration:

| Migration | Repositório | Banco | finished_at | rollback | Situação |
|---|---|---|---|---|---|

Classificações a aplicar: `OK` / `PENDENTE` / `AUSENTE NO REPOSITÓRIO` / `INCOMPLETA` (`finished_at IS NULL`) / `ROLLBACK` (`rolled_back_at IS NOT NULL`) / `DIVERGENTE`.

Se o `prisma migrate status` (seção 3) reportar algo como `"migration ... was modified after it was applied"`, isso é classificado automaticamente como **BLOQUEIO** — não executar `migrate resolve` para contornar; me avisar.

## 5. Banco × schema (drift)

**NÃO EXECUTADO.** Comando somente leitura (gera apenas o SQL que *seria* necessário — não aplica nada):

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Saída vazia = banco e schema idênticos. Qualquer diferença, colar aqui para eu classificar por tabela/coluna/enum/PK/FK/index/unique/default/nullability/cascade — sem tentar corrigir.

## 6. Models

Inventário feito por leitura estática do `prisma/schema.prisma` nesta sessão (isso não depende de banco):

- **43 models**, **20 enums** no schema atual (contagem anterior de "~37 models/19 enums" era aproximada; a contagem exata agora é 43/20).
- 31 diretórios de migration no repositório (contagem anterior de "~28" também era aproximada; o total real é 31 — lista completa abaixo).
- Todos os models prioritários confirmados presentes no schema: `User`, `Session`, `Role`, `Permission` · `FinancialRecord` (pagamentos) · `Supplier` (fornecedores) · `Upload`/`FinancialDocumentFile` (uploads) · `DocumentExtractionJob`/`DocumentExtraction`/`DocumentValidationReview`/`DocumentValidationField` (documentos/OCR) · `ApprovalPolicy`/`ApprovalRequest`/`ApprovalStepInstance` (aprovação) · `FoodCompetence`/`FoodBatch`/`FoodAllocation`/`FoodEmployee` (alimentação) · `TransitVoucherCompetence`/`TransitVoucherMap`/`TransitVoucherAllocation` (Vale Transporte) · `FoodAllocation`/`TransitVoucherAllocation` (rateios).
- **Correspondência real no banco: NÃO VALIDADA** (depende da seção 5).

Lista completa das 31 migrations (ordem cronológica):

```
01  20260708193258_init
02  20260708195340_add_duplicate_keys
03  20260709121503_add_auth
04  20260816120000_add_rbac
05  20260816130000_add_master_data
06  20260816150805_add_financial_records
07  20260816152000_seed_financial_permissions
08  20260816152124_add_financial_documents
09  20260816153349_add_extraction_jobs
10  20260817191222_add_document_validation
11  20260817192000_seed_validation_permissions
12  20260817192406_add_approval_workflow
13  20260817193000_seed_approval_defaults
14  20260817203000_add_administrative_entities
15  20260817213000_link_accounts_payable_entities
16  20260817223000_simplify_accounts_payable_creation
17  20260818120000_add_food_accounts_payable
18  20260818170000_food_pricing_by_supplier
19  20260818200000_add_transit_voucher_maps
20  20260819100000_add_food_ma_review
21  20260819170000_add_food_ma_editing
22  20260820100000_add_food_pa_occurrence_details
23  20260820210000_expand_transit_voucher_allocation
24  20260820230000_add_transit_voucher_issue_review
25  20260820233000_add_food_ma_cycles
26  20260820234500_master_collaborators
27  20260820235900_accounts_payable_soft_delete
28  20260821180000_add_collaborator_merge_tracking
29  20260825120000_normalize_organizational_labels
30  20260825170000_add_food_meal_quantity
31  20260826110000_user_access_management
```

Nenhum arquivo de migration foi alterado nesta fase.

## 7–15. Smoke tests (Login, RBAC, Usuários, Contas a Pagar, Alimentação, Vale Transporte, OCR, Aprovação, Fornecedores, Exportações)

**NÃO EXECUTADO** — sem ambiente rodando acessível desta sessão. Roteiro completo, com critérios de aceite exatos, já documentado na Fase 5 e reafirmado aqui (seção 28.3 de `ESTADO-ATUAL-PROJETO-RECUPERADO.md`). Resumo do que validar e como, por área:

| Área | O que confirmar | Evidência esperada |
|---|---|---|
| Login/Logout | login válido → sessão → home; login inválido → erro controlado; logout → sessão invalidada; rota protegida sem login → redirect | print/log de cada fluxo |
| RBAC | usuário comum recebe 403 do **backend** (não só UI escondida) ao chamar `/api/users` (criar/excluir), rotas administrativas | response HTTP + status code |
| Usuários | listagem, criação sintética (se seguro), perfil, autorização — sem apagar usuário real | — |
| Contas a Pagar | carregamento, competência, filtros, cards, tabelas, APIs, navegação — sem pagamento real | — |
| Alimentação | abertura, competência, fornecedor, upload (fixture sintética), lotes, colaboradores, setores, rateio, resumo, máscara | — |
| Vale Transporte | hierarquia atual (Upload/Lançamento → Rateio → Summary, **não** mais no topo); estado vazio = "Nenhum arquivo processado nesta competência." + Empresas/Colaboradores/Departamentos/Valor total zerados; com `tests/fixtures/Mascara_Vale_Transporte.xlsx`, números reais + Summary ao final | screenshot antes/depois |
| OCR | upload sintético → extração nativa → fallback OCR → normalização → resultado; observar worker, erros, timeout, confiança, memória (sem teste de carga) | logs do worker |
| Aprovação | criação → pendente → permissão → ação, sem alterar processo real | — |
| Fornecedores | carregamento, consulta, filtros, relação com pagamentos, RBAC — sem excluir fornecedor real | — |
| Exportações | XLSX/CSV/JSON/PDF abrem corretamente; filtros ativos respeitados no arquivo exportado (se não, documentar como bug, não corrigir agora) | arquivos exportados |

## 16. Console/API

**NÃO EXECUTADO.** Durante os smoke tests acima, observar e reportar: 500/401/403/404 inesperados, exceções Prisma, erros de hidratação React, erros do worker OCR, promises não tratadas, stack traces expostos na resposta HTTP (checar especialmente respostas de erro do fluxo de documentos — `technicalStack` nunca deveria ir ao cliente).

## 17. Integridade após smoke test

**NÃO EXECUTADO.** Após os testes, no ambiente usado, consultas somente leitura para: uploads órfãos, sessões inválidas, registros incompletos, duplicidades inesperadas, relações quebradas (FK), transações parcialmente gravadas. Nenhuma limpeza automática deve ser executada — apenas relatar.

## 18. Build

✅ **PASS.** `npm run build` re-executado nesta fase sobre o HEAD `0b352c7`: 39 rotas geradas, 0 erros, resultado idêntico às fases anteriores.

## 19. Testes

✅ **PASS.** `npm test` re-executado: **38/38 PASS**, 0 falhas.

Suíte completa desta fase: `npm run lint` PASS (0 erros, 2 warnings pré-existentes não relacionados) · `npx tsc --noEmit` PASS (0 erros) · `npm run build` PASS · `npm test` PASS (38/38) · `npx prisma validate` PASS.

## 20. Gate master

| Critério | Status |
|---|---|
| Tag baseline preservada | ✅ Existe localmente no SHA correto; push ao remoto bloqueado nesta sessão (ver seção "BASELINE" do relatório final) |
| Prisma migrate status = OK | ⛔ **NÃO VALIDADO** (seção 3) |
| `_prisma_migrations` íntegra | ⛔ **NÃO VALIDADO** (seção 4) |
| Banco × schema compatível | ⛔ **NÃO VALIDADO** (seção 5) |
| Smoke tests críticos PASS | ⛔ **NÃO EXECUTADO** (seções 7-15) |
| Lint PASS | ✅ PASS |
| Typecheck PASS | ✅ PASS |
| Build PASS | ✅ PASS |
| Tests PASS | ✅ PASS |
| Prisma validate PASS | ✅ PASS |
| RBAC PASS (backend) | ✅ Validado por código nesta e na fase anterior — inalterado pelo PR #1 |
| Nenhuma regressão crítica | ✅ Nenhuma encontrada no que pôde ser validado por código/build/testes |

**Pronto para PR com master: NÃO** (4 dos 12 critérios dependem de ambiente real inacessível desta sessão).

## 21. Gate deploy

Distinto do gate master, por definição desta fase:

| Critério adicional para deploy | Status |
|---|---|
| Baseline integrado à master | Depende do gate master (não satisfeito ainda) |
| Vulnerabilidades runtime tratadas | ⛔ **NÃO** — 1 crítica (`next`), 7 altas (runtime) ainda presentes; tratamento planejado separadamente (ver seção "DEPENDÊNCIAS" abaixo), não executado nesta fase por decisão explícita de não misturar com a recuperação |
| Nova validação pós-fix de dependências | Não aplicável ainda |

**Pronto para deploy: NÃO.**

## 22. Bloqueios

```
BLOQUEIO: Prisma migrate status não confirmado contra o banco real.
CAUSA: sessão remota sem acesso a Docker/DATABASE_URL de produção.
EVIDÊNCIA: docker ps -a falha ("no such file or directory"); DATABASE_URL não definida.
RISCO: não é possível confirmar se as 31 migrations do repositório estão de fato aplicadas, ou se há divergência/checksum alterado.
PRÓXIMO PASSO: rodar `npx prisma migrate status` localmente (seção 3) e colar a saída.
```

```
BLOQUEIO: Compatibilidade schema × banco não confirmada.
CAUSA: mesma limitação de ambiente acima.
EVIDÊNCIA: —
RISCO: divergência estrutural não detectada poderia causar erro em runtime após merge/deploy.
PRÓXIMO PASSO: rodar `npx prisma migrate diff --from-url ... --script` localmente (seção 5) e colar a saída.
```

```
BLOQUEIO: Smoke test funcional não executado.
CAUSA: mesma limitação de ambiente acima.
EVIDÊNCIA: —
RISCO: regressões funcionais (especialmente no fluxo de Vale Transporte alterado pelo PR #1, e nos fluxos de RBAC/OCR) não seriam detectadas antes do merge com master.
PRÓXIMO PASSO: seguir o roteiro das seções 7-15 no ambiente Docker local e reportar os resultados.
```

Nenhuma operação destrutiva foi executada nesta fase. Nenhuma migration foi alterada ou apagada. Nenhum comando `migrate reset`/`db push`/`migrate dev`/`migrate deploy`/`migrate resolve` foi executado.
