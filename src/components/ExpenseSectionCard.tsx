import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type ExpenseSectionCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  disabled?: boolean;
};

const baseClass = "card card-side min-h-[9.5rem] overflow-hidden border border-base-300 bg-base-100 shadow-sm sm:flex-row";

function CardContent({ title, description, icon: Icon, disabled = false }: ExpenseSectionCardProps) {
  return <><figure className={`flex h-20 w-full shrink-0 items-center justify-center sm:h-auto sm:w-[7.5rem] ${disabled ? "bg-base-200" : "bg-primary/5"}`}><Icon aria-hidden="true" strokeWidth={1.8} className={`h-8 w-8 ${disabled ? "text-secondary" : "text-primary"}`}/></figure><div className="card-body min-w-0 justify-center p-4 sm:p-[1.125rem]"><h2 className="card-title text-base font-bold sm:text-[1.0625rem]">{title}</h2><p className="max-w-xl text-xs leading-relaxed text-secondary sm:text-[.8125rem]">{description}</p>{!disabled&&<div className="card-actions mt-1 justify-start"><span className="text-sm font-semibold text-primary transition-colors group-hover:text-primary-hover">Acessar seção <span aria-hidden="true">→</span></span></div>}</div></>;
}

export function ExpenseSectionCard(props: ExpenseSectionCardProps) {
  if (props.disabled || !props.href) return <div className={`${baseClass} border-dashed bg-base-100/70 opacity-65`} aria-disabled="true"><CardContent {...props} disabled/></div>;
  return <Link href={props.href} aria-label={`Acessar seção ${props.title}`} className={`${baseClass} group transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}><CardContent {...props}/></Link>;
}
