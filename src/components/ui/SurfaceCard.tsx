import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type SurfaceCardProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
  actions?: ReactNode;
};

export function SurfaceCard({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: SurfaceCardProps) {
  return (
    <section
      className={clsx("card border border-base-300 bg-base-100 shadow-none", className)}
      {...props}
    >
      <div className="card-body gap-3 p-3 sm:p-4">
        {(title || description || actions) && (
          <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {title && <h2 className="card-title text-neutral">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-secondary">{description}</p>}
            </div>
            {actions && <div className="card-actions shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
