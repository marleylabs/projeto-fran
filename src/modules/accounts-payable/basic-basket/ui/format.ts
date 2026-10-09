// Formatação de EXIBIÇÃO da Cesta Básica (moeda, contagens e textos de ajuste). Nenhuma regra de cálculo aqui:
// valores chegam prontos (centavos/decimais do cálculo ou do servidor) e só são transformados em texto.
import { BASIC_BASKET_CALCULATION_DAYS } from "../calculations";

export const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const moneyCents = (cents: number) => money(cents / 100);
export const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
// Texto curto do ajuste do Espelho de Ponto (Cesta ou Retroativo); vazio quando não há ajuste.
export const adjustmentNote = (absence: boolean, vacationDays: number, payableDays: number, absenceLabel = "Cortada — Falta Injustificada") => (absence ? absenceLabel : vacationDays ? `Férias: ${vacationDays} dias · ${payableDays}/${BASIC_BASKET_CALCULATION_DAYS} pagos` : "");
