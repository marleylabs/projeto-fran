// Configuração do Next.js (ver node_modules/next/dist/docs/ antes de alterar — versão 16 com mudanças de API).
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist fica fora do bundle do servidor: ele carrega o próprio worker por caminho de arquivo,
  // o que quebra quando empacotado (usado pelo parser de PDFs da folha).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
