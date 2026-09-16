"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";

type Payload = {
  record: {
    identifier: string;
    description: string;
    documentNumber?: string | null;
    dueDate: string;
    grossAmount: string;
    netAmount: string;
  };
  current: null | {
    file: { id: string; originalName: string; mimeType: string };
    extraction: {
      id: string;
      overallConfidence?: string | null;
      structuredData?: Record<string, unknown> | null;
      fieldConfidences?: Record<string, number> | null;
      rawText?: string | null;
      engine: string;
    };
  };
};

export default function ValidationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    documentNumber: "",
    dueDate: "",
    grossAmount: "",
    netAmount: "",
    notes: "",
    acknowledged: false,
  });
  useEffect(() => {
    fetch(`/api/financial-records/${id}/validation`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      })
      .then((body: Payload) => {
        setData(body);
        setForm((value) => ({
          ...value,
          documentNumber: body.record.documentNumber ?? "",
          dueDate: body.record.dueDate.slice(0, 10),
          grossAmount: String(body.record.grossAmount),
          netAmount: String(body.record.netAmount),
        }));
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Falha ao carregar validação.",
        ),
      );
  }, [id]);
  async function decide(
    decision: "VALIDATED" | "REJECTED" | "CORRECTION_REQUESTED",
  ) {
    if (!data?.current) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/financial-records/${id}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractionId: data.current.extraction.id,
          decision,
          correctedData: {
            ...data.current.extraction.structuredData,
            documentNumber: form.documentNumber,
            dueDate: form.dueDate,
            grossAmount: form.grossAmount,
            netAmount: form.netAmount,
          },
          lowConfidenceAcknowledged: form.acknowledged,
          notes: form.notes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.push(`/pagamentos/${id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao registrar decisão.",
      );
    } finally {
      setSaving(false);
    }
  }
  const confidence = Number(data?.current?.extraction.overallConfidence ?? 0);
  const low = confidence < 0.8;
  return (
    <main className="max-w-[1500px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <PageHeader
        backHref={`/pagamentos/${id}`}
        backLabel="Voltar ao registro"
        eyebrow="Validação"
        title={data?.record.identifier ?? "Carregando…"}
        description={data?.record.description}
        actions={data?.current && (
          <Badge tone={low ? "warning" : "success"}>
            Confiança {Math.round(confidence * 100)}%
          </Badge>
        )}
      />
      {!data?.current ? (
        <EmptyState
          title="Nenhuma extração disponível"
          description="Aguarde o worker de OCR concluir o processamento, ou reprocese o documento a partir do registro."
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 min-h-[70vh]">
          <section className="card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border font-medium">
              {data.current.file.originalName}
            </div>
            {data.current.file.mimeType === "application/pdf" ||
            data.current.file.mimeType.startsWith("image/") ? (
              <iframe
                title="Documento financeiro"
                src={`/api/financial-files/${data.current.file.id}`}
                className="w-full flex-1 min-h-[650px]"
              />
            ) : (
              <pre className="p-4 whitespace-pre-wrap text-xs overflow-auto">
                {data.current.extraction.rawText}
              </pre>
            )}
          </section>
          <form
            className="card p-5 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void decide("VALIDATED");
            }}
          >
            <div>
              <h2 className="font-semibold">Dados para confirmação</h2>
              <p className="text-xs text-text-muted">
                Engine: {data.current.extraction.engine}. Campos alterados são
                preservados no histórico.
              </p>
            </div>
            {[
              {
                key: "documentNumber",
                label: "Número do documento",
                type: "text",
              },
              { key: "dueDate", label: "Vencimento", type: "date" },
              { key: "grossAmount", label: "Valor bruto", type: "number" },
              { key: "netAmount", label: "Valor líquido", type: "number" },
            ].map((field) => (
              <label key={field.key} className="text-sm">
                <span className="block text-xs font-medium text-text-muted mb-1">
                  {field.label}
                </span>
                <input
                  required={field.key !== "documentNumber"}
                  type={field.type}
                  step={field.type === "number" ? "0.01" : undefined}
                  value={form[field.key as keyof typeof form] as string}
                  onChange={(event) =>
                    setForm({ ...form, [field.key]: event.target.value })
                  }
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
            ))}
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Dados extraídos e confidências
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs overflow-auto">
                {JSON.stringify(
                  {
                    dados: data.current.extraction.structuredData,
                    confiancas: data.current.extraction.fieldConfidences,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <label className="text-sm">
              <span className="block text-xs text-text-muted mb-1">
                Observações
              </span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                className="w-full rounded-md border border-border px-3 py-2"
                rows={3}
              />
            </label>
            {low && (
              <label className="flex gap-2 text-sm rounded-md bg-warning/10 p-3">
                <input
                  type="checkbox"
                  checked={form.acknowledged}
                  onChange={(event) =>
                    setForm({ ...form, acknowledged: event.target.checked })
                  }
                />
                <span>
                  Revisei e confirmo explicitamente os campos de baixa
                  confiança.
                </span>
              </label>
            )}
            {error && <p className="rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">{error}</p>}
            <div className="mt-auto flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void decide("CORRECTION_REQUESTED")}
                variant="secondary"
              >
                Devolver para correção
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void decide("REJECTED")}
                variant="error"
              >
                Rejeitar
              </Button>
              <Button
                type="submit"
                loading={saving}
                disabled={low && !form.acknowledged}
                aura
              >
                Confirmar validação
              </Button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
