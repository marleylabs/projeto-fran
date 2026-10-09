import clsx from "clsx";

// Marca Projeta em tratamento tipográfico (o projeto não possui arquivo de logo; nenhum SVG é inventado).
// `markOnlyAtRail`: entre 1024 e 1279px (sidebar em trilho de ícones) mostra só o marcador.
export function ProjetaWordmark({ className, markOnlyAtRail = false }: { className?: string; markOnlyAtRail?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px] bg-primary" />
      <span className={clsx("text-section-title font-extrabold tracking-tight text-foreground", markOnlyAtRail && "lg:max-xl:sr-only")}>Projeta</span>
    </span>
  );
}
