"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, buttonClassName, FeedbackAlert, Field, TextInput } from "@/components/ui";

// Fluxo real: o ADMINISTRADOR gera o link (Usuários → Redefinir senha); quem recebe define a nova senha aqui.
// Não existe pedido público de "esqueci minha senha".
function RedefinirSenhaForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmation }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível redefinir a senha."); setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout>
      <h1 className="text-page-title text-foreground">Definir nova senha</h1>
      <p className="mt-1.5 text-body text-foreground-muted">Use o link enviado pelo administrador do sistema para criar uma nova senha de acesso.</p>

      {done ? (
        <div className="mt-8 grid gap-5">
          <FeedbackAlert status="success" title="Senha atualizada">Sua nova senha já pode ser utilizada.</FeedbackAlert>
          <Link href="/login" className={buttonClassName({ className: "h-11 w-full text-body" })}>Ir para o login</Link>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="mt-8 grid gap-5">
          {!token && (
            <FeedbackAlert status="warning" title="Link incompleto">
              Este endereço não contém um link de redefinição válido. Solicite um novo link ao administrador do sistema.
            </FeedbackAlert>
          )}
          <Field label="Nova senha" helper="Mínimo de 8 caracteres." required>
            {(control) => <TextInput {...control} type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          <Field label="Confirmar senha" required>
            {(control) => <TextInput {...control} type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />}
          </Field>
          {error && <FeedbackAlert status="error" title="Não foi possível continuar">{error}</FeedbackAlert>}
          <Button type="submit" loading={busy} disabled={!token} className="mt-1 h-11 w-full text-body">{busy ? "Atualizando..." : "Atualizar senha"}</Button>
        </form>
      )}

      <p className="mt-6 text-caption text-foreground-muted">
        Já tem a senha? <Link href="/login" className="font-semibold text-primary underline-offset-2 hover:underline">Voltar para o login</Link>
      </p>
    </AuthLayout>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-background"><span role="status" aria-label="Carregando"><LoaderCircle size={24} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /></span></div>}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}
