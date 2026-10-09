// Formatação de EXIBIÇÃO e ponte CurrencyInput ↔ texto decimal (Treinamentos e Despesas de Treinamento). Sem regra.
// A tela guarda o valor como TEXTO decimal (o recebido da API, ex.: "150.0000", ou o digitado, ex.: "150.50") e envia
// esse mesmo texto ao servidor, que valida. O CurrencyInput só exibe/edita: o valor recebido é mostrado sem cortar casas
// e a digitação passa a ter 2 casas (mesmo padrão da Alimentação).
export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const dateBr = (value: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const currencyValue = (text: string) => { const normalized = text.trim().replace(",", "."); return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null; };
export const currencyText = (value: number | null) => (value === null ? "" : value.toFixed(2));
