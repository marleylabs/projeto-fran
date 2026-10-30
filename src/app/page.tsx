import { HomeDashboard } from "@/modules/dashboard/ui/HomeDashboard";

/**
 * Home oficial (Visão geral) — destino do login. Fase 7L: a raiz deixou de ser o adaptador da Folha, que continua na
 * rota canônica /contabilidade/folha.
 */
// Página da rota "/" (server component): só monta o dashboard do módulo; dados e regras ficam em modules/dashboard.
export default function HomePage() {
  return <HomeDashboard />;
}
