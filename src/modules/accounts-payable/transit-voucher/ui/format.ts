// Formatação de EXIBIÇÃO do Vale Transporte (moeda, contagens, datas curtas). Nenhuma regra de cálculo aqui.
export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const moneyCents = (cents: number) => money(cents / 100);
export const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
