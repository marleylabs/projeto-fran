# Relatório de Modernização Visual — Fase 7

Branch: `design/ui-global` (a partir de `recuperacao/codigo-completo` @ `c22f7d8`)
HEAD ao final desta fase: `79b96bd`
Escopo: exclusivamente UI/UX. Nenhuma regra de negócio, API, Prisma, migration, banco, RBAC, autenticação, cálculo, rateio, OCR, exportação, processamento ou máquina de estados foi alterada.

---

## 1. Páginas auditadas

| Rota | Arquivo | Prioridade (inventário) | Ação nesta fase |
|---|---|---|---|
| `/`, `/contabilidade/folha` | `PayrollWorkspace.tsx` | Média | PageHeader + correção de cores hardcoded (error/warning) |
| `/login` | `login/page.tsx` | Baixa | Nenhuma — já 100% aderente ao design system |
| `/redefinir-senha` | `redefinir-senha/page.tsx` | Baixa | Nenhuma — já 100% aderente ao design system |
| `/pagamentos` | `pagamentos/page.tsx` | Média | PageHeader |
| `/pagamentos/[id]` | `pagamentos/[id]/page.tsx` | Média | PageHeader, Badge (estados), EmptyState, correção do token inexistente `danger`→`error` |
| `/pagamentos/[id]/validacao` | `validacao/page.tsx` | **Alta** (OCR) | PageHeader, Badge (confiança), EmptyState, correção `danger`→`error` |
| `/pagamentos/alimentacao` | `alimentacao/page.tsx` | **Alta** | PageHeader (consolidado já estava corretamente no final — confirmado, não movido) |
| `/pagamentos/vale-transporte` | `vale-transporte/page.tsx` | Baixa (já corrigido na Fase 5) | PageHeader, EmptyState (hierarquia preservada e reconfirmada) |
| `/cadastros` | `cadastros/page.tsx` | **Alta** | PageHeader, FilterBar, Badge, EmptyState, inputs/selects migrados para classes do design system, correção de `bg-slate-50` |
| `/cadastros/colaboradores` | `colaboradores/page.tsx` | Média | PageHeader (alteração limitada — arquivo denso, minimizar risco) |
| `/usuarios` | `usuarios/page.tsx` | Média | PageHeader, FilterBar, Badge (perfil/status) |

**Fornecedores** e **Aprovação**: confirmado que **não existem como página própria** — não há rota `/fornecedores` nem `/aprovacao`, nem APIs dedicadas. Por decisão do usuário nesta fase, a modernização foi aplicada apenas nos pontos onde esses conceitos já aparecem embutidos em telas existentes (seleção de fornecedor em `/pagamentos/alimentacao`; estado de aprovação/validação documental em `/pagamentos/[id]/validacao`). Nenhuma rota, API ou fluxo novo foi criado.

## 2. Problemas visuais encontrados

- Tokens de cor ligeiramente fora da identidade pedida (`#8e1515`/`#f7f7f5`/`#171717` vs. `#8C1616`/`#F5F5F5`/`#1A1A1A`).
- Sidebar usava glifos Unicode em vez de `lucide-react`, única biblioteca de ícones já adotada no projeto.
- Duas implementações quase idênticas de card de métrica (`SummaryCards`/`SinteticoSummaryCards`, mesmo `Card` interno duplicado).
- `StatusBadge` e o badge de SIM/NÃO em `/cadastros` usavam cores hardcoded (`emerald-100`, `slate-100`) em vez de tokens semânticos.
- Vários formulários usando classes Tailwind cruas (`rounded-md border border-border px-3 py-2`) em vez das classes `.input`/`.select` do design system já usadas na maior parte do app.
- **Bug de token inexistente**: `/pagamentos/[id]` e `/pagamentos/[id]/validacao` usavam a classe `text-danger`/`border-danger`, que não existe no tema — o texto de erro nunca era colorido. Corrigido para `text-error`/`border-error`, token real já usado no resto do app.
- `PayrollWorkspace.tsx` usava `bg-red-50`/`text-red-800` e `bg-amber-50`/`text-amber-800`/`border-amber-200` hardcoded em vez dos tokens `error`/`warning`.
- Cabeçalho de tabela em `/cadastros` com `bg-slate-50` hardcoded, fora da paleta de tokens.
- Container global sem `max-width`, podendo esticar indefinidamente em telas muito largas.

## 3. Componentes reutilizados (sem alteração de interface)

`Button`, `FeedbackAlert`, `ConfirmModal`, `DeletionModal`, `FloatingActionMenu`, `ToastProvider`, `FileInput`, `SurfaceCard`, `CorporateHeader` (mantido como está — avaliado renomear, decidido não fazer por não trazer benefício visual e aumentar o diff sem necessidade), `ExpenseSectionCard` (já bem construído, não tocado).

## 4. Componentes criados

Todos em `src/components/ui/`, exportados pelo barrel `index.ts`:

| Componente | Uso |
|---|---|
| `PageHeader` | Breadcrumb/voltar + eyebrow + título + descrição + ações. Aplicado em 10 das 11 páginas auditadas (login/redefinir-senha já não precisavam). |
| `MetricCard` | Card de métrica (label/valor/descrição/ícone/accent). `SummaryCards` e `SinteticoSummaryCards` migrados para usá-lo internamente, **mantendo suas interfaces públicas intactas** (nenhum outro arquivo que os consome precisou mudar). |
| `Badge` | Badge com 6 tons semânticos (neutral/primary/success/warning/error/info) mapeados aos tokens existentes. `StatusBadge` migrado para wrapper de `Badge` (mesma interface pública). |
| `EmptyState` | Estado vazio padronizado (título/descrição/ação/ícone). |
| `FilterBar` | Agrupamento visual de filtros (empilha no mobile, grid no desktop) — sem abstrair campos ou regras, como pedido. |

## 5. Tokens alterados

`src/app/globals.css` (raiz e tema daisyUI, mesmo par de variáveis em dois lugares por causa do daisyUI):

| Token | Antes | Depois |
|---|---|---|
| `--color-primary-hover` | `#8e1515` | `#8C1616` |
| `--color-background` | `#f7f7f5` | `#F5F5F5` |
| `--color-neutral-dark` (= `--color-text`) | `#171717` | `#1A1A1A` |
| `.app-content main` `max-width` | `none` | `1500px` + `margin: auto` |

Primária (`#AF1B1B`), cards (`#FFFFFF`), Manrope e Geist Mono já estavam corretos e não foram tocados. Cores funcionais (success/warning/info/error), radius e escala de densidade preservados.

## 6. Navegação

Mantida a arquitetura existente (sidebar fixa no desktop + drawer no mobile, `AppShell.tsx`, alimentada por `NAVIGATION_MODULES`). Nenhum destino, regra de visibilidade, RBAC ou rota foi alterado. Único ajuste: os 5 glifos Unicode (`▤▥◇⚙⌂`) e os ícones de menu/logout foram substituídos por `lucide-react` (`Wallet`, `Calculator`, `Building2`, `Settings`, `LayoutDashboard`, `Menu`, `LogOut`).

## 7. Páginas modernizadas

10 de 11 páginas auditadas receberam ao menos o `PageHeader`; `/cadastros` recebeu a modernização mais completa (formulário, filtros, badges, tabela, estado vazio); `/login` e `/redefinir-senha` não precisaram de nenhuma mudança.

## 8. Responsividade

Revisão de código confirma que o sistema de densidade e os breakpoints existentes (`@media (max-width: 639px)`, `@media (min-width: 1024px)`) já cobrem mobile/desktop de forma consistente; nada nesta fase alterou esse comportamento. **Validação visual real**: só foi possível capturar screenshot de `/login`, a única rota que renderiza sem sessão/banco de dados nesta sessão remota (sem Docker/`DATABASE_URL`, mesma limitação documentada nas Fases 5 e 6). Confirmado nos dois tamanhos capturados (1440px e 390px): sem overflow, cartão centralizado, tokens de cor e tipografia aplicados corretamente. As demais 10 páginas exigem sessão autenticada contra o banco real — não puderam ser abertas nesta sessão; ver seção 15.

## 9. Screenshots

Enviados nesta conversa: `login-1440.png` e `login-390.png` (via Playwright/Chromium pré-instalado, apontando para `npm run dev` local nesta sessão). Demais páginas: **não foi possível gerar** — todas exigem autenticação contra um Postgres real, indisponível nesta sessão remota (mesma restrição de Docker/DB das Fases 5/6). Recomenda-se rodar `npm run dev` localmente com o banco Docker ativo e capturar as páginas autenticadas nos mesmos dois tamanhos.

## 10. Arquivos alterados

21 arquivos, +282/-148 linhas, distribuídos em 8 commits (um por módulo/bloco):

```
b84adb3 style(ui): padronizar tokens globais
b75c94f style(ui): criar componentes base e migrar duplicados existentes
0bfdd7b style(shell): modernizar navegacao e cabecalhos
a1157bd style(payments): modernizar hub de contas a pagar
c6742b4 style(transit): refinar vale transporte
dff6836 style(admin): modernizar cadastros e usuarios
2be4f2e style(payroll): alinhar modulo de folha ao design system
79b96bd test: atualizar asserção de token de background para #F5F5F5
```

## 11. Lint

PASS após cada bloco e ao final. 0 erros, 2 warnings pré-existentes (React Compiler + TanStack Table em `EmployeeTable.tsx`/`SinteticoTable.tsx`), não relacionados a esta fase.

## 12. Typecheck

PASS (`npx tsc --noEmit`, 0 erros) após cada bloco e ao final.

## 13. Build

PASS (`npm run build`, 39 rotas, 0 erros) após cada bloco e ao final.

## 14. Testes

**38/38 PASS.** Um teste (`shell corporativo centraliza identidade...`) falhou uma vez porque verificava o valor antigo do token `--color-background` (`#f7f7f5`); corrigido para o novo valor pedido (`#F5F5F5`) no commit `79b96bd`, já que a mudança de token foi intencional e faz parte do escopo desta fase.

## 15. Pendências visuais

- Screenshots das 10 páginas autenticadas (Contas a Pagar, Alimentação, Vale Transporte, Cadastros, Colaboradores, Usuários, Extrato Mensal, Validação/OCR) não puderam ser gerados nesta sessão — requer banco de dados real. Comando para rodar localmente: `npm run dev` com Docker ativo, depois capturar em 1920/1440/1366/1024/768/430/390px.
- `/cadastros/colaboradores` recebeu apenas a troca de cabeçalho — o restante do arquivo (modais de mesclagem, exclusão, importação) já estava consistente com o design system e não foi tocado, para minimizar risco em um arquivo denso com múltiplos fluxos críticos (exclusão definitiva, mesclagem de colaboradores).
- Validação de densidade/consistência entre módulos (itens 27/28 do pedido original) foi feita por leitura de código, não por comparação visual lado a lado — recomenda-se revisão visual humana após o deploy de preview.

## 16. Próximos passos

1. Revisar esta branch (`design/ui-global`) e, se aprovada, decidir se ela se junta a `recuperacao/codigo-completo` antes ou depois do PR de recuperação para `master` (não fazem parte da mesma decisão — ver Fases 5/6 sobre o gate de recuperação, que continua pendente de validação de banco/smoke test).
2. Rodar `npm run dev` localmente com Docker para capturar as 10 páginas autenticadas pendentes e confirmar visualmente a densidade/consistência entre módulos.
3. Nenhum deploy foi feito; nenhum merge para `master` foi feito; branch aguardando revisão, conforme instruído.
