// Parser do "Analítico Fatura Mensal" (Hapvida) do Plano de Saúde. Função pura sobre as linhas já reconstruídas por
// extractPdfRows (posição x/y), sem Prisma/server-only — testável com linhas sintéticas.
// Layout: cabeçalho da página (operadora, "Obrigação … Vencimento … Valor … Bruto"), blocos "Empresa" (contrato:
// saúde e odonto têm códigos próprios), "Titular <nome> CPF <dígitos>" e as linhas de beneficiário, que começam pela
// Credencial "<contrato>.<nnnnnn>-<ss>": "-00" é o titular, "-01", "-02"… são dependentes do MESMO número base —
// é a credencial que associa o dependente ao titular. Nomes longos quebram em linhas de continuação (inclusive na
// página seguinte) e cada bloco fecha com uma linha só de valores (subtotal do titular). O resumo final ("Plano AC
// Qtd …") encerra a leitura. Valores no padrão 1,234.56 → centavos inteiros (nunca float).
import type { PdfPageRows, PdfRow } from "@/lib/pdf/extractRows";

/** Layout inesperado ou conferência que não fecha; server.ts converte em HealthPlanValidationError (HTTP 400). */
export class HealthPlanParseError extends Error {}

/** Linha de beneficiário como no PDF (textos crus + 5 valores em centavos). Contém dados pessoais (CPF, nome da mãe,
 *  nascimento): é gravada no JSON da alocação, mas nunca devolvida à tela nem ao XLSX. */
export type HealthPlanBeneficiary = {
  credential: string; registration: string; cpf: string; name: string; relationship: string; motherName: string;
  birthDate: string; age: string; startDate: string; plan: string; txAd: string; ac: string; contractCode: string;
  monthlyCents: number; additionalCents: number; discountCents: number; fineCents: number; chargedCents: number;
};
/** Titular (CPF com 11 dígitos) com seus beneficiários (ele mesmo, -00, e dependentes); chargedCents = Σ Cobrado = base do rateio. */
export type HealthPlanHolder = { cpf: string; name: string; chargedCents: number; beneficiaries: HealthPlanBeneficiary[] };
/** Fatura lida. grossCents = Valor Bruto do cabeçalho; totalCents = Σ Cobrado dos titulares (sempre iguais na saída). */
export type HealthPlanInvoice = {
  provider: string; obligation: string; control: string; dueDate: string; grossCents: number;
  contracts: { code: string; name: string }[];
  plans: { code: string; name: string }[];
  holders: HealthPlanHolder[];
  totalCents: number;
};

// Credencial "<contrato>.<nnnnnn>-<ss>": grupo 1 = base (liga dependentes ao titular), grupo 2 = sequência (00 = titular).
const CREDENTIAL = /^([0-9A-Z]{5}\.\d{6})-(\d{2})$/;
// Valor no padrão do PDF: milhar com vírgula e decimal com ponto (1,234.56); exatamente 2 casas.
const MONEY = /^(-?)(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/;
// Início (x) de cada coluna de texto da linha do beneficiário; os 5 valores são sempre os 5 últimos itens.
const COLUMNS = [["registration", 95], ["cpf", 140], ["name", 195], ["relationship", 265], ["motherName", 305], ["birthDate", 370], ["age", 415], ["startDate", 445], ["plan", 485], ["txAd", 515], ["ac", 545]] as const;
const NAME_X: [number, number] = [195, 265];
const MOTHER_X: [number, number] = [305, 370];

/** "1,234.56" → 123456 (inteiro, sem float). Lança HealthPlanParseError em formato diferente. Também usado no XLSX (Tx_Ad). */
export function moneyToCents(text: string) {
  const match = MONEY.exec(text.trim());
  if (!match) throw new HealthPlanParseError(`Valor inválido no PDF do plano de saúde: ${text}`);
  const cents = Number(match[2].replace(/,/g, "")) * 100 + Number(match[3]);
  return match[1] ? -cents : cents;
}
const digits = (text: string) => text.replace(/\D/g, "");
const cpfOf = (text: string) => digits(text).padStart(11, "0"); // o PDF descarta zeros à esquerda no "Titular … CPF"
const joined = (items: PdfRow["items"]) => items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
const first = (row: PdfRow) => row.items[0]?.text ?? "";
// Rótulo de bloco: primeiro item com o texto exato e encostado na margem esquerda (x < 45).
const isLabel = (row: PdfRow, label: string) => first(row) === label && (row.items[0]?.x ?? 99) < 45;

// Distribui os itens de texto pelas colunas conforme o x inicial (COLUMNS); os 5 últimos itens são Mensalidade,
// Adicional, Desconto, Multa e Cobrado, nesta ordem.
function parseBeneficiary(row: PdfRow, contractCode: string): HealthPlanBeneficiary {
  const money = row.items.slice(-5).map((item) => moneyToCents(item.text));
  const text: Record<string, string> = {};
  for (const item of row.items.slice(1, -5)) {
    const column = [...COLUMNS].reverse().find(([, x]) => item.x >= x);
    if (column) text[column[0]] = text[column[0]] ? `${text[column[0]]} ${item.text}` : item.text;
  }
  const value = (key: string) => text[key] ?? "";
  return {
    credential: first(row), registration: value("registration"), cpf: cpfOf(value("cpf")), name: value("name"), relationship: value("relationship"),
    motherName: value("motherName"), birthDate: value("birthDate"), age: value("age"), startDate: value("startDate"), plan: value("plan"),
    txAd: value("txAd"), ac: value("ac"), contractCode,
    monthlyCents: money[0], additionalCents: money[1], discountCents: money[2], fineCents: money[3], chargedCents: money[4],
  };
}

/** Máquina de estados linha a linha sobre todas as páginas. Conferências que lançam HealthPlanParseError: Valor Bruto
 *  igual em todas as páginas, CPF do -00 = CPF do cabeçalho "Titular", dependente no bloco do seu titular, subtotal de
 *  cada bloco = Σ Cobrado lido e, no fim, Σ Cobrado = Valor Bruto. */
export function parseHealthPlanRows(pages: readonly PdfPageRows[]): HealthPlanInvoice {
  let provider = "", obligation = "", control = "", dueDate = "", grossCents: number | null = null;
  const contracts = new Map<string, string>();
  const plans = new Map<string, string>();
  let summary = false;
  const holders = new Map<string, HealthPlanHolder>();
  const holderByBase = new Map<string, string>();
  let contract = "", header: { cpf: string; name: string } | null = null;
  let last: HealthPlanBeneficiary | null = null;
  let block = null as { holderCpf: string; cents: number } | null;

  for (const page of pages) {
    if (!provider) provider = joined(page.rows[0]?.items ?? []);
    for (const row of page.rows) {
      if (isLabel(row, "Obrigação")) {
        const values = row.items.map((item) => item.text);
        const after = (label: string) => values[values.indexOf(label) + 1] ?? "";
        obligation ||= after("Obrigação"); control ||= after("Controle"); dueDate ||= after("Vencimento");
        const bruto = moneyToCents(after("Bruto"));
        if (grossCents !== null && grossCents !== bruto) throw new HealthPlanParseError("O valor bruto da fatura muda entre as páginas do PDF.");
        grossCents = bruto;
        continue;
      }
      // Resumo por plano ("Plano AC Qtd …"): encerra os beneficiários; daqui só se lê o nome de cada plano.
      if (isLabel(row, "Plano") && row.items.some((item) => item.text === "Qtd")) { summary = true; continue; }
      if (summary) {
        if (/^\d+$/.test(first(row)) && row.items[0].x < 45) plans.set(first(row), joined(row.items.filter((item) => item.x >= 100 && item.x < 380)));
        continue;
      }
      if (isLabel(row, "Empresa")) { contract = row.items[1]?.text ?? ""; contracts.set(contract, joined(row.items.slice(2))); continue; }
      if (isLabel(row, "Titular")) {
        const cpfIndex = row.items.findIndex((item) => item.text === "CPF");
        if (cpfIndex < 0) throw new HealthPlanParseError(`Linha de titular sem CPF: ${joined(row.items.slice(1, 2))}…`);
        // Não zera `last`: o cabeçalho do titular se repete na página seguinte antes da continuação do nome.
        header = { name: joined(row.items.slice(1, cpfIndex)), cpf: cpfOf(row.items[cpfIndex + 1]?.text ?? "") };
        continue;
      }
      const credential = CREDENTIAL.exec(first(row));
      if (credential) {
        if (!header) throw new HealthPlanParseError(`Beneficiário ${first(row)} sem titular.`);
        const beneficiary = parseBeneficiary(row, contract);
        // O -00 registra a base da credencial → CPF do titular; dependentes da mesma base caem no mesmo titular.
        if (credential[2] === "00") {
          if (beneficiary.cpf !== header.cpf) throw new HealthPlanParseError(`CPF do titular diverge na credencial ${beneficiary.credential}.`);
          holderByBase.set(credential[1], header.cpf);
        }
        const holderCpf = holderByBase.get(credential[1]) ?? header.cpf;
        if (holderCpf !== header.cpf) throw new HealthPlanParseError(`Dependente ${beneficiary.credential} fora do bloco do seu titular.`);
        const holder = holders.get(holderCpf) ?? { cpf: holderCpf, name: header.name, chargedCents: 0, beneficiaries: [] };
        holder.beneficiaries.push(beneficiary);
        holder.chargedCents += beneficiary.chargedCents;
        holders.set(holderCpf, holder);
        if (block?.holderCpf !== holderCpf) block = { holderCpf, cents: 0 };
        block.cents += beneficiary.chargedCents;
        last = beneficiary;
        continue;
      }
      // Rótulos/cabeçalho da página (Unidade, Credencial, endereço, data, nº da página): nunca são continuação de nome.
      if (row.items[0].x < 100 || row.items[0].x > 700) continue;
      if (row.items.every((item) => MONEY.test(item.text)) && row.items.length === 5) {
        // Subtotal do titular (soma do bloco no contrato atual): confere com as linhas lidas.
        if (!block || moneyToCents(row.items[4].text) !== block.cents) throw new HealthPlanParseError(`Subtotal do titular ${header?.name ?? ""} não confere com os beneficiários lidos.`);
        block = null; last = null;
        continue;
      }
      if (last) {
        const within = ([from, to]: [number, number]) => row.items.filter((item) => item.x >= from && item.x < to).map((item) => item.text).join(" ");
        const name = within(NAME_X), mother = within(MOTHER_X);
        if (name) last.name = `${last.name} ${name}`;
        if (mother) last.motherName = `${last.motherName} ${mother}`;
      }
    }
  }

  if (grossCents === null) throw new HealthPlanParseError("Não encontrei o valor bruto da fatura (linha \"Obrigação\").");
  if (!holders.size) throw new HealthPlanParseError("Nenhum beneficiário encontrado no PDF.");
  const list = [...holders.values()];
  const totalCents = list.reduce((sum, holder) => sum + holder.chargedCents, 0);
  if (totalCents !== grossCents) throw new HealthPlanParseError(`Soma de Cobrado (${(totalCents / 100).toFixed(2)}) difere do valor bruto da fatura (${(grossCents / 100).toFixed(2)}).`);
  return { provider, obligation, control, dueDate, grossCents, contracts: [...contracts].map(([code, name]) => ({ code, name })), plans: [...plans].map(([code, name]) => ({ code, name })), holders: list, totalCents };
}

// Empresa do contrato do PDF ("Empresa <código> <nome>") → Company ativa cujo nome fantasia inicia o nome do contrato
// (ex.: "PROJETA CONSULTORIA E SERV LTDA CTO PETRO…" → PROJETA). Só aceita um único candidato; senão, nenhum.
const companyKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
export function matchContractCompany<T extends { tradeName: string | null; active: boolean }>(contractName: string, companies: readonly T[]) {
  const name = companyKey(contractName);
  const found = companies.filter((company) => company.active && company.tradeName && (name === companyKey(company.tradeName) || name.startsWith(`${companyKey(company.tradeName)} `)));
  return found.length === 1 ? found[0] : null;
}
