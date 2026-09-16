"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FeedbackAlert } from "@/components/ui";

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
    <main className="flex min-h-screen items-center justify-center bg-base-200 px-4 py-10 text-neutral">
      <section className="card w-full max-w-sm border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body p-6 sm:p-8">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary text-xs font-extrabold text-white">GA</div><h1 className="text-center text-xl font-bold text-neutral">Gestão Administrativa</h1>
          <p className="mb-2 mt-1 text-center text-sm text-secondary">
            Entre para acessar a plataforma
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="fieldset">
              <span className="fieldset-legend text-secondary">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input input-bordered w-full border-base-300 bg-base-100"
              />
            </label>

            <label className="fieldset">
              <span className="fieldset-legend text-secondary">Senha</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input input-bordered w-full border-base-300 bg-base-100"
              />
            </label>

            {error && (
              <FeedbackAlert status="error" title="Não foi possível entrar">
                {error}
              </FeedbackAlert>
            )}

            <Button type="submit" loading={loading} aura className="mt-2 w-full">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
