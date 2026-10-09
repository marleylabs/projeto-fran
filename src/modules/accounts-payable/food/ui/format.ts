// Formatação de EXIBIÇÃO da Alimentação (moeda e datas curtas). Nenhuma regra de cálculo aqui.
export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const moneyCents = (cents: number) => money(cents / 100);
export const dateBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
