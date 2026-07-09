import clsx from "clsx";

const STYLES: Record<string, string> = {
  Trabalhando: "bg-green-100 text-green-800 border-green-300",
  Férias: "bg-blue-100 text-blue-800 border-blue-300",
  Afastado: "bg-amber-100 text-amber-800 border-amber-300",
};

export function StatusBadge({ situacao }: { situacao: string }) {
  const style = STYLES[situacao] ?? "bg-surface-soft text-text border-border";
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", style)}>
      {situacao || "—"}
    </span>
  );
}
