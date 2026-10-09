import type { ReactNode } from "react";
import { FileSpreadsheet, PieChart, Wallet, type LucideIcon } from "lucide-react";
import { ProjetaWordmark } from "@/components/brand/ProjetaWordmark";

// Layout das telas públicas de acesso (Login / Redefinir senha) — composição split-screen inspirada no
// "01 Login / 02 Forgot Password" do UI Kit de referência, com identidade Projeta.
// Ordem no DOM: formulário PRIMEIRO (teclado e mobile chegam direto nele); o painel institucional só aparece
// a partir de 1024px, à esquerda (lg:order-first). Superfícies neutras e claras; vermelho só como acento.
const highlights: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Wallet, title: "Despesas e obrigações", text: "Alimentação, Café da Manhã, Cesta Básica, Vale Transporte e Treinamentos." },
  { icon: PieChart, title: "Rateio auditável", text: "Por empresa, departamento e centro de custo, com conferência do total." },
  { icon: FileSpreadsheet, title: "Planilhas XLSX", text: "Importação, Espelho de Ponto e relatórios para conferência." },
];


export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)]">
      <main className="flex min-h-dvh flex-col px-4 py-8 sm:px-8 lg:min-h-0 lg:py-10">
        <ProjetaWordmark className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-caption text-foreground-muted lg:text-left">Acesso restrito a usuários autorizados.</p>
      </main>
      <aside aria-label="Sobre a plataforma" className="hidden p-4 lg:order-first lg:flex">
        <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-modal border border-border bg-surface p-10 xl:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
          <ProjetaWordmark className="relative" />
          <div className="relative max-w-md">
            <p className="text-label uppercase tracking-[0.14em] text-primary">Plataforma financeira e administrativa</p>
            <h2 className="mt-3 text-page-title text-foreground">Despesas, rateios e cadastros em um só lugar.</h2>
            <ul className="mt-8 grid gap-5">
              {highlights.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control border border-border bg-surface-muted text-primary" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span>
                    <span className="block text-card-title text-foreground">{title}</span>
                    <span className="mt-0.5 block text-body text-foreground-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <span aria-hidden="true" className="relative block h-1 w-16 rounded-full bg-primary" />
        </div>
      </aside>
    </div>
  );
}
