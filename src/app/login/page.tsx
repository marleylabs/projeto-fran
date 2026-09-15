"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Não foi possível entrar.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08] [background:radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_70%,white,transparent_40%)]" />
        <div className="relative flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <span className="font-semibold">Extrato Mensal</span>
        </div>
        <div className="relative max-w-sm">
          <h1 className="text-3xl font-bold leading-tight">Extração automática de folha de pagamento.</h1>
          <p className="mt-3 text-white/80 text-sm leading-relaxed">
            Importe o PDF, revise os dados extraídos e exporte para Excel, CSV ou JSON em poucos minutos — sem retrabalho
            manual.
          </p>
        </div>
        <p className="relative text-xs text-white/60">Projeta Consultoria e Serviços</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 justify-center mb-6">
            <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <FileText className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
          </div>

          <div className="card p-8">
            <h1 className="text-xl font-bold text-foreground text-center">Entrar</h1>
            <p className="text-sm text-text-muted text-center mt-1 mb-6">Acesse com seu email e senha cadastrados</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="field-label">Email</span>
                <div className="relative">
                  <Mail className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field-input w-full pl-9"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="field-label">Senha</span>
                <div className="relative">
                  <Lock className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field-input w-full pl-9"
                  />
                </div>
              </label>

              {error && <div className="rounded-lg bg-danger-soft text-danger-strong text-sm px-3 py-2">{error}</div>}

              <button type="submit" disabled={loading} className="btn btn-primary w-full mt-1">
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
