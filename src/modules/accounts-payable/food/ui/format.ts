// Formatação de EXIBIÇÃO da Alimentação (moeda e datas curtas). Nenhuma regra de cálculo aqui.
// money: aceita string decimal (Decimal serializado pela API) ou número. moneyCents: valor em centavos inteiros.
// dateBr: datas de ocorrência são gravadas como meia-noite UTC, por isso o timeZone UTC (evita mostrar o dia anterior).
export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const moneyCents = (cents: number) => money(cents / 100);
export const dateBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
