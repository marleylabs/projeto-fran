// Layout raiz de TODAS as rotas: fontes (Manrope + Geist Mono como variáveis CSS), estilos globais, tema daisyUI
// (data-theme) e os provedores globais: ToastProvider (notificações) envolvendo o AppShell (sidebar/header).
// O AppShell decide sozinho se mostra a moldura (telas públicas de login/redefinição ficam sem ela).
import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import { AppShell } from "@/components/AppShell";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// O título da aba vem do App Shell (registro central de rotas) via <title>; aqui só a descrição padrão.
export const metadata: Metadata = {
  description: "Plataforma financeira e administrativa: despesas, rateios, cadastros e folha.",
};

/** Layout raiz (server component). `lang="pt-BR"` vale para leitores de tela e para a hifenização/formatação do navegador. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="gestao-administrativa"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full"><ToastProvider><AppShell>{children}</AppShell></ToastProvider></body>
    </html>
  );
}
