"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, FeedbackAlert, Field, TextInput } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthLayout>
      <h1 className="text-page-title text-foreground">Entrar</h1>
      <p className="mt-1.5 text-body text-foreground-muted">Acesse a plataforma com seu e-mail corporativo e senha.</p>

      <form onSubmit={handleSubmit} aria-busy={loading} className="mt-8 grid gap-5">
        <Field label="E-mail" required>
          {(control) => (
            <TextInput
              {...control}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field label="Senha" required>
          {(control) => (
            <div className="relative">
              <TextInput
                {...control}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                aria-controls={control.id}
                className="absolute inset-y-0 right-0.5 my-auto grid size-9 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          )}
        </Field>

        {error && (
          <FeedbackAlert status="error" title="Não foi possível entrar">
            {error}
          </FeedbackAlert>
        )}

        <Button type="submit" loading={loading} className="mt-1 h-11 w-full text-body">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-caption text-foreground-muted">
        Problemas de acesso? Solicite ao administrador do sistema um link de redefinição de senha.
      </p>
    </AuthLayout>
  );
}
