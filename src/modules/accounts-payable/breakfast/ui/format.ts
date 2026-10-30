// Formatação de EXIBIÇÃO do Café da Manhã (moeda, contagens, datas curtas). Nenhuma regra de cálculo aqui.
/** Moeda pt-BR a partir de reais (decimal em texto da API ou número). */
export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const moneyCents = (cents: number) => money(cents / 100);
export const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
// "yyyy-MM-dd" → "dd/MM" e → "dd/MM/yyyy" (sem Date: evita deslocamento de fuso).
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const isoBr = (iso: string) => iso.split("-").reverse().join("/");
