// Formatação de EXIBIÇÃO do Vale Transporte (moeda, contagens, datas curtas). Nenhuma regra de cálculo aqui.
// Usado pelas views de VT e pela página /pagamentos/vale-transporte. Number() aqui é só para exibir.
/** Valor decimal (texto ou número) → "R$ 1.234,56". */
export const money =(value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
/** Centavos inteiros → moeda formatada. */
export const moneyCents = (cents: number) => money(cents / 100);
/** "1 colaborador" / "N colaboradores". */
export const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
/** "aaaa-mm-dd" → "dd/mm" (sem Date, evita deslocamento de fuso). */
export const dayMonth =(iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
