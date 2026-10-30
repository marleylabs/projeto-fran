import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

// Botão do Design System, construído sobre as classes .btn do daisyUI (intencional) com ajustes de cor/estado.
// Use `buttonClassName` quando precisar do visual de botão em outro elemento (ex.: <Link>, gatilho de menu).

/** Variantes de cor; `error` é a ação destrutiva, `secondary` o botão contornado neutro. */
export type ButtonVariant =
  | "neutral"
  | "primary"
  | "secondary"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "ghost";
/** Tamanhos; `icon` gera botão quadrado para ícone sozinho (lembre do aria-label). */
export type ButtonSize = "sm" | "md" | "lg" | "icon";

/** loading: desabilita e mostra spinner (aria-busy); aura: destaque animado (classe btn-aura em globals.css). */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  aura?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  neutral: "btn-neutral",
  primary:
    "btn-primary border-primary bg-primary text-white hover:border-primary-hover hover:bg-primary-hover hover:text-white",
  secondary:
    "btn-outline border-base-300 bg-base-100 text-neutral hover:border-neutral/25 hover:bg-base-200 hover:text-neutral",
  accent: "btn-outline border-primary bg-base-100 text-primary hover:border-primary hover:bg-primary-soft hover:text-primary-hover",
  info: "btn-info",
  success: "btn-success",
  warning: "btn-warning",
  ghost: "btn-ghost text-secondary",
  error: "btn-error",
};

const sizes: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
  icon: "btn-square",
};

/** Monta as classes do botão (variante, tamanho, aura) + className extra. Função pura, usável em server components. */
export function buttonClassName({
  aura = false,
  className,
  size = "md",
  variant = "primary",
}: {
  aura?: boolean;
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}) {
  return clsx(
    "btn gap-2 font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out enabled:hover:-translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:!border-base-300 disabled:!bg-base-300 disabled:!text-secondary/60 disabled:!shadow-none disabled:!transform-none",
    variants[variant],
    sizes[size],
    aura && "btn-aura",
    className,
  );
}

/** Botão padrão. type="button" por padrão (evita submit acidental em formulários); loading também desabilita. */
export function Button({
  children,
  className,
  disabled,
  aura = false,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ aura, className, size, variant })}
      {...props}
    >
      {loading && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}
