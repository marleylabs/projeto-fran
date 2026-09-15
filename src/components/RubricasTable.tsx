import type { Rubrica } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { Badge, type BadgeVariant } from "./ui/Badge";

const TIPO_VARIANT: Record<Rubrica["tipo"], BadgeVariant> = {
  Provento: "success",
  Desconto: "danger",
  Informativa: "info",
  "Informativa Dedutora": "neutral",
};

export function RubricasTable({ rubricas }: { rubricas: Rubrica[] }) {
  if (rubricas.length === 0) {
    return <p className="text-sm text-text-muted py-4">Nenhuma rubrica encontrada para este colaborador.</p>;
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse min-w-[560px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase">Código</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase">Descrição</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase">Tipo</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase">Referência</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-text-muted uppercase">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rubricas.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="px-3 py-2 tabular-nums">{r.codigo || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {r.descricao}
                  {r.confianca === "baixa" && (
                    <span title="Baixa confiança de leitura" className="text-warning text-xs font-bold">
                      !
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <Badge variant={TIPO_VARIANT[r.tipo]}>{r.tipo}</Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">{r.referencia ?? "—"}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">R$ {formatBRNumber(r.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
