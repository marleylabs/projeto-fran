// Registro ÚNICO da navegação do App Shell (sidebar, título da aba, trilha do header).
// Regras:
// - Só entram itens com rota real; itens planejados ("planned") não são links e aparecem como "Em breve".
// - Fase 7L: o Dashboard é a Home em "/" (destino do login) e fica disponível a todo usuário autenticado — os blocos de
//   dados da Home é que são condicionados às permissões. A Folha vive só em /contabilidade/folha.
// - `permissions` apenas ESCONDE navegação para quem não tem acesso (qualquer uma basta). O backend continua sendo
//   a autoridade (requirePermission nas APIs); nenhuma regra nova de autorização é criada aqui.
// - Subseções contextuais (Café da Manhã / Cesta Básica dentro de Alimentação) NÃO entram na sidebar.

export type NavigationIconKey = "dashboard" | "food" | "transit" | "training" | "payroll" | "entities" | "collaborators" | "catalog" | "users";

export interface NavigationItem {
  id: string;
  label: string;
  href?: string;
  icon: NavigationIconKey;
  /** Rotas que marcam o item como ativo: "exact:" = só a própria rota; sem prefixo = rota e sub-rotas. */
  matchPaths?: string[];
  permissions?: string[];
  availability: "available" | "planned";
}

export interface NavigationGroup {
  id: string;
  label: string;
  /** Rota da visão do grupo, quando existir (usada como link na trilha do header). */
  href?: string;
  items: NavigationItem[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: "overview",
    label: "Visão geral",
    items: [{ id: "dashboard", label: "Dashboard", href: "/", icon: "dashboard", matchPaths: ["exact:/"], availability: "available" }],
  },
  {
    id: "expenses",
    label: "Despesas",
    href: "/pagamentos",
    items: [
      { id: "food", label: "Alimentação", href: "/pagamentos/alimentacao", icon: "food", matchPaths: ["/pagamentos/alimentacao"], permissions: ["financial-records.read"], availability: "available" },
      { id: "transit-voucher", label: "Vale Transporte", href: "/pagamentos/vale-transporte", icon: "transit", matchPaths: ["/pagamentos/vale-transporte"], permissions: ["financial-records.read"], availability: "available" },
      { id: "training-expenses", label: "Treinamentos", href: "/pagamentos/treinamentos", icon: "training", matchPaths: ["/pagamentos/treinamentos"], permissions: ["financial-records.read"], availability: "available" },
    ],
  },
  {
    id: "accounting",
    label: "Contabilidade",
    items: [
      { id: "payroll", label: "Folha", href: "/contabilidade/folha", icon: "payroll", matchPaths: ["/contabilidade"], permissions: ["accounting.read"], availability: "available" },
    ],
  },
  {
    id: "master-data",
    label: "Cadastros",
    items: [
      { id: "entities", label: "Entidades", href: "/cadastros", icon: "entities", matchPaths: ["exact:/cadastros"], permissions: ["master-data.read"], availability: "available" },
      { id: "collaborators", label: "Colaboradores", href: "/cadastros/colaboradores", icon: "collaborators", matchPaths: ["/cadastros/colaboradores"], permissions: ["master-data.read"], availability: "available" },
      { id: "training-catalog", label: "Catálogo de treinamentos", href: "/treinamentos", icon: "catalog", matchPaths: ["/treinamentos"], permissions: ["training.read"], availability: "available" },
    ],
  },
  {
    id: "administration",
    label: "Administração",
    items: [
      { id: "users", label: "Usuários", href: "/usuarios", icon: "users", matchPaths: ["/usuarios"], permissions: ["users.read"], availability: "available" },
    ],
  },
];

/** Compatibilidade: lista plana de todos os itens da navegação. */
export const NAVIGATION_MODULES: NavigationItem[] = NAVIGATION_GROUPS.flatMap((group) => group.items);

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return (item.matchPaths ?? []).some((path) => path.startsWith("exact:") ? pathname === path.slice(6) : pathname === path || pathname.startsWith(`${path}/`));
}

/** Grupos visíveis para as permissões do usuário. Itens planejados (desabilitados, "Em breve") só aparecem para quem
 *  tem acesso a pelo menos uma rota real; grupos sem itens visíveis somem. */
export function visibleNavigationGroups(permissions: readonly string[]) {
  const granted = new Set(permissions);
  const allowed = (item: NavigationItem) => item.availability === "available" && (!item.permissions?.length || item.permissions.some((permission) => granted.has(permission)));
  const hasAnyRoute = NAVIGATION_GROUPS.some((group) => group.items.some(allowed));
  if (!hasAnyRoute) return [];
  return NAVIGATION_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => item.availability === "planned" || allowed(item)) }))
    .filter((group) => group.items.length > 0);
}

// ---- Metadados por rota: título (aba do navegador) e TRILHA de ancestrais para o header do shell.
// A trilha NUNCA repete o título da página atual — o título visível (h1) é do PageHeader da própria página.
export type RouteCrumb = { label: string; href?: string };
export type RouteMeta = { title: string; trail: RouteCrumb[] };

const expenses: RouteCrumb = { label: "Despesas", href: "/pagamentos" };
const ROUTES: Array<{ pattern: RegExp; meta: (match: RegExpMatchArray) => RouteMeta }> = [
  { pattern: /^\/login$/, meta: () => ({ title: "Entrar", trail: [] }) },
  { pattern: /^\/redefinir-senha$/, meta: () => ({ title: "Definir nova senha", trail: [] }) },
  { pattern: /^\/$/, meta: () => ({ title: "Visão geral", trail: [] }) },
  { pattern: /^\/contabilidade\/folha$/, meta: () => ({ title: "Folha de pagamento", trail: [{ label: "Contabilidade" }] }) },
  { pattern: /^\/pagamentos$/, meta: () => ({ title: "Despesas", trail: [] }) },
  { pattern: /^\/pagamentos\/alimentacao$/, meta: () => ({ title: "Alimentação", trail: [expenses] }) },
  { pattern: /^\/pagamentos\/vale-transporte$/, meta: () => ({ title: "Vale Transporte", trail: [expenses] }) },
  { pattern: /^\/pagamentos\/treinamentos$/, meta: () => ({ title: "Treinamentos", trail: [expenses] }) },
  { pattern: /^\/pagamentos\/([^/]+)\/validacao$/, meta: (match) => ({ title: "Validação documental", trail: [expenses, { label: "Obrigação", href: `/pagamentos/${match[1]}` }] }) },
  { pattern: /^\/pagamentos\/([^/]+)$/, meta: () => ({ title: "Obrigação", trail: [expenses] }) },
  { pattern: /^\/cadastros$/, meta: () => ({ title: "Entidades", trail: [{ label: "Cadastros" }] }) },
  { pattern: /^\/cadastros\/colaboradores$/, meta: () => ({ title: "Colaboradores", trail: [{ label: "Cadastros" }] }) },
  { pattern: /^\/treinamentos$/, meta: () => ({ title: "Catálogo de treinamentos", trail: [{ label: "Cadastros" }] }) },
  { pattern: /^\/usuarios$/, meta: () => ({ title: "Usuários", trail: [{ label: "Administração" }] }) },
];

export function resolveRouteMeta(pathname: string): RouteMeta {
  for (const route of ROUTES) {
    const match = pathname.match(route.pattern);
    if (match) return route.meta(match);
  }
  return { title: "Projeta", trail: [] };
}

// Nome amigável dos papéis (as chaves vêm de /api/auth/me; nomes iguais aos da tabela Role).
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  ANALYST: "Analista",
  APPROVER: "Aprovador",
  CONTROLLER: "Controladoria/Contabilidade",
  FINANCE: "Financeiro",
  REQUESTER: "Solicitante",
};
export const roleLabel = (key: string | undefined) => (key ? ROLE_LABELS[key] ?? key : "");
