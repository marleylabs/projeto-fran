"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, FeedbackAlert } from "@/components/ui";

function RedefinirSenhaForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmation }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível redefinir a senha."); setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-base-200 px-4 py-10 text-neutral"><section className="card w-full max-w-sm border border-base-300 bg-base-100 shadow-sm"><div className="card-body p-6"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-primary text-xs font-extrabold text-white">GA</div><h1 className="mt-3 text-center text-xl font-bold">Redefinir senha</h1>{done?<><FeedbackAlert status="success" title="Senha atualizada">Sua nova senha já pode ser utilizada.</FeedbackAlert><a href="/login" className="btn btn-primary btn-sm">Ir para o login</a></>:<form onSubmit={submit} className="mt-3 grid gap-3"><label className="fieldset"><span className="fieldset-legend">Nova senha</span><input className="input input-bordered w-full" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label className="fieldset"><span className="fieldset-legend">Confirmar senha</span><input className="input input-bordered w-full" type="password" minLength={8} required autoComplete="new-password" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>{error&&<FeedbackAlert status="error" title="Não foi possível continuar">{error}</FeedbackAlert>}<Button type="submit" loading={busy} disabled={!token}>{busy?"Atualizando...":"Atualizar senha"}</Button></form>}</div></section></main>;
}

export default function RedefinirSenhaPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-base-200"><span className="loading loading-spinner text-primary"/></main>}><RedefinirSenhaForm/></Suspense>;
}
