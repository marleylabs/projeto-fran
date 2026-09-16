import { Badge, type BadgeTone } from "@/components/ui";

const TONES: Record<string, BadgeTone> = {
  Trabalhando: "success",
  Férias: "info",
  Afastado: "warning",
};

export function StatusBadge({ situacao }: { situacao: string }) {
  return <Badge tone={TONES[situacao] ?? "neutral"}>{situacao || "—"}</Badge>;
}
