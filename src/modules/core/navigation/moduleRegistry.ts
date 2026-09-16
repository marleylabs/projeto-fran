export interface NavigationModule {
  id: string;
  label: string;
  description: string;
  href?: string;
  matchPaths?: string[];
  availability: "available" | "planned";
}

/**
 * Registro único dos módulos exibidos pelo shell. Novos módulos entram aqui
 * somente quando possuírem uma rota real; itens planejados não são links.
 */
export const NAVIGATION_MODULES: NavigationModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Indicadores gerenciais e drill-down financeiro",
    availability: "planned",
  },
  {
    id: "accounts-payable",
    label: "Contas a pagar",
    description: "Documentos e pagamentos",
    href: "/pagamentos",
    matchPaths: ["/pagamentos"],
    availability: "available",
  },
  {
    id: "accounting",
    label: "Contabilidade",
    description: "Importações de folha e conferência contábil",
    href: "/contabilidade/folha",
    matchPaths: ["/", "/contabilidade"],
    availability: "available",
  },
  {
    id: "master-data",
    label: "Cadastros",
    description: "Entidades e favorecidos administrativos",
    href: "/cadastros",
    matchPaths: ["/cadastros"],
    availability: "available",
  },
  {
    id: "administration",
    label: "Administração",
    description: "Usuários e configurações da plataforma",
    href: "/usuarios",
    matchPaths: ["/usuarios"],
    availability: "available",
  },
];
