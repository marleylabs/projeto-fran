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
