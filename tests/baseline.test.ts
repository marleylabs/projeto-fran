import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseBRNumber, extractCpf, extractDate } from "../src/lib/normalize/money";
import { computeTotaisGerais } from "../src/lib/parser/computeTotals";
import { combineExtratoMensalSources } from "../src/lib/parser/combineExtratoMensal";
import { parseSinteticoRows } from "../src/lib/parser/sintetico/rowParser";
import { computeSinteticoTotais } from "../src/lib/parser/sintetico/computeTotals";
import type { PdfRow } from "../src/lib/pdf/extractRows";
import type { Colaborador, ExtractionResult, Rubrica } from "../src/lib/types/payroll";
import { formatCnpj, isValidCnpj, normalizeCnpj, parseAdministrativeEntityInput } from "../src/modules/administrative-entities/schema";
import { localityAllows, parseFoodCsv } from "../src/modules/accounts-payable/food/processing";
import { normalizeTransitVoucherCorrection, parseTransitVoucherCsv, parseTransitVoucherXlsx } from "../src/modules/accounts-payable/transit-voucher/processing";
import { TRANSIT_VOUCHER_COLUMNS, TRANSIT_VOUCHER_SHEET_NAME, TRANSIT_VOUCHER_TABLE_NAME } from "../src/modules/accounts-payable/transit-voucher/columns";
import { generateTransitVoucherTemplate } from "../src/modules/accounts-payable/transit-voucher/templates";
import {
  assertPassagesToReceive, calculatePassagesToReceive, calculateTransitVoucherEmployeeTotal, calculateWorkingDays,
  centsToDecimalString, formatTransitObservation, parseFareToCents, summarizeCompetenceDays,
} from "../src/modules/accounts-payable/transit-voucher/calculations";
import { normalizeFoodName, parseFoodMealCsv, parseFoodMealXlsx } from "../src/modules/accounts-payable/food/ma-processing";
import { matchCollaborator, matchFoodEmployee } from "../src/modules/accounts-payable/food/matching";
import { parseFoodPaXlsx, parsePaDate, parsePaMoney } from "../src/modules/accounts-payable/food/pa-processing";
import { generateFoodTemplate } from "../src/modules/accounts-payable/food/templates";
import { foodMaCycleLabel, occurrenceBelongsToMaCycle } from "../src/modules/accounts-payable/food/cycles";
import { normalizeCollaboratorSearch, normalizeCollaboratorText } from "../src/modules/collaborators/schema";
import { compareDateThenId, comparePtBr, sortedPtBr } from "../src/lib/sorting/ptBr";
import { datesInPeriod } from "../src/components/MultiDatePicker";
import { classifyCollaborator, collaboratorSimilarity } from "../src/modules/collaborators/import";
import { buildFoodConsolidatedWorkbook, type ConsolidatedFoodBatch } from "../src/modules/accounts-payable/food/consolidated-export";
import { buildFoodRateioWorkbook, type FoodRateioBatch } from "../src/modules/accounts-payable/food/rateio-export";
import { buildManualFoodCombinations, parseManualFoodResponse } from "../src/modules/accounts-payable/food/manual-contract";
import { normalizeOrganizationalValue, organizationalComparisonKey } from "../src/lib/organizational-label";

test("normaliza labels organizacionais e consolida grupos sem alterar o total", () => {
  for (const value of ["Administrativo", "ADMINISTRATIVO", " administrativo ", "administrativo"])
    assert.equal(normalizeOrganizationalValue(value), "ADMINISTRATIVO");
  assert.equal(normalizeOrganizationalValue("Engenharia"), "ENGENHARIA");
  assert.equal(normalizeOrganizationalValue("Financeiro"), "FINANCEIRO");
  assert.equal(normalizeOrganizationalValue("Planejamento"), "PLANEJAMENTO");
  assert.equal(normalizeOrganizationalValue("Topogeo"), "TOPOGEO");
  assert.equal(normalizeOrganizationalValue(" gestão  técnica "), "GESTÃO TÉCNICA");
  assert.equal(organizationalComparisonKey("GESTÃO"), organizationalComparisonKey("gestao"));
  const rows=[{department:"ADMINISTRATIVO",employeeId:"1",meals:37,amount:777},{department:"Administrativo",employeeId:"1",meals:20,amount:420},{department:" administrativo ",employeeId:"2",meals:20,amount:420}];
  const before=rows.reduce((sum,row)=>sum+row.amount,0),groups=new Map<string,{employees:Set<string>;meals:number;amount:number}>();
  for(const row of rows){const key=normalizeOrganizationalValue(row.department),group=groups.get(key)??{employees:new Set<string>(),meals:0,amount:0};group.employees.add(row.employeeId);group.meals+=row.meals;group.amount+=row.amount;groups.set(key,group)}
  assert.equal(groups.size,1);assert.deepEqual([...groups.keys()],["ADMINISTRATIVO"]);assert.equal(groups.get("ADMINISTRATIVO")?.employees.size,2);assert.equal(groups.get("ADMINISTRATIVO")?.meals,77);assert.equal(groups.get("ADMINISTRATIVO")?.amount,before);
});

test("classifica importação de colaboradores sem criar duplicidade automaticamente", () => {
  const existing = [{ id: "1", officialName: "Anderson Marley", normalizedName: "anderson marley", jobTitle: "", department: "Planejamento", costCenter: "", active: true }];
  const exact = { officialName: "ANDERSON MARLEY", normalizedName: "anderson marley", jobTitle: "Auxiliar", department: "TI", costCenter: "Planejamento", active: true };
  assert.equal(classifyCollaborator(exact, existing).classification, "UPDATE_AVAILABLE");
  const possible = { ...exact, officialName: "ANDERSON MARLEY DE ANDRADE LIMA", normalizedName: "anderson marley de andrade lima" };
  assert.equal(classifyCollaborator(possible, existing).classification, "POSSIBLE_DUPLICATE");
  assert.ok(collaboratorSimilarity(possible, existing[0]) >= 0.72);
  const newPerson = { ...exact, officialName: "Carlos Rodrigo de Sousa Silva", normalizedName: "carlos rodrigo de sousa silva", department: "SSMA" };
  assert.equal(classifyCollaborator(newPerson, existing).classification, "NEW");
});

test("seleciona todo o período permitido para ciclos MA e competência PA", () => {
  const maFirst = datesInPeriod("2026-08-01", "2026-08-15");
  const maSecond = datesInPeriod("2026-08-16", "2026-08-31");
  const pa = datesInPeriod("2026-08-01", "2026-08-31");
  assert.equal(maFirst.length, 15);
  assert.deepEqual([maFirst[0], maFirst.at(-1)], ["2026-08-01", "2026-08-15"]);
  assert.equal(maSecond.length, 16);
  assert.deepEqual([maSecond[0], maSecond.at(-1)], ["2026-08-16", "2026-08-31"]);
  assert.equal(pa.length, 31);
  assert.deepEqual([pa[0], pa.at(-1)], ["2026-08-01", "2026-08-31"]);
});

test("ordena textos em pt-BR ignorando caixa e acentos", () => {
  const names = ["victor", "Érica", "Antonio", "Álvaro", "João"];
  assert.deepEqual([...names].sort(comparePtBr), [
    "Álvaro",
    "Antonio",
    "Érica",
    "João",
    "victor",
  ]);
  assert.equal(comparePtBr("ANDERSON", "anderson"), 0);
  assert.equal(comparePtBr("João", "JOAO"), 0);
});

test("ordena rateio pela hierarquia e mantém datas e ids como desempate", () => {
  const rows = [
    { id: "3", company: "Via B", department: "Obras", employee: "João", date: "2026-08-03" },
    { id: "2", company: "Via A", department: "Áreas", employee: "Ana", date: "2026-08-02" },
    { id: "1", company: "Via A", department: "Áreas", employee: "Ana", date: "2026-08-01" },
  ];
  const ordered = sortedPtBr(rows, (row) => row.company, (a, b) =>
    comparePtBr(a.department, b.department) ||
    comparePtBr(a.employee, b.employee) ||
    compareDateThenId(a.date, b.date, a.id, b.id),
  );
  assert.deepEqual(ordered.map((row) => row.id), ["1", "2", "3"]);
});

test("cadastro mestre normaliza busca, acentos e espaços sem alterar a identidade", () => {
  assert.equal(normalizeCollaboratorText("  JOÃO   DA\nSILVA  "), "JOÃO DA SILVA");
  assert.equal(normalizeCollaboratorSearch("João da Silva"), "joao da silva");
});

test("separa datas de MA entre o primeiro e o segundo ciclo", () => {
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 7, 1)), 2026, 8, 1), true);
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 7, 15)), 2026, 8, 1), true);
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 7, 16)), 2026, 8, 1), false);
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 7, 16)), 2026, 8, 2), true);
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 7, 31)), 2026, 8, 2), true);
});

test("rejeita data de outra competência mesmo quando o dia coincide com o ciclo", () => {
  assert.equal(occurrenceBelongsToMaCycle(new Date(Date.UTC(2026, 6, 10)), 2026, 8, 1), false);
  assert.equal(foodMaCycleLabel(0), "Histórico mensal");
});

function rubrica(codigo: string, descricao: string, valor: number): Rubrica {
  return {
    codigo,
    descricao,
    tipo: "Desconto",
    valor,
    valorOriginal: valor.toFixed(2),
    confianca: "alta",
  };
}

function colaborador(id: string, overrides: Partial<Colaborador> = {}): Colaborador {
  return {
    id,
    codigo: id,
    nome: `Colaborador ${id}`,
    cpf: "",
    admissao: "",
    situacao: "Trabalhando",
    vinculo: "",
    horasMes: "220:00",
    departamento: "",
    centroCusto: "",
    cargoCodigo: "",
    cargo: "",
    cbo: "",
    filial: "",
    salario: 0,
    salarioOriginal: "0,00",
    proventos: 0,
    descontos: 0,
    liquido: 0,
    informativa: 0,
    informativaDedutora: 0,
    baseINSS: 0,
    baseFGTS: 0,
    baseIRRF: 0,
    excedenteINSS: 0,
    valorFGTS: 0,
    rubricas: [],
    observacoes: [],
    textoBruto: "",
    camposBaixaConfianca: [],
    ...overrides,
  };
}

function extraction(company: string, cnpj: string, employees: Colaborador[]): ExtractionResult {
  return {
    formato: "extrato-mensal",
    empresa: { nome: company, cnpj, competencia: "07/2026", emissao: "", hora: "" },
    colaboradores: employees,
    totaisGerais: computeTotaisGerais(employees),
    metodoLeitura: "texto",
    avisos: [],
  };
}

function row(y: number, items: [string, number][]): PdfRow {
  return { y, items: items.map(([text, x]) => ({ text, x, y })) };
}

test("identificação de alimentação prioriza setor, alias e fuzzy inequívoco", () => {
  const employees = [
    { id: "1", officialName: "Anderson Marley", normalizedName: "anderson marley", department: "Financeiro" },
    { id: "2", officialName: "Anderson Marley", normalizedName: "anderson marley obras", department: "Obras" },
  ];
  assert.equal(matchFoodEmployee("Anderson Marley", "Financeiro", employees, []).method, "EXACT");
  assert.equal(matchFoodEmployee("Andérson  Marley", "Financeiro", employees, []).method, "NORMALIZED");
  assert.equal(matchFoodEmployee("Anderson Marlei", "Financeiro", employees, []).method, "FUZZY");
  assert.equal(matchFoodEmployee("N. Derson", "Financeiro", employees, [{ normalizedAlias: "n derson", employee: employees[0] }]).method, "ALIAS");
  assert.equal(matchFoodEmployee("Anderson Marley", "Diretoria", employees, []).method, "EXACT");
});

test("matcher estrutural reconhece nomes parciais e preserva ambiguidades",()=>{
  const people=[
    {id:"aline",officialName:"ALINE CONCEICAO FERREIRA",normalizedName:"aline conceicao ferreira",department:"Administrativo",costCenter:"ADM"},
    {id:"anderson",officialName:"ANDERSON MARLEY DE ANDRADE LIMA",normalizedName:"anderson marley de andrade lima",department:"TI",costCenter:"PLANEJAMENTO"},
    {id:"camille",officialName:"CAMILLE LEÃO",normalizedName:"camille leao",department:"Comercial",costCenter:"COM"},
    {id:"ana-1",officialName:"ANA CAROLINA DAMASCENO FROTA",normalizedName:"ana carolina damasceno frota",department:"Engenharia",costCenter:"ENG"},
    {id:"ana-2",officialName:"ANA CAROLINA DE SOUZA SILVA",normalizedName:"ana carolina de souza silva",department:"Financeiro",costCenter:"FIN"},
    {id:"befranio",officialName:"BEFRÂNIO GOMES PEREIRA",normalizedName:"befranio gomes pereira",department:"Obras",costCenter:"OBR"},
  ];
  assert.equal(matchCollaborator({receivedName:"Aline Ferreira",receivedDepartment:"Administrativo",collaborators:people}).employee?.id,"aline");
  assert.equal(matchCollaborator({receivedName:"Anderson Marley",receivedDepartment:"TI",collaborators:people}).employee?.id,"anderson");
  assert.equal(matchCollaborator({receivedName:"Camille Leao",receivedDepartment:"Comercial",collaborators:people}).method,"NORMALIZED");
  assert.equal(matchCollaborator({receivedName:"Camile Leao",receivedDepartment:"Comercial",collaborators:people}).employee?.id,"camille");
  assert.equal(matchCollaborator({receivedName:"Ana Carolina",collaborators:people}).confidence,"AMBIGUOUS");
  assert.equal(matchCollaborator({receivedName:"Ana Carolina",receivedDepartment:"Financeiro",receivedCostCenter:"FIN",collaborators:people}).employee?.id,"ana-2");
  assert.equal(matchCollaborator({receivedName:"Befranio Pereira",receivedDepartment:"Obras",collaborators:people}).employee?.id,"befranio");
  assert.equal(matchCollaborator({receivedName:"Aline Ferreira",collaborators:people,aliases:[{normalizedAlias:"aline ferreira",employee:people[0]}]}).method,"ALIAS");
});

test("PA deriva competência de DATA e aceita valores monetários sem depender de MÊS", () => {
  assert.equal(parsePaDate(46174)?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(parsePaDate("01/06/2026")?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(parsePaDate("2026-06-01")?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(parsePaMoney("R$ 30,00"), "30.00");
  assert.equal(parsePaMoney(30), "30.0000");
  assert.equal(parsePaMoney("#VALUE!"), null);
});

test("normaliza números brasileiros sem transformar entrada inválida em zero", () => {
  assert.equal(parseBRNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseBRNumber("-350,10"), -350.1);
  assert.equal(parseBRNumber("sem valor"), null);
  assert.equal(extractCpf("CPF 123.456.789-00"), "123.456.789-00");
  assert.equal(extractDate("Competência em 31/07/2026"), "31/07/2026");
});

test("valida e normaliza o cadastro administrativo em todas as camadas", () => {
  assert.equal(isValidCnpj("07.055.808/0001-15"), true);
  assert.equal(normalizeCnpj("07.055.808/0001-15"), "07055808000115");
  assert.equal(normalizeCnpj(""), null);
  assert.equal(formatCnpj("07055808000115"), "07.055.808/0001-15");
  assert.throws(() => normalizeCnpj("11.111.111/1111-11"), /CNPJ válido/);
  assert.deepEqual(parseAdministrativeEntityInput({
    cnpj: null,
    legalName: "  Guia do FGTS Digital  ",
    tradeName: "FGTS",
    activityArea: "Encargo trabalhista",
    appliesProjeta: true,
    appliesBoinga: false,
    locality: "MA/PA",
  }), {
    cnpj: null,
    legalName: "Guia do FGTS Digital",
    tradeName: "FGTS",
    activityArea: "Encargo trabalhista",
    appliesProjeta: true,
    appliesBoinga: false,
    locality: "MA/PA",
  });
  assert.throws(() => parseAdministrativeEntityInput({ legalName: "INSS", tradeName: "INSS", activityArea: "Encargo", locality: "MA" }), /Projeta/);
});

test("processa lotes de alimentação independentes e sinaliza inconsistências", () => {
  const makeCsv = (count: number, prefix: string) => ["Matrícula;Colaborador;Setor", ...Array.from({ length: count }, (_, index) => `${prefix}${index + 1};Colaborador ${prefix} ${index + 1};${index % 2 ? "Financeiro" : "Engenharia"}`)].join("\n");
  const ma = parseFoodCsv(makeCsv(100, "MA"));
  const pa = parseFoodCsv(makeCsv(60, "PA"));
  assert.equal(ma.allocations.length, 100);
  assert.equal(pa.allocations.length, 60);
  assert.equal((ma.allocations.length + pa.allocations.length) * 25, 4000);
  assert.equal(ma.allocations.length * 25, 2500);
  assert.equal(pa.allocations.length * 25, 1500);
  const supplierA = parseFoodCsv(makeCsv(40, "A"));
  const supplierB = parseFoodCsv(makeCsv(30, "B"));
  assert.deepEqual([
    { supplier: "A", people: supplierA.allocations.length, unitPrice: 25, obligation: supplierA.allocations.length * 25 },
    { supplier: "B", people: supplierB.allocations.length, unitPrice: 28.5, obligation: supplierB.allocations.length * 28.5 },
  ], [
    { supplier: "A", people: 40, unitPrice: 25, obligation: 1000 },
    { supplier: "B", people: 30, unitPrice: 28.5, obligation: 855 },
  ]);
  const inconsistent = parseFoodCsv("Matrícula;Colaborador;Setor\n1;Ana;RH\n1;Ana;RH\n2;Bruno;");
  assert.equal(inconsistent.allocations.length, 1);
  assert.deepEqual(inconsistent.issues.map((issue) => issue.code), ["DUPLICATE_IDENTIFIER", "MISSING_DEPARTMENT"]);
  assert.equal(localityAllows("MA/PA", "PA"), true);
  assert.equal(localityAllows("MA", "PA"), false);
});

test("processa as colunas oficiais do vale transporte sem recalcular o valor total", () => {
  const csv = " EMPRESA ;NOME;DATA;DEPARTAMENTO;SERVIÇO;CC;VALOR DIA;DIF MÊS ANTERIOR;DESCONTOS EVENTUAIS;DIAS;VALOR TOTAL\nPROJETA;João;01/08/2026;Engenharia;Ônibus;CC-1;12,00;-5,00;15,00;22;249,00\nPROJETA;Maria;45505;Financeiro;Van;CC-2;R$ 10,00;0;0;20;R$ 240,00";
  const result = parseTransitVoucherCsv(csv);
  assert.equal(result.blockingError, undefined);
  assert.equal(result.allocations.length, 2);
  assert.equal(result.allocations.reduce((sum, row) => sum + Number(row.amount), 0), 489);
  assert.equal(result.allocations[0].previousMonthDifference, "-5.0000");
  assert.equal(result.allocations[0].occasionalDiscounts, "15.0000");
  assert.equal(result.allocations[0].service, "Ônibus");
  assert.ok(result.allocations[0].serviceDate?.startsWith("2026-08-01"));
  assert.ok(result.allocations[1].serviceDate?.startsWith("2024-08-01"));
});

test("diferencia erro bloqueante de pendência isolada no vale transporte", () => {
  const missing = parseTransitVoucherCsv("NOME;VALOR TOTAL\nAna;10");
  assert.match(missing.blockingError ?? "", /EMPRESA.*DEPARTAMENTO/);
  const partial = parseTransitVoucherCsv("EMPRESA;NOME;DATA;DEPARTAMENTO;VALOR TOTAL\nPROJETA;Ana;invalida;Financeiro;100\nPROJETA;Bruno;01/08/2026;;200");
  assert.equal(partial.allocations.length, 0);
  assert.deepEqual(partial.issues.map((issue) => issue.code), ["ROW_REVIEW_REQUIRED", "ROW_REVIEW_REQUIRED"]);
  assert.deepEqual(partial.issues[1].fieldErrors?.map((error) => error.field), ["department", "service"]);
});

test("arquivo real preserva três linhas pendentes e permite corrigi-las até integrar o rateio", async () => {
  const parsed = await parseTransitVoucherXlsx(await readFile("tests/fixtures/Mascara_Vale_Transporte.xlsx"));
  assert.equal(parsed.allocations.length, 6); assert.equal(parsed.issues.length, 3);
  assert.deepEqual(parsed.issues.map((issue) => issue.sourceRow), [3, 6, 9]);
  assert.deepEqual(parsed.issues[0].rawData, { company: "PROJETA", employeeName: "CARLOS RODRIGO DE SOUSA SILVA", serviceDate: null, department: null, service: null, costCenter: "SSMA", dailyAmount: 12.6, previousMonthDifference: 0, occasionalDiscounts: 0, days: 22, amount: 277.2 });
  const corrected = parsed.issues.map((issue, index) => normalizeTransitVoucherCorrection({ ...issue.rawData!, serviceDate: "2026-08-01", department: ["SSMA", "FINANCEIRO", "SONDAGEM"][index] }));
  assert.ok(corrected.every((result) => result.issues.length === 0 && result.allocations.length === 1));
  const total = [...parsed.allocations, ...corrected.flatMap((result) => result.allocations)].reduce((sum, row) => sum + Number(row.amount), 0);
  assert.equal(total, 1940.4);
});

test("máscara oficial de vale transporte mantém ordem, tabela, formatos e compatibilidade com o parser", async () => {
  const buffer = await generateTransitVoucherTemplate();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
  const sheet = workbook.getWorksheet(TRANSIT_VOUCHER_SHEET_NAME); assert.ok(sheet);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), [...TRANSIT_VOUCHER_COLUMNS]);
  assert.equal(sheet.getTable(TRANSIT_VOUCHER_TABLE_NAME).name, TRANSIT_VOUCHER_TABLE_NAME);
  assert.equal(sheet.getColumn(3).numFmt, "dd/mm/yyyy");
  assert.match(sheet.getColumn(8).numFmt ?? "", /\[Red\]/);
  sheet.getRow(2).values = ["PROJETA", "Colaborador Exemplo", new Date(Date.UTC(2026, 7, 1)), "Engenharia", "Ônibus", "CC-TESTE", 12, -5, 15, 22, 249];
  const filled = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseTransitVoucherXlsx(filled);
  assert.equal(parsed.blockingError, undefined); assert.equal(parsed.allocations.length, 1);
  assert.equal(parsed.allocations[0].amount, "249.0000"); assert.equal(parsed.allocations[0].previousMonthDifference, "-5.0000"); assert.equal(parsed.allocations[0].days, "22.00");
});

test("normaliza nomes de refeições sem unir nomes parciais ambiguamente", () => {
  assert.equal(normalizeFoodName("  CARLOS   WILLKEN "), normalizeFoodName("Carlos Willken"));
  assert.equal(normalizeFoodName("Victor  Hugo Sousa da Silva"), normalizeFoodName("Victor Hugo Sousa da Silva"));
  assert.equal(normalizeFoodName("Joao Victor"), normalizeFoodName("João Victor"));
  assert.notEqual(normalizeFoodName("Victor Hugo"), normalizeFoodName("Victor Hugo Sousa da Silva"));
});

test("preserva cada linha como refeição e mantém duplicidades para revisão", () => {
  const rows = Array.from({ length: 18 }, () => `01/06/2026;João Victor;SSMA`).join("\n");
  const result = parseFoodMealCsv(`DATA;NOME;SETOR\n${rows}`);
  assert.equal(result.occurrences.length, 18);
  assert.equal(result.occurrences.filter((row) => row.occurredOn.toISOString().slice(0, 10) === "2026-06-01").length, 18);
  assert.equal(new Set(result.occurrences.map((row) => row.normalizedReceivedName)).size, 1);
});

test("máscara MA gerada é aceita pelo parser após preenchimento", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await generateFoodTemplate("MA")) as never);
  const sheet = workbook.getWorksheet("ALIMENTAÇÃO MA");
  assert.ok(sheet);
  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    ["DATA", "NOME", "SETOR"],
  );
  sheet.getRow(2).values = [new Date(Date.UTC(2026, 7, 4)), "João Silva", "Engenharia"];

  const parsed = await parseFoodMealXlsx(
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
  assert.equal(parsed.occurrences.length, 1);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.occurrences[0].receivedName, "João Silva");
  assert.equal(parsed.occurrences[0].occurredOn.toISOString().slice(0, 10), "2026-08-04");
});

test("máscara PA mantém RateioOficial e é aceita sem fórmulas de competência", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await generateFoodTemplate("PA")) as never);
  const sheet = workbook.getWorksheet("RATEIO 2.0");
  assert.ok(sheet);
  assert.ok(sheet.getTable("RateioOficial"));
  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    ["DATA", "ANO", "MÊS", "NOME", "DPTO", "EMISSÃO NF", "RESTAURANTE", "VALOR"],
  );
  sheet.getRow(2).values = [
    new Date(Date.UTC(2026, 7, 5)),
    null,
    null,
    "Maria Souza",
    "Financeiro",
    "05/08/2026",
    "Restaurante PA",
    28.5,
  ];

  const parsed = await parseFoodPaXlsx(
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
  assert.equal(parsed.occurrences.length, 1);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.occurrences[0].receivedName, "Maria Souza");
  assert.equal(parsed.occurrences[0].amount, "28.5000");
  assert.equal(parsed.occurrences[0].occurredOn.toISOString().slice(0, 10), "2026-08-05");
});

test("calcula totais da folha e rubricas críticas com arredondamento monetário", () => {
  const employees = [
    colaborador("1", {
      proventos: 1000.1,
      descontos: 200.05,
      liquido: 800.05,
      valorFGTS: 80.01,
      rubricas: [rubrica("150", "Hora extra", 50.25), rubrica("101", "I.N.S.S.", 90.1)],
    }),
    colaborador("2", {
      proventos: 500.2,
      descontos: 100.1,
      liquido: 400.1,
      valorFGTS: 40.02,
      rubricas: [rubrica("200", "Hora extra 100%", 25.25), rubrica("102", "IMPOSTO DE RENDA", 30.15)],
    }),
  ];

  assert.deepEqual(computeTotaisGerais(employees), {
    totalColaboradores: 2,
    totalProventos: 1500.3,
    totalDescontos: 300.15,
    liquidoGeral: 1200.15,
    totalFGTS: 120.03,
    totalINSS: 90.1,
    totalIRRF: 30.15,
    totalHE: 75.5,
  });
});

test("consolida empresas da mesma competência preservando origem e totais", () => {
  const combined = combineExtratoMensalSources([
    { uploadId: "up-a", fileName: "empresa-a.pdf", result: extraction("Empresa A", "111", [colaborador("1", { liquido: 100 })]) },
    { uploadId: "up-b", fileName: "empresa-b.pdf", result: extraction("Empresa B", "222", [colaborador("1", { liquido: 250 })]) },
  ]);

  assert.ok(combined);
  assert.equal(combined.consolidado, true);
  assert.equal(combined.empresa.nome, "Consolidado (2 empresas)");
  assert.equal(combined.colaboradores.length, 2);
  assert.equal(combined.colaboradores[0].id, "up-a:1");
  assert.equal(combined.colaboradores[1].arquivoOrigem, "empresa-b.pdf");
  assert.equal(combined.totaisGerais.liquidoGeral, 350);
});

test("interpreta uma linha sintética e mantém os totais rastreáveis", () => {
  const header = row(700, [
    ["CÓDIGO", 0], ["NOME", 40], ["Horas", 150], ["Salário", 190], ["Hora Extra", 230],
    ["Repouso", 270], ["salario familia", 310], ["Insalubridade", 350], ["Periculosidade", 390],
    ["Adic. Noturno", 430], ["Outros", 470], ["Total", 510], ["INSS", 550], ["Vale", 590],
    ["Descont autoriz", 630], ["IRRF", 670], ["Outros", 710], ["Total", 750], ["Receber", 790],
    ["Assinatura", 830],
  ]);
  const employee = row(680, [
    ["000025", 0], ["JOAO VICTOR", 40], ["220:00", 150], ["3117,21", 190], ["100", 230],
    ["20", 270], ["0", 310], ["0", 350], ["0", 390], ["0", 430], ["0", 470],
    ["3237,21", 510], ["262,65", 550], ["0", 590], ["0", 630], ["0", 670], ["247,43", 710],
    ["510,08", 750], ["2727,13", 790],
  ]);

  const parsed = parseSinteticoRows([header, employee]);
  assert.equal(parsed.anchorsFound, true);
  assert.equal(parsed.linhas.length, 1);
  assert.equal(parsed.linhas[0].totalHE, 120);
  assert.equal(parsed.linhas[0].camposBaixaConfianca.length, 0);
  assert.deepEqual(computeSinteticoTotais(parsed.linhas), {
    totalColaboradores: 1,
    totalSalario: 3117.21,
    totalHE: 120,
    totalProventos: 3237.21,
    totalINSS: 262.65,
    totalVT: 0,
    totalIR: 0,
    totalDescontos: 510.08,
    liquidoGeral: 2727.13,
  });
});

test("toast global preserva variantes, acessibilidade e comportamento flutuante", async () => {
  const [provider,layout,styles,collaborators]=await Promise.all([
    readFile(new URL("../src/components/ui/ToastProvider.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/app/layout.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/app/globals.css",import.meta.url),"utf8"),
    readFile(new URL("../src/app/cadastros/colaboradores/page.tsx",import.meta.url),"utf8"),
  ]);
  for(const variant of ["success","error","warning","info"])assert.match(provider,new RegExp(`${variant}:`));
  assert.match(provider,/fixed inset-x-4 top-4 z-40/);
  assert.match(provider,/pointer-events-none/);
  assert.match(provider,/aria-label="Fechar notificação"/);
  assert.match(provider,/onMouseEnter={pause}/);
  assert.match(provider,/current\.slice\(-3\)/);
  assert.match(layout,/<ToastProvider>/);
  assert.match(styles,/@keyframes toast-in/);
  assert.match(styles,/@keyframes toast-out/);
  assert.match(collaborators,/toast\.success/);
  assert.match(collaborators,/toast\.error/);
  assert.doesNotMatch(collaborators,/\{error&&<div role="alert"/);
});

test("remoção na revisão descarta somente o grupo do upload e preserva o cadastro mestre", async () => {
  const [server, review, route] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/food/ma-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/ui/FoodMaReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/food/[batchId]/review-group/route.ts", import.meta.url), "utf8"),
  ]);
  const removal = server.slice(server.indexOf("export async function removeFoodReviewGroup"), server.indexOf("export type FoodMaEdit"));
  assert.match(removal, /status !== "UNDER_REVIEW"/);
  assert.match(removal, /where: \{ batchId, normalizedReceivedName, deletedAt: null \}/);
  assert.match(removal, /included: false, deletedAt: new Date\(\), deletedByUserId: userId/);
  assert.doesNotMatch(removal, /foodEmployee\.(delete|update)/);
  assert.match(server, /mealOccurrences: \{ where: \{ deletedAt: null \}/);
  assert.match(server, /where: \{ batchId, deletedAt: null \}/);
  assert.match(review, /Remover da importação/);
  assert.match(review, /resolutions: activeGroups\.map/);
  assert.match(review, /useToast/);
  assert.match(route, /FINANCIAL_RECORDS_CREATE/);
});

test("cancelamento da revisão descarta o staging e reseta o input sem gerar obrigação", async () => {
  const [server, review, page, route] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/food/ma-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/ui/FoodMaReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/food/[batchId]/discard/route.ts", import.meta.url), "utf8"),
  ]);
  const discard = server.slice(server.indexOf("export async function discardFoodImportReview"), server.indexOf("export type FoodMaEdit"));
  assert.match(discard, /status !== "UNDER_REVIEW"/);
  assert.match(discard, /current: false, cancelledAt: now/);
  assert.match(discard, /removePrivateFile\(storageKey\)/);
  assert.doesNotMatch(discard, /foodEmployee|foodEmployeeAlias|financialRecord/);
  assert.match(review, />Cancelar importação<\/Button>/);
  assert.match(review, /Nenhum dado da revisão foi confirmado/);
  assert.match(page, /const resetFoodImportReview = \(\) =>/);
  for (const reset of [/setFile\(null\)/, /setFileName\(""\)/, /setUploadStatus\("normal"\)/, /setFileInputKey/]) assert.match(page, reset);
  assert.match(page, /key=\{fileInputKey\}/);
  assert.match(route, /FINANCIAL_RECORDS_CREATE/);
});

test("shell corporativo centraliza identidade, navegação, sessão e responsividade", async () => {
  const [layout, shell, styles, header, sidebar, profile, drawer] = await Promise.all([
    readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/shell/AppHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/shell/SidebarNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/shell/ProfileMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/Drawer.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Manrope/);assert.doesNotMatch(layout,/Cause/);assert.match(layout,/<AppShell>/);
  for(const token of ["--color-background: #f7f7f5","--color-surface: #ffffff","--color-primary: #af1b1b"])assert.ok(styles.toLowerCase().includes(token));
  // shell novo: sidebar clara (sem o bloco preto), trilho de ícones em 1024–1279px, expandida em >= 1280px, drawer < 1024px
  assert.doesNotMatch(styles, /\.app-sidebar|--color-sidebar|\.app-mobile-header|\.app-drawer/);
  assert.match(styles, /\.app-content main \{ max-width: 1440px/);
  assert.match(shell, /visibleNavigationGroups/); assert.match(shell, /\/api\/auth\/me/); assert.match(shell, /\/api\/auth\/logout/);
  assert.match(shell, /<Drawer /); assert.match(shell, /lg:pl-\[4\.5rem\] xl:pl-60/); assert.match(shell, /<title>\{`\$\{meta\.title\} · Projeta`\}<\/title>/);
  assert.doesNotMatch(shell, /<main/); // cada página já tem o próprio <main>
  // header sem busca global/notificações; trilha de ancestrais; perfil com Sair
  assert.match(header, /aria-label="Localização"/); assert.match(header, /aria-expanded=\{menuOpen\}/); assert.match(header, /aria-controls=\{drawerId\}/); assert.doesNotMatch(header, /Bell|Search|<input/);
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/); assert.match(sidebar, /aria-label="Navegação principal"/);
  assert.match(profile, /aria-haspopup="menu"/); assert.match(profile, /role="menuitem"/); assert.match(profile, /"Sair"/); assert.doesNotMatch(profile, /Meu perfil|Configurações/);
  assert.match(drawer, /showModal\(\)/); assert.match(drawer, /onCancel=/); assert.match(drawer, /opener\.current\?\.focus\(\)/);
  // CorporateHeader (no-op legado) removido de todas as telas
  await assert.rejects(readFile(new URL("../src/components/CorporateHeader.tsx", import.meta.url), "utf8"));
});

test("navegação do shell: grupos por permissão, item ativo e trilha sem repetir o título da página", async () => {
  const { NAVIGATION_GROUPS, visibleNavigationGroups, isNavigationItemActive, resolveRouteMeta, roleLabel } = await import("../src/modules/core/navigation/moduleRegistry");
  const item = (id: string) => NAVIGATION_GROUPS.flatMap((group) => group.items).find((entry) => entry.id === id)!;
  // grupos e itens reais; Café/Cesta não entram na sidebar
  assert.deepEqual(NAVIGATION_GROUPS.map((group) => group.label), ["Visão geral", "Despesas", "Contabilidade", "Cadastros", "Administração"]);
  assert.doesNotMatch(JSON.stringify(NAVIGATION_GROUPS), /Café|Cesta/);
  assert.equal(item("dashboard").availability, "planned"); assert.equal(item("dashboard").href, undefined);
  // permissões só escondem navegação (sem nenhuma rota permitida = nada; o Dashboard planejado aparece desabilitado para quem tem acesso)
  assert.deepEqual(visibleNavigationGroups([]).map((group) => group.id), []);
  assert.deepEqual(visibleNavigationGroups(["financial-records.read"]).map((group) => [group.id, group.items.map((entry) => entry.id)]), [["overview", ["dashboard"]], ["expenses", ["food", "transit-voucher", "training-expenses"]]]);
  const all = visibleNavigationGroups(["financial-records.read", "accounting.read", "master-data.read", "training.read", "users.read"]);
  assert.deepEqual(all.map((group) => group.id), ["overview", "expenses", "accounting", "master-data", "administration"]);
  // item ativo: Entidades só em /cadastros (não em /cadastros/colaboradores); Folha também na raiz "/"
  assert.equal(isNavigationItemActive("/cadastros", item("entities")), true); assert.equal(isNavigationItemActive("/cadastros/colaboradores", item("entities")), false);
  assert.equal(isNavigationItemActive("/cadastros/colaboradores", item("collaborators")), true);
  assert.equal(isNavigationItemActive("/", item("payroll")), true); assert.equal(isNavigationItemActive("/pagamentos", item("payroll")), false);
  assert.equal(isNavigationItemActive("/pagamentos/alimentacao", item("food")), true); assert.equal(isNavigationItemActive("/pagamentos/abc/validacao", item("food")), false);
  // título da aba + trilha de ANCESTRAIS (nunca o título da própria página, que é o h1 do PageHeader)
  assert.deepEqual(resolveRouteMeta("/cadastros/colaboradores"), { title: "Colaboradores", trail: [{ label: "Cadastros" }] });
  assert.deepEqual(resolveRouteMeta("/pagamentos/alimentacao"), { title: "Alimentação", trail: [{ label: "Despesas", href: "/pagamentos" }] });
  assert.deepEqual(resolveRouteMeta("/pagamentos/rec123/validacao"), { title: "Validação documental", trail: [{ label: "Despesas", href: "/pagamentos" }, { label: "Obrigação", href: "/pagamentos/rec123" }] });
  assert.deepEqual(resolveRouteMeta("/usuarios").title, "Usuários"); assert.deepEqual(resolveRouteMeta("/rota-inexistente"), { title: "Projeta", trail: [] });
  for (const path of ["/", "/contabilidade/folha", "/pagamentos", "/pagamentos/vale-transporte", "/pagamentos/treinamentos", "/pagamentos/x", "/cadastros", "/treinamentos"]) {
    const meta = resolveRouteMeta(path); assert.notEqual(meta.title, "Projeta", path); assert.ok(!meta.trail.some((crumb) => crumb.label === meta.title), path);
  }
  assert.equal(roleLabel("ADMIN"), "Administrador"); assert.equal(roleLabel("DESCONHECIDO"), "DESCONHECIDO"); assert.equal(roleLabel(undefined), "");
});

test("revisão de alimentação usa resumo compacto e workspace modal responsivo", async () => {
  const [review, styles] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/food/ui/FoodMaReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(review, /Revisão de colaboradores/);assert.match(review, /setReviewOpen\(true\)/);
  assert.match(review, /<dialog ref=\{dialogRef\}/);assert.match(review, /onCancel=/);assert.match(review, /aria-labelledby/);assert.match(review, /aria-label="Fechar revisão"/);
  assert.match(review, /"IDENTIFIED"/);assert.match(review, /Identificados \(\{identifiedCount\}\)/);
  assert.match(review, /food-review-header/);assert.match(review, /food-review-body/);assert.match(review, /food-review-footer/);
  assert.match(review, /disabled=\{pendingCount>0\}/);assert.match(review, /FloatingActionMenu/);assert.match(review, /review-group/);assert.match(review, /\/discard/);
  assert.match(styles,/grid-template-rows: auto auto minmax\(0,1fr\) auto/);assert.match(styles,/width: min\(94vw,1500px\)/);assert.match(styles,/height: min\(90vh,920px\)/);assert.match(styles,/width: 100vw; height: 100dvh/);assert.match(styles,/body:has\(\.food-review-dialog\[open\]\) \{ overflow: hidden/);
});

test("design system mantém densidade compacta com alvos móveis acessíveis", async () => {
  const [styles, surface, toast] = await Promise.all([
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/SurfaceCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/ToastProvider.tsx", import.meta.url), "utf8"),
  ]);
  for (const token of [
    "--density-control-sm: 2rem",
    "--density-control-md: 2.25rem",
    "--density-text-base: 0.8125rem",
    "--density-text-title: 1.25rem",
  ]) assert.ok(styles.includes(token));
  assert.match(styles, /font-size: var\(--density-text-base\)/);
  assert.match(styles, /:where\(\.btn\) \{ min-height: var\(--density-control-md\)/);
  assert.match(styles, /:where\(\.table td,\.table th\) \{[^}]*padding: \.45rem \.75rem/);
  assert.match(styles, /@media \(max-width: 639px\).*min-height: 2\.5rem/);
  assert.match(surface, /gap-3 p-3 sm:p-4/);
  assert.match(toast, /h-5 w-5/);
  assert.doesNotMatch(styles, /transform:\s*scale\(0\.85\)/);
});

test("autocomplete de colaborador usa um único input editável", async () => {
  const combobox = await readFile(new URL("../src/components/CollaboratorCombobox.tsx", import.meta.url), "utf8");
  assert.equal(combobox.match(/<input\b/g)?.length, 1);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-autocomplete="list"/);
  assert.match(combobox, /value=\{open \? query : selected\?\.officialName/);
  assert.match(combobox, /onChange=\{\(event\)=>\{setQuery/);
  assert.match(combobox, /event\.key==="ArrowDown"/);
  assert.match(combobox, /event\.key==="ArrowUp"/);
  assert.match(combobox, /event\.key==="Enter"/);
  assert.match(combobox, /event\.key==="Escape"/);
  assert.doesNotMatch(combobox, /<button ref=\{anchor\}[^>]*role="combobox"/);
});

test("ocorrências só são carregadas e gerenciadas enquanto o lote é editável", async () => {
  const [{ canManageFoodOccurrences }, server, page, recordsRoute] = await Promise.all([
    import("../src/modules/accounts-payable/food/batch-state"),
    readFile(new URL("../src/modules/accounts-payable/food/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/food/[batchId]/records/route.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(canManageFoodOccurrences("UNDER_REVIEW"), true);
  assert.equal(canManageFoodOccurrences("WITH_INCONSISTENCIES"), true);
  assert.equal(canManageFoodOccurrences("READY"), false);
  assert.match(server, /filter\(\(batch\) => canManageFoodOccurrences\(batch\.status\)\)/);
  assert.match(server, /mealOccurrenceCount: _count\.mealOccurrences/);
  assert.match(page, /batch\.mealOccurrenceCount > 0 && batch\.status === "READY"/);
  assert.match(page, /`\/api\/accounts-payable\/food\/\$\{batch\.id\}\/records`/);
  assert.match(page, /occurrences=\{editorOccurrences\}/);
  assert.match(page, /Editar rateio/);
  assert.match(page, /Download do rateio XLSX/);
  assert.match(page, /Excluir lote/);
  assert.match(recordsRoute, /export async function GET/);
});

test("consolidado de alimentação gera relatório gerencial por localidade e ciclo", async () => {
  const batch = (id:string,locality:"MA"|"PA",cycle:number,supplier:string,amounts:number[],sector:string,employeeIds:string[]):ConsolidatedFoodBatch => ({
    id,locality,cycle,validRows:amounts.length,totalAmount:amounts.reduce((sum,value)=>sum+value,0),competence:{year:2026,month:8},administrativeEntity:{tradeName:supplier},
    allocations:amounts.map((amount,index)=>({id:`${id}-${index}`,sourceIdentifier:employeeIds[index],employeeName:index===0?"ÁLVARO DE NOME EXTREMAMENTE LONGO PARA VALIDAÇÃO":"Beatriz",department:sector,locality,unitPrice:100,amount})),
  });
  const batches=[
    batch("ma1-a","MA",1,"Fornecedor A",[100,200],"Administração",["employee-1","employee-2"]),
    batch("ma1-b","MA",1,"Fornecedor B",[300],"Engenharia",["employee-1"]),
    batch("ma2","MA",2,"Fornecedor A",[400],"Comercial",["employee-3"]),
    batch("pa","PA",0,"Restaurante PA",[125000],"T.I.",["employee-4"]),
  ];
  const workbook=buildFoodConsolidatedWorkbook(batches);
  const values=(row:ExcelJS.Row)=>(row.values as ExcelJS.CellValue[]).slice(1);
  const fill=(cell:ExcelJS.Cell)=>(cell.fill as ExcelJS.FillPattern).fgColor?.argb;
  assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),["Resumo Geral","Colaboradores MA-1","Setores MA-1","Colaboradores MA-2","Setores MA-2","Colaboradores PA","Setores PA"]);
  const general=workbook.getWorksheet("Resumo Geral")!;
  assert.deepEqual(values(general.getRow(1)),["Localidade","Ciclo","Fornecedor","Refeições","Valor"]);
  assert.equal(general.getCell(`A${general.rowCount}`).value,"TOTAL");assert.equal(general.getCell(`B${general.rowCount}`).value,null);assert.equal(general.getCell(`C${general.rowCount}`).value,null);assert.equal(general.getCell(`D${general.rowCount}`).value,5);assert.equal(general.getCell(`E${general.rowCount}`).value,126000);
  assert.equal(fill(general.getCell("A1")),"FFAF1B1B");
  assert.equal(fill(general.getCell(`A${general.rowCount}`)),"FF000000");
  assert.equal(general.getCell("E2").numFmt,'"R$" #,##0.00');
  assert.equal(general.columnCount,5);
  const people=workbook.getWorksheet("Colaboradores MA-1")!;
  assert.deepEqual(values(people.getRow(1)),["Colaborador","Setor","Localidade","Fornecedor","Competência","Valor unitário","Valor"]);
  assert.equal(people.columnCount,7);assert.equal(people.getColumn(1).width,40);assert.equal(people.views[0].state,"frozen");
  assert.equal(people.getCell("B2").value,"ADMINISTRAÇÃO");
  assert.equal(people.getCell("F2").numFmt,'"R$" #,##0.00');assert.equal(typeof people.getCell("G2").value,"number");
  const sectors=workbook.getWorksheet("Setores MA-1")!;const total=sectors.getRow(sectors.rowCount);
  assert.deepEqual(values(total),["TOTAL",2,600]);
  assert.equal(sectors.getCell("A2").value,"ADMINISTRAÇÃO");assert.equal(sectors.getCell("A3").value,"ENGENHARIA");
  assert.equal(fill(total.getCell(1)),"FF000000");
  const buffer=await workbook.xlsx.writeBuffer();const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(buffer);
  assert.equal(reopened.worksheets.length,7);assert.equal(reopened.getWorksheet("Setores PA")!.getCell("C2").value,125000);
  const empty=buildFoodConsolidatedWorkbook([]);assert.deepEqual(empty.worksheets.map(sheet=>sheet.name),["Resumo Geral"]);
});

test("rateio XLSX de alimentação mantém cálculos e as duas abas gerenciais (+ 4 perspectivas de rateio ao final)", async () => {
  const occurrence=(id:string,employeeId:string|null,name:string,sector:string,amount:number,included=true,mealQuantity=1):FoodRateioBatch["mealOccurrences"][number]=>({
    id,employeeId,normalizedReceivedName:name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(),receivedName:name,officialName:name,receivedDepartment:sector,confirmedDepartment:sector,amount,included,mealQuantity,
  });
  const batch:FoodRateioBatch={mealOccurrences:[
    occurrence("1","person-2","Zuleica de Nome Extremamente Longo para Validação","engenharia",25),
    occurrence("2","person-1","Álvaro Lima","Administrativo",21),
    occurrence("3","person-1","Álvaro Lima","ADMINISTRATIVO",23),
    occurrence("4","person-3","Beatriz Souza"," administrativo ",125000,true,20),
    occurrence("5",null,"Carla Pa","Comercial",10),
    occurrence("6",null,"Carla Pa","COMERCIAL",20),
    occurrence("7","excluded","Ignorada","Auditoria",999,false),
  ]};
  const workbook=buildFoodRateioWorkbook(batch);
  const values=(row:ExcelJS.Row)=>(row.values as ExcelJS.CellValue[]).slice(1);
  const fill=(cell:ExcelJS.Cell)=>(cell.fill as ExcelJS.FillPattern).fgColor?.argb;
  assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),["Resumo por Setor","Rateio por Colaborador","Rateio - Departamento","Rateio - Centro de Custo","Rateio - Empresa Departamento","Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  const summary=workbook.getWorksheet("Resumo por Setor")!;
  assert.deepEqual(values(summary.getRow(1)),["Setor","Colaboradores","Refeições","Valor"]);
  assert.deepEqual(values(summary.getRow(2)),["ADMINISTRATIVO",2,22,125044]);
  assert.deepEqual(values(summary.getRow(3)),["COMERCIAL",1,2,30]);
  assert.deepEqual(values(summary.getRow(4)),["ENGENHARIA",1,1,25]);
  assert.deepEqual(values(summary.getRow(5)),["TOTAL",4,25,125099]);
  assert.equal(fill(summary.getCell("A1")),"FFAF1B1B");assert.equal(fill(summary.getCell("A5")),"FF000000");
  assert.equal(summary.getCell("A1").font.name,"Calibri");assert.equal(summary.getCell("A1").font.size,11);
  assert.equal(summary.getCell("D2").numFmt,'"R$" #,##0.00');assert.equal(typeof summary.getCell("D2").value,"number");
  assert.equal(summary.getCell("B2").alignment.horizontal,"center");assert.equal(summary.getCell("C2").alignment.horizontal,"center");
  assert.equal(summary.views[0].state,"frozen");assert.equal(summary.autoFilter?.toString(),"A1:D5");assert.equal(summary.columnCount,4);
  assert.deepEqual([summary.getColumn(1).width,summary.getColumn(2).width,summary.getColumn(3).width,summary.getColumn(4).width],[30,18,14,18]);
  const allocation=workbook.getWorksheet("Rateio por Colaborador")!;
  assert.deepEqual(values(allocation.getRow(1)),["Setor","Colaborador","Refeições","Valor Médio","Custo","Restaurante","Emissão NF"]);
  assert.deepEqual(values(allocation.getRow(2)),["ADMINISTRATIVO","Álvaro Lima",2,22,44,"",""]);
  assert.deepEqual(values(allocation.getRow(3)),["ADMINISTRATIVO","Beatriz Souza",20,6250,125000,"",""]);
  assert.equal(allocation.getCell("A4").value,"COMERCIAL");assert.equal(allocation.getCell("A5").value,"ENGENHARIA");
  assert.equal(allocation.getCell("C2").alignment.horizontal,"center");assert.equal(allocation.getCell("D2").numFmt,'"R$" #,##0.00');assert.equal(allocation.getCell("E2").numFmt,'"R$" #,##0.00');
  assert.equal(allocation.views[0].state,"frozen");assert.equal(allocation.autoFilter?.toString(),"A1:G5");assert.equal(allocation.columnCount,7);
  assert.equal(allocation.getColumn(2).width,34);
  const serialized=await workbook.xlsx.writeBuffer();const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(serialized);
  assert.deepEqual(reopened.worksheets.map(sheet=>sheet.name),["Resumo por Setor","Rateio por Colaborador","Rateio - Departamento","Rateio - Centro de Custo","Rateio - Empresa Departamento","Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  assert.equal(reopened.getWorksheet("Resumo por Setor")!.getCell("D5").value,125099);
  for(const context of ["MA 1º Ciclo","MA 2º Ciclo","PA"]) assert.doesNotThrow(()=>buildFoodRateioWorkbook(batch),context);
  const empty=buildFoodRateioWorkbook({mealOccurrences:[]});
  assert.deepEqual(values(empty.getWorksheet("Resumo por Setor")!.getRow(2)),["TOTAL",0,0,0]);
  assert.equal(empty.getWorksheet("Rateio por Colaborador")!.rowCount,1);
});

test("lançamento manual PA persiste quantidades individuais, ignora duplicidades e nunca expõe erro de parser", async () => {
  const dates=Array.from({length:10},(_,index)=>`2026-08-${String(index+17).padStart(2,"0")}`);
  const full=buildManualFoodCombinations(["employee-1","employee-2"],dates);
  assert.equal(full.accepted.length,20);assert.equal(full.skipped.length,0);assert.equal(full.accepted.length*30,600);
  assert.equal(buildManualFoodCombinations(["employee-1"],[dates[0]]).accepted.length,1);
  assert.equal(buildManualFoodCombinations(["1","2","3","4","5"],[dates[0]]).accepted.length,5);
  assert.equal(buildManualFoodCombinations(["employee-1"],dates).accepted.length,10);
  const duplicateKeys=new Set([`employee-1:${dates[0]}`,`employee-1:${dates[1]}`,`employee-2:${dates[0]}`]);
  const partial=buildManualFoodCombinations(["employee-1","employee-2"],dates,duplicateKeys);
  assert.equal(partial.accepted.length,17);assert.equal(partial.skipped.length,3);
  const success=await parseManualFoodResponse(new Response(JSON.stringify({ok:true,batchId:"batch",created:3,meals:60,skipped:0,total:1800,duplicateDetails:[]}),{status:201,headers:{"Content-Type":"application/json"}}));
  assert.deepEqual([success.created,success.meals,success.skipped,success.total],[3,60,0,1800]);
  await assert.rejects(()=>parseManualFoodResponse(new Response(null,{status:500})),/Não foi possível salvar as ocorrências/);
  await assert.rejects(()=>parseManualFoodResponse(new Response("<html>erro</html>",{status:500})),/Não foi possível salvar as ocorrências/);
  await assert.rejects(()=>parseManualFoodResponse(new Response(JSON.stringify({ok:false,error:"Falha controlada"}),{status:500})),/Falha controlada/);
  const [server,route,page]=await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/food/manual-server.ts",import.meta.url),"utf8"),
    readFile(new URL("../src/app/api/accounts-payable/food/manual/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(server,/\/v\$\{version\}/);assert.match(server,/mealQuantity: quantity/);assert.match(server,/amount: unitPrice\.mul\(quantity\)/);assert.match(server,/occurredOn: date/);
  assert.match(route,/ok: true/);assert.match(route,/ok: false/);assert.match(route,/created: result\.createdCount/);assert.match(route,/skipped: result\.duplicateCount/);
  assert.match(page,/collaborators: manualEmployeeIds\.map/);assert.match(page,/quantity: Number\(manualQuantities\[collaboratorId\]\)/);assert.match(page,/locality === "MA" &&/);assert.match(page,/parseManualFoodResponse\(response\)/);
});

test("gestão de usuários aplica RBAC, proteção administrativa, status, recovery e auditoria no backend", async () => {
  const [schema, users, userRoute, resetRoute, login, session, proxy, page, recoveryPage, mail] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/db/users.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/users/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/users/[id]/password-reset/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/auth/session.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/usuarios/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/redefinir-senha/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/auth/password-reset-mail.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /active\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /model PasswordResetToken/); assert.match(schema, /tokenHash\s+String\s+@unique/); assert.match(schema, /model UserAccessAudit/);
  assert.match(users, /activeAdmins <= 1/); assert.match(users, /último Administrador ativo/); assert.match(users, /input\.actorId === target\.id/);
  assert.match(users, /tx\.session\.deleteMany/); assert.match(users, /Serializable/); assert.doesNotMatch(users, /details:.*password/i);
  assert.match(userRoute, /requirePermission\(PERMISSIONS\.ROLES_MANAGE\)/); assert.match(resetRoute, /requirePermission\(PERMISSIONS\.ROLES_MANAGE\)/);
  assert.match(login, /!user\.active/); assert.match(session, /!session\.user\.active/); assert.match(proxy, /session\.user\.active/);
  assert.match(mail, /import "server-only"/); assert.match(mail, /nodemailer\.createTransport/); assert.doesNotMatch(mail, /NEXT_PUBLIC_/);
  assert.match(page, /FloatingActionMenu/); assert.match(page, /Todos os perfis/); assert.match(page, /Todos os status/); assert.match(page, /Redefinir senha/); assert.match(page, /useToast/);
  assert.match(recoveryPage, /\/api\/auth\/password-reset/); assert.match(recoveryPage, /minLength=\{8\}/);
});

test("Contas a Pagar usa cards laterais compactos, acessíveis e responsivos", async () => {
  const [page, card] = await Promise.all([
    readFile(new URL("../src/app/pagamentos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ExpenseSectionCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /UtensilsCrossed/); assert.match(page, /BusFront/); assert.match(page, /GraduationCap/);
  assert.match(page, /lg:grid-cols-2/); assert.match(page, /\/pagamentos\/alimentacao/); assert.match(page, /\/pagamentos\/vale-transporte/); assert.match(page, /\/pagamentos\/treinamentos/);
  assert.match(card, /card card-side/); assert.match(card, /sm:flex-row/); assert.match(card, /h-20 w-full/); assert.match(card, /sm:w-\[7\.5rem\]/);
  assert.match(card, /hover:-translate-y-px/); assert.match(card, /focus-visible:ring-2/); assert.match(card, /aria-disabled="true"/);
  assert.doesNotMatch(`${page}\n${card}`, /🍽️|🚌|https?:\/\//);
});

test("dias úteis: segunda a sexta menos feriados que caem em dia útil", () => {
  // Setembro/2026 tem 22 dias entre segunda e sexta (01/09 é terça).
  assert.equal(calculateWorkingDays(2026, 9, []), 22);
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-02"]), 21); // quarta
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-05"]), 22); // sábado não reduz de novo
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-06"]), 22); // domingo
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-02", "2026-09-07", "2026-09-05"]), 20);
  const summary = summarizeCompetenceDays(2026, 9, ["2026-09-02", "2026-09-05"]);
  assert.deepEqual(summary, { weekdays: 22, holidaysInMonth: 2, holidaysOnWeekdays: 1, workingDays: 21 });
  // remover o feriado recalcula
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-02"].filter((day) => day !== "2026-09-02")), 22);
});

test("vale transporte: passagens a receber e valor total (sem float e sem clamp)", () => {
  const fare = parseFareToCents("4,20");
  assert.equal(fare, 420);
  assert.equal(centsToDecimalString(calculateTransitVoucherEmployeeTotal(fare, 2, 21)), "176.40");
  assert.equal(centsToDecimalString(calculateTransitVoucherEmployeeTotal(fare, 3, 21)), "264.60");
  const receivable = calculatePassagesToReceive(21, 2, 5);
  assert.equal(receivable, 18);
  assert.equal(centsToDecimalString(calculateTransitVoucherEmployeeTotal(fare, 2, receivable)), "151.20");
  const negative = calculatePassagesToReceive(21, 0, 25);
  assert.equal(negative, -4);
  assert.throws(() => assertPassagesToReceive(negative, "João"), /negativo/);
  assert.throws(() => calculateTransitVoucherEmployeeTotal(fare, 2, negative));
  assert.throws(() => calculatePassagesToReceive(21.5, 0, 0));
  assert.throws(() => parseFareToCents("0"));
  assert.throws(() => parseFareToCents("4.201"));
});

test("observação do vale transporte: férias com prefixo e outros sem prefixo", () => {
  assert.equal(formatTransitObservation("VACATION", "24/08 a 22/09"), "Férias: 24/08 a 22/09");
  assert.equal(formatTransitObservation("OTHER", "Pagamento complementar"), "Pagamento complementar");
  assert.equal(formatTransitObservation(null, null), "");
});

test("vale transporte manual: sem upload na interface e cálculo/validação no backend", async () => {
  const [page, server, route] = await Promise.all([
    readFile(new URL("../src/app/pagamentos/vale-transporte/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/transit-voucher/manual-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/transit-voucher/entries/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /Upload de arquivo|FileInput|3\. Benefício|4\. Financeiro/);
  // preenchimento manual (Fase 7G: no Design System, sem a numeração antiga das seções)
  assert.match(page, /Competência, calendário e tarifa/); assert.match(page, /<TransitFillTable/); assert.match(page, /Salvar \/ Gerar Rateio/);
  assert.match(server, /calculateTransitVoucherEmployeeTotal/); assert.match(server, /assertPassagesToReceive/); assert.match(server, /createFinancialRecordInTransaction/);
  assert.match(route, /FINANCIAL_RECORDS_CREATE/); assert.doesNotMatch(server, /entry\.amount|entries\[\d\]\.amount/);
});

test("novembro/2026: cenários de feriado isolados (21 dias úteis base)", () => {
  // 02/11 é segunda-feira; 15/11 é domingo.
  assert.equal(calculateWorkingDays(2026, 11, []), 21); // A
  assert.equal(calculateWorkingDays(2026, 11, ["2026-11-15"]), 21); // B: só domingo
  assert.equal(calculateWorkingDays(2026, 11, ["2026-11-02"]), 20); // C: só segunda
  assert.equal(calculateWorkingDays(2026, 11, ["2026-11-02", "2026-11-15"]), 20); // D: segunda + domingo
  // feriado de fim de semana continua marcado como feriado no calendário sem reduzir o total
  const summary = summarizeCompetenceDays(2026, 11, ["2026-11-15"]);
  assert.equal(summary.holidaysInMonth, 1); assert.equal(summary.holidaysOnWeekdays, 0);
  // 21 dias com 1 feriado útil × 2 passagens × R$ 4,20 = R$ 168,00
  assert.equal(centsToDecimalString(calculateTransitVoucherEmployeeTotal(420, 2, calculateWorkingDays(2026, 11, ["2026-11-02"]))), "168.00");
});

test("feriados nacionais automáticos (Vale Transporte): regras, móveis e pontos facultativos", async () => {
  const { getBrazilianNationalHolidays, getEffectiveTransitVoucherHolidays, toHolidaySnapshot } = await import("../src/modules/accounts-payable/transit-voucher/holidays");
  const dates = (year: number) => getBrazilianNationalHolidays(year).map((holiday) => holiday.date);
  // 2026: fixos + Sexta-feira Santa (Páscoa em 05/04/2026 → 03/04); Zumbi/Consciência Negra 20/11 (Lei 14.759/2023)
  assert.deepEqual(dates(2026), ["2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]);
  assert.equal(getBrazilianNationalHolidays(2026).find((holiday) => holiday.date === "2026-11-20")?.name, "Dia Nacional de Zumbi e da Consciência Negra");
  assert.ok(!dates(2023).includes("2023-11-20"));
  assert.ok(dates(2027).includes("2027-03-26") && dates(2028).includes("2028-04-14")); // Páscoa 28/03/2027 e 16/04/2028
  // Carnaval (17/02/2026) e Corpus Christi (04/06/2026) são pontos facultativos: nunca automáticos
  assert.ok(!dates(2026).includes("2026-02-17") && !dates(2026).includes("2026-06-04"));
  const days = (year: number, month: number, manual: { date: string; name: string }[] = []) => calculateWorkingDays(year, month, getEffectiveTransitVoucherHolidays(year, month, manual).map((holiday) => holiday.date));
  assert.equal(days(2026, 2), 20); assert.equal(days(2026, 6), 22);
  // nacional em dia útil (07/09/2026, segunda): reduz 1; sem feriados a competência teria 22
  assert.equal(days(2026, 9), 21);
  // nacional no domingo (15/11/2026): aparece como feriado e não reduz; 02/11 (segunda) e 20/11 (sexta) reduzem
  assert.equal(days(2026, 11), 19);
  assert.ok(getEffectiveTransitVoucherHolidays(2026, 11, []).some((holiday) => holiday.date === "2026-11-15"));
  // manual reduz normalmente
  assert.equal(days(2026, 9, [{ date: "2026-09-08", name: "Feriado municipal" }]), 20);
  // nacional + manual na mesma data: uma data, um dia
  assert.equal(days(2026, 9, [{ date: "2026-09-07", name: "Outro nome" }]), 21);
  const merged = getEffectiveTransitVoucherHolidays(2026, 9, [{ date: "2026-09-07", name: "Outro nome" }, { date: "2026-09-08", name: "Feriado municipal" }]);
  assert.equal(merged.length, 2); assert.equal(merged[0].source, "NATIONAL"); assert.equal(merged[0].manualName, "Outro nome"); assert.equal(merged[1].source, "MANUAL");
  // snapshot guarda nacionais + manuais
  assert.deepEqual(toHolidaySnapshot(merged).map((holiday) => holiday.source), ["NATIONAL", "MANUAL"]);
});

test("café da manhã: quantidade, extras e valor (sem float e sem clamp)", async () => {
  const { calculateFinalQuantity, calculateBreakfastEmployeeTotal, parseUnitPriceToCents, centsToDecimalString, formatBreakfastObservation, BreakfastCalculationError } = await import("../src/modules/accounts-payable/breakfast/calculations");
  const unit = parseUnitPriceToCents("12,50");
  assert.equal(unit, 1250);
  // Teste 1 — sem desconto: 21 dias úteis, sem extras, sem desconto
  assert.equal(calculateFinalQuantity(21, 0, 0), 21);
  assert.equal(centsToDecimalString(calculateBreakfastEmployeeTotal(unit, calculateFinalQuantity(21, 0, 0))), "262.50");
  // Teste 2 — com desconto: 21 + 0 - 5 = 16
  assert.equal(calculateFinalQuantity(21, 0, 5), 16);
  assert.equal(centsToDecimalString(calculateBreakfastEmployeeTotal(unit, calculateFinalQuantity(21, 0, 5))), "200.00");
  // Teste 3 — extra + desconto: 21 + 2 - 5 = 18
  assert.equal(calculateFinalQuantity(21, 2, 5), 18);
  assert.equal(centsToDecimalString(calculateBreakfastEmployeeTotal(unit, calculateFinalQuantity(21, 2, 5))), "225.00");
  // feriado útil reduz a quantidade base (dias úteis) de 22 para 21
  const daysWithHoliday = calculateWorkingDays(2026, 9, ["2026-09-02"]); // quarta-feira
  assert.equal(daysWithHoliday, 21); // setembro/2026 sem feriado tem 22 dias úteis; com 1 reduz a 21
  assert.equal(calculateFinalQuantity(daysWithHoliday, 0, 0), 21);
  // feriado no fim de semana não reduz dias úteis
  assert.equal(calculateWorkingDays(2026, 9, ["2026-09-05"]), 22); // sábado
  // extras e desconto negativos são rejeitados
  assert.throws(() => calculateFinalQuantity(21, -1, 0), BreakfastCalculationError);
  assert.throws(() => calculateFinalQuantity(21, 0, -1), BreakfastCalculationError);
  assert.throws(() => parseUnitPriceToCents("0"), BreakfastCalculationError);
  // Teste 6 — desconto maior que a quantidade disponível: erro, nunca clamp em zero
  assert.throws(() => calculateFinalQuantity(20, 2, 23), /desconto não pode ser maior/i);
  // observação
  assert.equal(formatBreakfastObservation("RETROACTIVE", "2 cafés referentes ao mês anterior"), "Retroativo: 2 cafés referentes ao mês anterior");
  assert.equal(formatBreakfastObservation("OTHER", "Solicitação extraordinária"), "Solicitação extraordinária");
});

test("café da manhã: domínio próprio (sem TransitVoucher) e feriados/calendário compartilhados", async () => {
  const [schema, calc, holidays, manualServer, page] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/calculations.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/shared/holidays.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/manual-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /model BreakfastCompetence/); assert.match(schema, /model BreakfastMap/); assert.match(schema, /model BreakfastAllocation/);
  assert.doesNotMatch(calc, /TransitVoucher/); assert.doesNotMatch(manualServer, /transitVoucher/i);
  assert.match(manualServer, /getEffectiveHolidays/); assert.match(manualServer, /getBrazilianNationalHolidays/);
  assert.match(holidays, /getBrazilianNationalHolidays/);
  assert.match(page, /Café da Manhã/); assert.match(page, /BreakfastSection/);
});

test("café da manhã: somente colaboradores de TOPOGEO (regra validada no backend)", async () => {
  const { organizationalComparisonKey } = await import("../src/lib/organizational-label");
  const { BREAKFAST_ALLOWED_DEPARTMENT } = await import("../src/modules/accounts-payable/breakfast/calculations");
  assert.equal(BREAKFAST_ALLOWED_DEPARTMENT, "TOPOGEO");
  // A comparação é robusta a caixa/acentos/espaços, mas não é um "includes" amplo.
  assert.equal(organizationalComparisonKey("topogeo"), organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT));
  assert.equal(organizationalComparisonKey("  Topogeo  "), organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT));
  assert.notEqual(organizationalComparisonKey("ADMINISTRATIVO"), organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT));
  assert.notEqual(organizationalComparisonKey("TOPOGEOGRAFIA"), organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT));
  const manualServer = await readFile(new URL("../src/modules/accounts-payable/breakfast/manual-server.ts", import.meta.url), "utf8");
  assert.match(manualServer, /BREAKFAST_ALLOWED_DEPARTMENT/);
  assert.match(manualServer, /organizationalComparisonKey/);
  assert.match(manualServer, /Apenas colaboradores do departamento \$\{BREAKFAST_ALLOWED_DEPARTMENT\}/);
});

test("café da manhã: rateio consolidado Empresa → Centro de Custo (snapshot do lançamento)", async () => {
  const { groupBreakfastByCompanyCostCenter, amountToCents, BREAKFAST_EMPTY_COST_CENTER } = await import("../src/modules/accounts-payable/breakfast/rateio");
  // `employee` simula o cadastro ATUAL (CC já alterado): o rateio deve ignorá-lo e usar o snapshot.
  const rows = [
    { employeeId: "a", employeeName: "Colaborador A", company: "PROJETA", department: "TOPOGEO", costCenter: "VALE TOPOGRAFIA BMSA", amount: "262.5000", employee: { costCenter: "OUTRO CC" } },
    { employeeId: "b", employeeName: "Colaborador B", company: "PROJETA", department: "TOPOGEO", costCenter: "VALE TOPOGRAFIA BMSA", amount: "250.00", employee: { costCenter: "OUTRO CC" } },
    { employeeId: "c", employeeName: "Colaborador C", company: "PROJETA", department: "TOPOGEO", costCenter: "VALE TOPOGRAFIA SALOBO", amount: "300", employee: { costCenter: "OUTRO CC" } },
    { employeeId: "d", employeeName: "Colaborador D", company: "BOINGA", department: "TOPOGEO", costCenter: "VALE TOPOGRAFIA BMSA", amount: "200.00", employee: { costCenter: "OUTRO CC" } },
    { employeeId: "e", employeeName: "Colaborador E", company: "BOINGA", department: "TOPOGEO", costCenter: "VALE INTEGRIDADE SALOBO", amount: "287.50", employee: { costCenter: "OUTRO CC" } },
  ];
  const result = groupBreakfastByCompanyCostCenter(rows);
  const view = result.companies.map((company) => [company.company, company.people, company.totalCents, company.costCenters.map((child) => [child.costCenter, child.people, child.totalCents])]);
  assert.deepEqual(view, [
    ["BOINGA", 2, 48750, [["VALE INTEGRIDADE SALOBO", 1, 28750], ["VALE TOPOGRAFIA BMSA", 1, 20000]]],
    ["PROJETA", 3, 81250, [["VALE TOPOGRAFIA BMSA", 2, 51250], ["VALE TOPOGRAFIA SALOBO", 1, 30000]]],
  ]);
  // mesmo CC em empresas diferentes: separados, nunca somados
  assert.equal(result.grandCents, 130000); assert.equal(result.companiesCents, 130000); assert.equal(result.costCentersCents, 130000); assert.equal(result.consistent, true); assert.equal(result.people, 5);
  assert.ok(!result.companies.flatMap((company) => company.costCenters).some((child) => child.costCenter === "OUTRO CC"));
  // CC vazio/nulo → categoria explícita; nada inventado
  const empty = groupBreakfastByCompanyCostCenter([{ employeeId: "x", employeeName: "X", company: "PROJETA", costCenter: "", amount: "12.50" }, { employeeId: "y", employeeName: "Y", company: "PROJETA", costCenter: null, amount: "25.00" }]);
  assert.deepEqual(empty.companies[0].costCenters.map((child) => [child.costCenter, child.people, child.totalCents]), [[BREAKFAST_EMPTY_COST_CENTER, 2, 3750]]);
  assert.equal(amountToCents("7962.5000"), 796250); assert.equal(amountToCents("0.1"), 10); assert.equal(amountToCents(12.5), 1250);
  // o consolidado não consulta cadastro atual (FoodEmployee)
  const source = await readFile(new URL("../src/modules/accounts-payable/breakfast/rateio.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /foodEmployee|\.employee\b|@\/generated\/prisma|@\/lib\/db/);
});

test("café da manhã: XLSX resume por Empresa → Centro de Custo e preserva detalhe/auditoria", async () => {
  const { buildBreakfastWorkbook } = await import("../src/modules/accounts-payable/breakfast/workbook");
  const allocation = (id: string, company: string, costCenter: string, amount: string, finalQuantity: number) => ({ id, employeeId: id, employeeName: `Colaborador ${id.toUpperCase()}`, company, department: "TOPOGEO", costCenter, amount, workingDays: 21, baseQuantity: 21, extraQuantity: 0, discountQuantity: 21 - finalQuantity, finalQuantity, unitPrice: "12.50", observationType: null, observationDetails: null });
  const allocations = [allocation("a", "PROJETA", "VALE TOPOGRAFIA BMSA", "262.50", 21), allocation("b", "PROJETA", "VALE TOPOGRAFIA BMSA", "250.00", 20), allocation("c", "PROJETA", "VALE TOPOGRAFIA SALOBO", "300.00", 24), allocation("d", "BOINGA", "VALE TOPOGRAFIA BMSA", "200.00", 16), allocation("e", "BOINGA", "VALE INTEGRIDADE SALOBO", "287.50", 23)];
  const map = { id: "m", version: 1, createdAt: new Date("2026-09-01T00:00:00Z"), administrativeEntityId: "ent", totalAmount: "1300.00", holidaysSnapshot: [], competence: { year: 2026, month: 9 }, administrativeEntity: { tradeName: "Fornecedor" }, allocations };
  const workbook = buildBreakfastWorkbook(map as unknown as Parameters<typeof buildBreakfastWorkbook>[0]);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo", "Rateio por Colaborador", "Auditoria", "Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  const summary = workbook.getWorksheet("Resumo")!;
  const values = summary.getSheetValues().slice(1).map((row) => (row as unknown[]).slice(1));
  assert.deepEqual(values, [
    ["Empresa / Centro de Custo", "Colaboradores", "A pagar"],
    ["BOINGA", 2, 487.5], ["   ↳ VALE INTEGRIDADE SALOBO", 1, 287.5], ["   ↳ VALE TOPOGRAFIA BMSA", 1, 200],
    ["PROJETA", 3, 812.5], ["   ↳ VALE TOPOGRAFIA BMSA", 2, 512.5], ["   ↳ VALE TOPOGRAFIA SALOBO", 1, 300],
    ["Total Geral", 5, 1300],
  ]);
  assert.ok(!values.some((row) => String(row[0]).includes("TOPOGEO")));
  assert.equal(summary.getColumn(3).numFmt, "R$ #,##0.00");
  const detail = workbook.getWorksheet("Rateio por Colaborador")!;
  assert.deepEqual((detail.getRow(1).values as unknown[]).slice(1), ["Empresa", "Nome", "Departamento", "Centro de custo", "Dias Úteis", "Quantidade", "Quantidade Extras", "Desconto", "Quantidade Final", "Valor Unitário", "Valor Total", "Observação"]);
  assert.equal(detail.getRow(2).getCell(3).value, "TOPOGEO");
  assert.equal(detail.getRow(detail.rowCount).getCell(11).value, 1300);
  assert.equal(workbook.getWorksheet("Auditoria")!.getCell("B5").value, 1300);
});

test("café da manhã: Máscara Flash (CNPJ | NOME COMPLETO | CPF | FLEXIVEL) por colaborador", async () => {
  const { buildBreakfastFlashWorkbook, buildBreakfastFlashRows, BreakfastFlashExportError, FLASH_SHEET_NAME } = await import("../src/modules/accounts-payable/breakfast/flash");
  const { calculateBreakfastEmployeeTotal, calculateFinalQuantity, centsToDecimalString } = await import("../src/modules/accounts-payable/breakfast/calculations");
  const projeta = { taxId: "04892580000120" }, boinga = { taxId: "02801028000153" };
  // 21 + 2 extras − 5 desconto = 18 × R$ 12,50 = R$ 225,00 (fórmula atual, não recalculada pela máscara)
  const a225 = centsToDecimalString(calculateBreakfastEmployeeTotal(1250, calculateFinalQuantity(21, 2, 5)));
  assert.equal(a225, "225.00");
  const alloc = (id: string, employeeName: string, company: string, companyRef: { taxId: string } | null, amount: string) => ({ id, employeeId: id, employeeName, company, companyId: companyRef ? company : null, companyRef, amount });
  const allocations = [alloc("c", "Colaborador C", "BOINGA", boinga, "250.0000"), alloc("b", "Colaborador B", "PROJETA", projeta, "262.50"), alloc("a", "Colaborador A", "PROJETA", projeta, a225)];
  const map = { totalAmount: "737.50", financialRecord: { grossAmount: "737.5000" }, allocations };
  const workbook = buildBreakfastFlashWorkbook(map);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [FLASH_SHEET_NAME]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.columnCount, 4); assert.equal(sheet.rowCount, 4);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["CNPJ", "NOME COMPLETO", "CPF", "FLEXIVEL (R$)"]);
  const data = [2, 3, 4].map((n) => [1, 2, 3, 4].map((c) => sheet.getRow(n).getCell(c).value));
  assert.deepEqual(data, [["02801028000153", "Colaborador C", null, 250], ["04892580000120", "Colaborador A", null, 225], ["04892580000120", "Colaborador B", null, 262.5]]);
  for (const n of [2, 3, 4]) { assert.equal(typeof sheet.getRow(n).getCell(4).value, "number"); assert.equal(sheet.getRow(n).getCell(1).numFmt, "@"); }
  // round-trip do arquivo: CPF continua sem valor, FLEXIVEL numérico, sem linha de total
  const reread = new ExcelJS.Workbook(); await reread.xlsx.load(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  const back = reread.worksheets[0];
  assert.equal(back.name, FLASH_SHEET_NAME); assert.equal(back.rowCount, 4);
  for (const n of [2, 3, 4]) { const cpf = back.getRow(n).getCell(3).value; assert.ok(cpf === null || cpf === undefined, `CPF linha ${n} deve ser vazio`); }
  assert.equal([2, 3, 4].reduce((total, n) => total + Math.round(Number(back.getRow(n).getCell(4).value) * 100), 0), 73750);
  assert.ok(![1, 2, 3, 4].some((n) => String(back.getRow(n).getCell(1).value).includes("Total")));
  assert.equal(buildBreakfastFlashRows(map).totalCents, 73750);
  // bloqueios: empresa sem CNPJ (lista todas), sem colaboradores, total divergente, duplicidade
  assert.throws(() => buildBreakfastFlashRows({ ...map, allocations: [alloc("x", "X", "BOINGA", { taxId: "" }, "10.00"), alloc("y", "Y", "ACME", null, "10.00")] }), (error: Error) => error instanceof BreakfastFlashExportError && error.message === "As empresas ACME, BOINGA não possuem CNPJ cadastrado.");
  assert.throws(() => buildBreakfastFlashRows({ ...map, allocations: [alloc("x", "X", "BOINGA", null, "10.00")] }), /A empresa BOINGA não possui CNPJ cadastrado\./);
  assert.throws(() => buildBreakfastFlashRows({ ...map, allocations: [] }), /Não há colaboradores para exportar\./);
  assert.throws(() => buildBreakfastFlashRows({ ...map, financialRecord: { grossAmount: "737.49" } }), BreakfastFlashExportError);
  assert.throws(() => buildBreakfastFlashRows({ ...map, allocations: [...allocations, { ...allocations[0], id: "c2" }] }), /mais de uma vez/);
  // isolamento: só Café da Manhã ganha o botão/rota; rota usa a mesma permissão do download
  const [route, section, transit, cafeView] = await Promise.all([
    readFile(new URL("../src/app/api/accounts-payable/breakfast/[mapId]/flash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/BreakfastSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/vale-transporte/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/ui/BreakfastAllocationView.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_READ\)/); assert.match(route, /deletedAt: null/);
  // Fase 7F: botões na view do Rateio (apresentação); a chamada da rota segue na seção
  assert.match(cafeView, /Download do rateio XLSX/); assert.match(cafeView, /Download da Máscara Flash/); assert.match(section, /\/api\/accounts-payable\/breakfast\/\$\{mapId\}\/flash/);
  assert.doesNotMatch(transit, /Flash/);
});

// ---------------------------------------------------------------- CPF / importação de colaboradores
const cpfWithDigits = (base9: string) => { const digits = [...base9].map(Number); for (const length of [9, 10]) { const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0); const rest = (sum * 10) % 11; digits.push(rest === 10 ? 0 : rest); } return digits.join(""); };

test("cpf: normaliza, valida dígitos verificadores, formata e mascara", async () => {
  const { normalizeCpf, isValidCpf, formatCpf, maskCpf, maskCpfInput, parseOptionalCpf, CpfValidationError } = await import("../src/lib/cpf");
  assert.equal(normalizeCpf("529.982.247-25"), "52998224725"); assert.equal(normalizeCpf("52998224725"), "52998224725");
  assert.equal(normalizeCpf(1234567890), "01234567890"); // número do Excel perde o zero à esquerda
  assert.equal(isValidCpf("529.982.247-25"), true); assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-24"), false); assert.equal(isValidCpf("5299822472"), false);
  for (let digit = 0; digit <= 9; digit += 1) assert.equal(isValidCpf(String(digit).repeat(11)), false);
  assert.equal(isValidCpf(cpfWithDigits("012345678")), true); assert.equal(isValidCpf(Number(cpfWithDigits("012345678"))), true);
  assert.equal(formatCpf("52998224725"), "529.982.247-25"); assert.equal(maskCpf("52998224725"), "***.***.***-25");
  assert.equal(maskCpfInput("52998224725"), "529.982.247-25"); assert.equal(maskCpfInput("5299822"), "529.982.2"); assert.equal(maskCpfInput("529.982.247-2599"), "529.982.247-25");
  assert.equal(parseOptionalCpf(""), null); assert.equal(parseOptionalCpf(null), null); assert.equal(parseOptionalCpf("529.982.247-25"), "52998224725");
  assert.throws(() => parseOptionalCpf("111.111.111-11"), (error: Error) => error instanceof CpfValidationError && error.message === "CPF inválido.");
  assert.throws(() => parseOptionalCpf("529.982"), CpfValidationError);
});

test("cadastro manual: CPF opcional, persistido só com dígitos e validado no backend", async () => {
  const { parseCollaboratorInput } = await import("../src/modules/collaborators/schema");
  assert.equal(parseCollaboratorInput({ officialName: "Teste CPF", department: "TOPOGEO", cpf: "529.982.247-25" }).cpf, "52998224725");
  assert.equal(parseCollaboratorInput({ officialName: "Teste CPF", department: "TOPOGEO" }).cpf, null);
  assert.throws(() => parseCollaboratorInput({ officialName: "Teste CPF", department: "TOPOGEO", cpf: "111.111.111-11" }), /CPF inválido\./);
  const [post, patch, prismaClient, migration, schema] = await Promise.all([
    readFile(new URL("../src/app/api/collaborators/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/collaborators/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/db/prisma.ts", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261004120000_add_employee_cpf/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  ]);
  assert.match(post, /CPF_IN_USE_MESSAGE/); assert.match(patch, /CPF_IN_USE_MESSAGE/); assert.match(patch, /NOT: \{ id \}/);
  // CPF omitido por padrão em toda consulta; só sai quando pedido explicitamente
  assert.match(prismaClient, /omit: \{ foodEmployee: \{ cpf: true[,} ]/); assert.match(post, /fields/);
  // migration aditiva: coluna nullable + unique, sem NOT NULL nem DROP
  assert.match(migration, /ADD COLUMN "cpf" TEXT;/); assert.match(migration, /CREATE UNIQUE INDEX "FoodEmployee_cpf_key"/); assert.doesNotMatch(migration, /NOT NULL|DROP/);
  assert.match(schema, /cpf\s+String\?\s+@unique/);
});

test("importação de colaboradores: match ID → CPF → nome, create/update sem duplicar e sem apagar", async () => {
  const { planCollaboratorImport } = await import("../src/modules/collaborators/import");
  const person = (id: string, officialName: string, extra: Partial<{ cpf: string | null; jobTitle: string; costCenter: string; mergedIntoId: string | null }> = {}) => ({ id, officialName, normalizedName: officialName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR"), jobTitle: extra.jobTitle ?? "TOPOGRAFO", department: "TOPOGEO", costCenter: extra.costCenter ?? "VALE TOPOGRAFIA BMSA", cpf: extra.cpf ?? null, active: true, mergedIntoId: extra.mergedIntoId ?? null });
  const cpfA = "52998224725", cpfB = cpfWithDigits("123456789"), cpfC = cpfWithDigits("987654321");
  const existing = [person("id-ana", "ANA SOUZA"), person("id-bruno", "BRUNO LIMA", { cpf: cpfA }), person("id-carla", "CARLA DIAS", { cpf: cpfB })];
  const row = (sourceRow: number, officialName: string, extra: Partial<{ id: string; cpf: string; jobTitle: string; department: string; costCenter: string; errors: string[] }> = {}) => ({ sourceRow, officialName, department: "TOPOGEO", errors: [], ...extra });

  // UPDATE por ID: preenche CPF, mantém o mesmo ID, sem criar ninguém
  let plan = planCollaboratorImport([row(2, "ANA SOUZA", { id: "id-ana", cpf: cpfC })], existing);
  assert.equal(plan.rows[0].status, "UPDATE"); assert.equal(plan.rows[0].matchedBy, "ID"); assert.deepEqual(plan.rows[0].update, { id: "id-ana", data: { cpf: cpfC } }); assert.equal(plan.counts.CREATE, 0);
  // UPDATE por nome exato (sem ID) também funciona para colaborador ainda sem CPF
  plan = planCollaboratorImport([row(2, "Ana Souza", { cpf: cpfC })], existing);
  assert.equal(plan.rows[0].status, "UPDATE"); assert.equal(plan.rows[0].matchedBy, "NOME"); assert.deepEqual(plan.rows[0].update?.data, { cpf: cpfC });
  // CREATE
  plan = planCollaboratorImport([row(2, "DIEGO NOVO", { cpf: cpfC, costCenter: "VALE TOPOGRAFIA SALOBO" })], existing);
  assert.equal(plan.rows[0].status, "CREATE"); assert.equal(plan.rows[0].create?.cpf, cpfC); assert.equal(plan.rows[0].create?.normalizedName, "diego novo");
  // CPF vazio / Função vazia NÃO apagam o atual → SEM ALTERAÇÃO
  plan = planCollaboratorImport([row(2, "BRUNO LIMA", { id: "id-bruno" })], existing);
  assert.equal(plan.rows[0].status, "UNCHANGED"); assert.equal(plan.rows[0].update, undefined);
  // localização por CPF já cadastrado (mesmo com nome diferente na planilha)
  plan = planCollaboratorImport([row(2, "BRUNO LIMA FILHO", { cpf: cpfA })], existing);
  assert.equal(plan.rows[0].matchedBy, "CPF"); assert.equal(plan.rows[0].status, "UPDATE"); assert.deepEqual(plan.rows[0].changes, ["Nome"]);
  // CPF de outra pessoa: bloqueia (nunca transfere), mensagem com CPF mascarado
  plan = planCollaboratorImport([row(2, "ANA SOUZA", { id: "id-ana", cpf: cpfA })], existing);
  assert.equal(plan.rows[0].status, "ERROR"); assert.equal(plan.blocked, true); assert.match(plan.rows[0].errors[0], /\*\*\*\.\*\*\*\.\*\*\*-25 já pertence a outro colaborador \(BRUNO LIMA\)/); assert.doesNotMatch(JSON.stringify(plan), new RegExp(cpfA));
  // correção de CPF: permitida via ID (B válido e livre); bloqueada quando localizado só pelo nome
  plan = planCollaboratorImport([row(2, "BRUNO LIMA", { id: "id-bruno", cpf: cpfC })], existing);
  assert.equal(plan.rows[0].status, "UPDATE"); assert.deepEqual(plan.rows[0].update?.data, { cpf: cpfC });
  plan = planCollaboratorImport([row(2, "BRUNO LIMA", { cpf: cpfC })], existing);
  assert.equal(plan.rows[0].status, "ERROR"); assert.match(plan.rows[0].errors.join(), /use a máscara com a coluna ID/);
  // CPF repetido dentro do arquivo
  plan = planCollaboratorImport([row(10, "DIEGO NOVO", { cpf: cpfC }), row(25, "ELISA NOVA", { cpf: cpfC })], existing);
  assert.deepEqual(plan.rows.map((item) => item.status), ["ERROR", "ERROR"]); assert.ok(plan.rows.every((item) => item.errors.includes("Linhas 10 e 25 possuem o mesmo CPF.")));
  // duas linhas para o mesmo colaborador / nome novo repetido
  plan = planCollaboratorImport([row(2, "ANA SOUZA", { id: "id-ana" }), row(3, "ANA SOUZA")], existing);
  assert.ok(plan.rows.every((item) => item.status === "ERROR" && item.errors.some((error) => /mesmo colaborador/.test(error))));
  plan = planCollaboratorImport([row(2, "DIEGO NOVO"), row(3, "Diego Novo")], existing);
  assert.equal(plan.counts.ERROR, 2);
  // ID inexistente, CPF inválido e novo sem departamento
  plan = planCollaboratorImport([row(2, "X", { id: "nao-existe" }), row(3, "ANA SOUZA", { cpf: "11111111111", errors: ["CPF inválido."] }), { sourceRow: 4, officialName: "SEM DEPTO", errors: [] }], existing);
  assert.deepEqual(plan.rows.map((item) => item.errors[0]), ["ID não encontrado no cadastro de colaboradores.", "CPF inválido.", "Departamento é obrigatório para novo colaborador."]);
  // nome parecido: NÃO atualiza sozinho (revisão); só com decisão explícita
  plan = planCollaboratorImport([row(7, "ANA SOUZA SILVA", { cpf: cpfC })], existing);
  assert.equal(plan.rows[0].status, "REVIEW"); assert.equal(plan.rows[0].match?.id, "id-ana"); assert.equal(plan.blocked, false);
  plan = planCollaboratorImport([row(7, "ANA SOUZA SILVA", { cpf: cpfC })], existing, [], { 7: "UPDATE" });
  assert.equal(plan.rows[0].status, "UPDATE"); assert.equal(plan.rows[0].update?.id, "id-ana");
  // alias de cadastro mesclado → revisão apontando para o principal
  plan = planCollaboratorImport([row(2, "ANINHA")], existing, [{ normalizedAlias: "aninha", employeeId: "id-ana" }]);
  assert.equal(plan.rows[0].status, "REVIEW"); assert.equal(plan.rows[0].match?.id, "id-ana");
});

test("importação massiva: 128 colaboradores existentes + 128 linhas com ID e CPF → 128 atualizados, 0 criados", async () => {
  const { planCollaboratorImport, parseCollaboratorWorkbook, generateCollaboratorTemplate } = await import("../src/modules/collaborators/import");
  const existing = Array.from({ length: 128 }, (_, index) => ({ id: `emp-${index}`, officialName: `COLABORADOR ${String(index).padStart(3, "0")}`, normalizedName: `colaborador ${String(index).padStart(3, "0")}`, jobTitle: "AUXILIAR", department: "TOPOGEO", costCenter: `CC ${index % 4}`, cpf: null, active: true, mergedIntoId: null }));
  // máscara oficial pré-preenchida (download) → usuário preenche CPF → reimporta
  const template = await generateCollaboratorTemplate(existing);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(template as never);
  const sheet = workbook.getWorksheet("COLABORADORES")!;
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["NOME", "FUNÇÃO", "DEPARTAMENTO", "CENTRO DE CUSTO", "CPF", "DATA DE ADMISSÃO", "ID"]);
  assert.equal(sheet.rowCount, 129);
  const cpfs = existing.map((_, index) => cpfWithDigits(String(100000000 + index * 7919).slice(-9).padStart(9, "0")));
  for (let index = 0; index < 128; index += 1) sheet.getCell(`E${index + 2}`).value = index % 2 ? cpfs[index] : Number(cpfs[index]); // texto e número
  const rows = await parseCollaboratorWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  const plan = planCollaboratorImport(rows, existing);
  assert.equal(plan.total, 128); assert.equal(plan.counts.UPDATE, 128); assert.equal(plan.counts.CREATE, 0); assert.equal(plan.counts.ERROR, 0);
  assert.deepEqual(plan.rows.map((row) => row.update?.id), existing.map((item) => item.id)); // IDs preservados, sem duplicação
  assert.deepEqual(plan.rows.map((row) => row.update?.data), cpfs.map((cpf) => ({ cpf })));
  // reimportar o mesmo arquivo depois de gravado → tudo SEM ALTERAÇÃO
  const after = existing.map((item, index) => ({ ...item, cpf: cpfs[index] }));
  assert.equal(planCollaboratorImport(rows, after).counts.UNCHANGED, 128);
  // planilha antiga (sem colunas CPF/ID) continua aceita e localiza por nome
  const legacy = new ExcelJS.Workbook(); const legacySheet = legacy.addWorksheet("COLABORADORES"); legacySheet.addRow(["NOME", "FUNÇÃO", "DEPARTAMENTO", "CENTRO DE CUSTO"]); legacySheet.addRow(["COLABORADOR 001", "", "TOPOGEO", ""]);
  const legacyPlan = planCollaboratorImport(await parseCollaboratorWorkbook(Buffer.from(await legacy.xlsx.writeBuffer())), after);
  assert.equal(legacyPlan.rows[0].status, "UNCHANGED"); assert.equal(legacyPlan.rows[0].matchedBy, "NOME");
});

test("máscara Flash: CPF do cadastro (numérico com formato da máscara); sem CPF fica vazio", async () => {
  const { buildBreakfastFlashWorkbook } = await import("../src/modules/accounts-payable/breakfast/flash");
  const leadingZero = cpfWithDigits("012345678");
  const alloc = (id: string, name: string, cpf: string | null, amount: string) => ({ id, employeeId: id, employeeName: name, company: "PROJETA", companyId: "p", companyRef: { taxId: "04892580000120" }, employee: { cpf }, amount });
  const map = { totalAmount: "487.50", financialRecord: { grossAmount: "487.50" }, allocations: [alloc("a", "A", "52998224725", "225.00"), alloc("b", "B", null, "262.50")] };
  const sheet = buildBreakfastFlashWorkbook(map).worksheets[0];
  assert.equal(sheet.getCell("C2").value, 52998224725); assert.equal(sheet.getCell("C2").numFmt, '000"."000"."000"-"00');
  assert.equal(sheet.getCell("C3").value, null);
  const zero = buildBreakfastFlashWorkbook({ ...map, totalAmount: "225.00", financialRecord: { grossAmount: "225.00" }, allocations: [alloc("z", "Z", leadingZero, "225.00")] }).worksheets[0];
  assert.equal(String(zero.getCell("C2").value).padStart(11, "0"), leadingZero); // o formato 000.000.000-00 repõe o zero
  const route = await readFile(new URL("../src/app/api/accounts-payable/breakfast/[mapId]/flash/route.ts", import.meta.url), "utf8");
  assert.match(route, /employee: \{ select: \{ cpf: true \} \}/);
  // cálculos financeiros inalterados
  const { calculateBreakfastEmployeeTotal, calculateFinalQuantity } = await import("../src/modules/accounts-payable/breakfast/calculations");
  assert.equal(calculateBreakfastEmployeeTotal(1250, calculateFinalQuantity(21, 2, 5)), 22500);
});
test("alimentação manual: valor por refeição editável no PA (mesma regra do MA) e usado pelo backend", async () => {
  const { manualFoodUsesSupplierPrice } = await import("../src/modules/accounts-payable/food/manual-contract");
  assert.equal(manualFoodUsesSupplierPrice("12.50"), false); assert.equal(manualFoodUsesSupplierPrice("15,75"), false);
  assert.equal(manualFoodUsesSupplierPrice(""), true); assert.equal(manualFoodUsesSupplierPrice("  "), true); assert.equal(manualFoodUsesSupplierPrice(undefined), true);
  const [page, server] = await Promise.all([
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/manual-server.ts", import.meta.url), "utf8"),
  ]);
  // regressão: o input do lançamento manual não pode voltar a ficar somente leitura/desabilitado por localidade
  const input = page.slice(page.indexOf("id={`food-manual-amount-${locality}`}"), page.indexOf("/>", page.indexOf("id={`food-manual-amount-${locality}`}")));
  // Fase 7H: CurrencyInput controlado pelo mesmo texto (manualAmount); a digitação volta a ser texto com 2 casas
  assert.ok(input.includes("<CurrencyInput") && input.includes("value={currencyValue(manualAmount)}") && input.includes("setManualAmount(currencyText(value))"));
  assert.doesNotMatch(input, /readOnly|disabled/);
  // o valor digitado é enviado também no PA e o servidor não força o valor do cadastro por localidade
  assert.match(page, /\r?\n\s+amount: manualAmount,\r?\n\s+\}\),/); // enviado também no PA (fora do ramo MA)
  assert.match(server, /manualFoodUsesSupplierPrice\(input\.amount\)/); assert.doesNotMatch(server, /input\.locality === "PA" \|\| !input\.amount/);
  assert.match(server, /unitPrice\.lte\(0\)/); // validação financeira mantida
});
// ---------------------------------------------------------------- Alimentação PA: Emissão NF por colaborador
test("alimentação PA: NF 01 → BOINGA, NF 02 → PROJETA (helper central, estrito na entrada, tolerante na leitura)", async () => {
  const { FOOD_PA_INVOICES, isFoodPaInvoiceCode, parseFoodPaInvoice, foodInvoiceEmissionToCompany, foodPaInvoiceLabel } = await import("../src/modules/accounts-payable/food/invoice-company");
  assert.deepEqual(FOOD_PA_INVOICES, { NF_01: { label: "NF 01", company: "BOINGA" }, NF_02: { label: "NF 02", company: "PROJETA" } });
  assert.equal(foodInvoiceEmissionToCompany("NF_01"), "BOINGA"); assert.equal(foodInvoiceEmissionToCompany("NF 01"), "BOINGA");
  assert.equal(foodInvoiceEmissionToCompany("NF_02"), "PROJETA"); assert.equal(foodInvoiceEmissionToCompany("NF 02"), "PROJETA");
  assert.notEqual(foodInvoiceEmissionToCompany("NF 01"), "PROJETA"); assert.notEqual(foodInvoiceEmissionToCompany("NF 02"), "BOINGA");
  // entrada do formulário/API: somente os códigos internos
  for (const bad of ["NF 03", "NF_03", "NF 01", "BOINGA", "", null, undefined, 1]) assert.equal(isFoodPaInvoiceCode(bad), false, String(bad));
  assert.equal(isFoodPaInvoiceCode("NF_01"), true); assert.equal(foodPaInvoiceLabel("NF_02"), "NF 02");
  // leitura do valor gravado (manual "NF 01"; Upload grava o texto da planilha)
  for (const value of ["NF 01", "NF01", "nf 1", "NF-01", "N.F. 01", "NF_01"]) assert.equal(parseFoodPaInvoice(value), "NF_01", value);
  for (const value of ["NF 03", "NF 10", "BOINGA", "", null]) assert.equal(parseFoodPaInvoice(value), null, String(value));
  assert.equal(foodInvoiceEmissionToCompany("NF 03"), null); // nunca inventa empresa
});

test("alimentação PA: rateio misto por empresa fecha com o total (A+C BOINGA, B PROJETA)", async () => {
  const { buildFoodPaCompanyRateio, FOOD_PA_UNIDENTIFIED_COMPANY } = await import("../src/modules/accounts-payable/food/invoice-company");
  const row = (employeeId: string, name: string, meals: number, invoiceEmission: string | null, amount: string, included = true) => ({ employeeId, officialName: name, receivedName: name, confirmedDepartment: "ENGENHARIA", receivedDepartment: "ENGENHARIA", invoiceEmission, mealQuantity: meals, amount, included });
  const rateio = buildFoodPaCompanyRateio([row("a", "Pessoa A", 10, "NF 01", "100.00"), row("b", "Pessoa B", 15, "NF 02", "150.0000"), row("c", "Pessoa C", 20, "NF 01", "200"), row("x", "Excluída", 3, "NF 02", "30", false)]);
  assert.deepEqual(rateio.companies.map((company) => [company.company, company.people.map((person) => person.name), company.meals, company.amountCents]), [["BOINGA", ["Pessoa A", "Pessoa C"], 30, 30000], ["PROJETA", ["Pessoa B"], 15, 15000]]);
  assert.equal(rateio.totalCents, 45000); assert.equal(rateio.companiesCents, 45000); assert.equal(rateio.consistent, true);
  // mesmo colaborador com NF 01 e NF 02 → cada parcela na sua empresa; NF desconhecida/antiga → categoria explícita
  const split = buildFoodPaCompanyRateio([row("a", "Pessoa A", 2, "NF 01", "25"), row("a", "Pessoa A", 1, "NF 02", "12.5"), row("h", "Histórico", 1, null, "10")]);
  assert.deepEqual(split.companies.map((company) => [company.company, company.amountCents]), [["BOINGA", 2500], ["PROJETA", 1250], [FOOD_PA_UNIDENTIFIED_COMPANY, 1000]]);
  assert.equal(split.consistent, true);
  // trocar NF 01 → NF 02 só muda a empresa: subtotal e total iguais
  const before = buildFoodPaCompanyRateio([row("a", "Pessoa A", 20, "NF 01", "250.00")]);
  const after = buildFoodPaCompanyRateio([row("a", "Pessoa A", 20, "NF 02", "250.00")]);
  assert.deepEqual([before.companies[0].company, before.totalCents], ["BOINGA", 25000]);
  assert.deepEqual([after.companies[0].company, after.totalCents, after.companies[0].meals], ["PROJETA", 25000, 20]);
});

test("alimentação PA: XLSX com Empresa e Emissão NF ao lado das Refeições; MA inalterado", async () => {
  const occurrence = (id: string, employeeId: string, name: string, sector: string, meals: number, invoiceEmission: string | null, amount: number) => ({ id, employeeId, normalizedReceivedName: name.toUpperCase(), receivedName: name, officialName: name, receivedDepartment: sector, confirmedDepartment: sector, mealQuantity: meals, invoiceEmission, restaurantName: "REI DO ASSADO", amount, included: true });
  const rows = [occurrence("1", "aline", "ALINE", "ADMINISTRATIVO", 20, "NF 02", 250), occurrence("2", "adilson", "ADILSON", "ENGENHARIA", 15, "NF 01", 187.5), occurrence("3", "maria", "MARIA", "ENGENHARIA", 18, "NF 02", 225)];
  const workbook = buildFoodRateioWorkbook({ locality: "PA", mealOccurrences: rows });
  const values = (row: ExcelJS.Row) => (row.values as ExcelJS.CellValue[]).slice(1);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo por Setor", "Resumo por Empresa", "Rateio por Colaborador", "Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  const allocation = workbook.getWorksheet("Rateio por Colaborador")!;
  const header = values(allocation.getRow(1)) as string[];
  assert.deepEqual(header, ["Empresa", "Setor", "Colaborador", "Refeições", "Emissão NF", "Valor Médio", "Custo", "Restaurante"]);
  assert.equal(header.indexOf("Emissão NF"), header.indexOf("Refeições") + 1);
  assert.deepEqual(values(allocation.getRow(2)), ["BOINGA", "ENGENHARIA", "ADILSON", 15, "NF 01", 12.5, 187.5, "REI DO ASSADO"]);
  assert.deepEqual(values(allocation.getRow(3)), ["PROJETA", "ADMINISTRATIVO", "ALINE", 20, "NF 02", 12.5, 250, "REI DO ASSADO"]);
  assert.deepEqual(values(allocation.getRow(4)), ["PROJETA", "ENGENHARIA", "MARIA", 18, "NF 02", 12.5, 225, "REI DO ASSADO"]);
  for (let line = 2; line <= allocation.rowCount; line += 1) { const company = allocation.getCell(line, 1).value, nf = allocation.getCell(line, 5).value; assert.ok((nf === "NF 01" && company === "BOINGA") || (nf === "NF 02" && company === "PROJETA")); }
  const companies = workbook.getWorksheet("Resumo por Empresa")!;
  assert.deepEqual(values(companies.getRow(2)), ["BOINGA", 1, 15, 187.5]); assert.deepEqual(values(companies.getRow(3)), ["PROJETA", 2, 38, 475]);
  assert.deepEqual(values(companies.getRow(4)), ["TOTAL", 3, 53, 662.5]);
  assert.equal(workbook.getWorksheet("Resumo por Setor")!.getCell("D4").value, 662.5); // Total Geral igual nos dois resumos
  // MA (sem locality PA): mesmas duas abas e colunas de antes
  const ma = buildFoodRateioWorkbook({ locality: "MA", mealOccurrences: rows.map((row) => ({ ...row, invoiceEmission: null })) });
  assert.deepEqual(ma.worksheets.map((sheet) => sheet.name), ["Resumo por Setor", "Rateio por Colaborador", "Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  assert.deepEqual(values(ma.getWorksheet("Rateio por Colaborador")!.getRow(1)), ["Setor", "Colaborador", "Refeições", "Valor Médio", "Custo", "Restaurante", "Emissão NF"]);
});

test("alimentação PA manual: NF individual na etapa 2, sem campo global, validada e derivada no backend", async () => {
  const [page, server, maServer, editor, foodServer] = await Promise.all([
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/manual-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/ma-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/ui/FoodMaEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/food/server.ts", import.meta.url), "utf8"),
  ]);
  // etapa 2: coluna Emissão NF (select por colaborador) entre Refeições e Subtotal; etapa 3 sem campo global
  // (Fase 7H: tabela PA na FoodPaManualTable — colunas Refeições → Emissão NF → … → Subtotal, select de NF por colaborador)
  const paTable = await readFile(new URL("../src/modules/accounts-payable/food/ui/FoodPaManualTable.tsx", import.meta.url), "utf8");
  assert.ok(paTable.indexOf('header: "Refeições"') < paTable.indexOf('header: "Emissão NF"') && paTable.indexOf('header: "Emissão NF"') < paTable.indexOf('header: "Subtotal"'));
  assert.match(paTable, /aria-label=\{`Emissão NF de \$\{row\.employee\?\.officialName/); assert.match(paTable, /FOOD_PA_INVOICE_CODES\.map/); assert.match(page, /<FoodPaManualTable/);
  assert.doesNotMatch(page, /manualInvoice\b|food-manual-invoice/);
  assert.match(page, /invoiceEmission: manualInvoices\[collaboratorId\]/); assert.doesNotMatch(page, /company:\s*foodInvoiceEmissionToCompany/);
  assert.match(page, /paQuantitiesValid && paInvoicesValid/);
  // backend: rejeita NF fora de NF_01/NF_02 antes da transação; persiste o rótulo por linha; empresa nunca vem do payload
  assert.ok(server.indexOf("FOOD_PA_INVOICE_REQUIRED_MESSAGE") < server.indexOf("prisma.$transaction"));
  assert.match(server, /invoiceEmission: invoice,/); assert.doesNotMatch(server, /input\.company|\.company\b/);
  // correção: NF editável (só PA), auditada na revisão, valor recalculado igual (unitPrice × refeições)
  assert.match(maServer, /batch\.locality !== "PA" \|\| !isFoodPaInvoiceCode\(edit\.invoiceEmission\)/);
  assert.match(maServer, /invoiceEmission: occurrence\.invoiceEmission,/); assert.match(maServer, /amount: occurrence\.unitPrice\.mul\(mealQuantity\),\r?\n\s+invoiceEmission,/);
  assert.match(editor, /locality === "PA" && invoiceCode && invoiceCode !== parseFoodPaInvoice\(row\.invoiceEmission\)/);
  // tela: rateio PA por empresa calculado no servidor a partir do snapshot de cada linha
  assert.match(foodServer, /buildFoodPaCompanyRateio\(paRows\.filter/);
});
// ---------------------------------------------------------------- Café da Manhã: Espelho de Ponto → Quantidade Extras
test("espelho de ponto: CSV (BOM, ;) , colunas obrigatórias, horas, datas e CPF com zeros perdidos", async () => {
  const { readCsvMatrix } = await import("../src/modules/accounts-payable/shared/spreadsheet");
  const { normalizePointMirrorMatrix, parseWorkedMinutes, parsePointMirrorDate, normalizePointMirrorCpf, PointMirrorError } = await import("../src/modules/accounts-payable/breakfast/point-mirror");
  const cpf = cpfWithDigits("029788742"); // sintético, começa com 0
  const header = "CNPJ;Nome;Matrícula;PIS;CPF;Admissão;Demissão;Filial;Departamento;Cargo;Data;Dia;Jornada Esperada;Horas Esperadas;Nome Escala;Natureza Dia;Marcações Válidas;Jornada Considerada;Horas Trabalhadas;Eventos;Centro Custo;Grupos";
  const line = (date: string, day: string, nature: string, journey: string, hours: string, rawCpf = cpf.replace(/^0+/, "")) => `00000000000000;FULANO SINTETICO;1;0;${rawCpf};01/01/2020;;F;X;Y;${date};${day};;;;${nature};;${journey};${hours};;;`;
  const csv = `﻿${header}\r\n${line("05/09/2026", "SÁB.", "Folga", "Trabalho com Horas Excedentes", "08:00")}\r\n\r\n`;
  const rows = normalizePointMirrorMatrix(readCsvMatrix(csv));
  assert.equal(rows.length, 1); assert.equal(rows[0].cpf, cpf); assert.equal(rows[0].date, "2026-09-05"); assert.equal(rows[0].workedMinutes, 480); assert.equal(rows[0].name, "FULANO SINTETICO");
  // colunas obrigatórias ausentes: bloqueia e lista quais
  assert.throws(() => normalizePointMirrorMatrix(readCsvMatrix("Nome;CPF;Data\nA;1;01/01/2026")), (error: Error) => error instanceof PointMirrorError && /Dia, Natureza Dia, Jornada Considerada, Horas Trabalhadas/.test(error.message));
  assert.equal(parseWorkedMinutes("00:00"), 0); assert.equal(parseWorkedMinutes("00:01"), 1); assert.equal(parseWorkedMinutes("08:48"), 528); assert.equal(parseWorkedMinutes("10:04"), 604); assert.equal(parseWorkedMinutes("8h"), null); assert.equal(parseWorkedMinutes(""), null);
  assert.equal(parsePointMirrorDate("21/09/2026"), "2026-09-21"); assert.equal(parsePointMirrorDate("31/02/2026"), null); assert.equal(parsePointMirrorDate("2026-09-21"), null);
  // zeros à esquerda perdidos: 10 e 9 dígitos voltam a 11 e passam na validação real
  assert.equal(normalizePointMirrorCpf(cpf.slice(1)), cpf);
  const twoZeros = cpfWithDigits("006308272"); assert.equal(normalizePointMirrorCpf(twoZeros.replace(/^0+/, "")), twoZeros);
  assert.equal(normalizePointMirrorCpf("12345678900"), null); assert.equal(normalizePointMirrorCpf("123456789012"), null); assert.equal(normalizePointMirrorCpf(""), null);
});

test("espelho de ponto: sábado, domingo e feriado +1 por data (sem horas, Trabalho Esperado e duplicidades não contam)", async () => {
  const { isBreakfastExtraDay, buildBreakfastExtraSuggestions } = await import("../src/modules/accounts-payable/breakfast/point-mirror");
  const base = { dayLabel: "", nature: "Trabalho", journey: "Trabalho com Horas Excedentes", workedMinutes: 480 };
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-05", dayLabel: "SÁB." }).qualifies, true); // sábado
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-06", dayLabel: "DOM.", workedMinutes: 540 }).qualifies, true); // domingo
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-07", nature: "Feriado", journey: "Feriado", workedMinutes: 528 }).qualifies, true); // feriado
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-05", workedMinutes: 0 }).qualifies, false); // 00:00
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-05", journey: "Trabalho Esperado" }).qualifies, false);
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-07", nature: "Feriado", journey: "  trabalho esperado " }).qualifies, false); // normalizado (trim/caixa)
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-08" }).qualifies, false); // dia útil comum
  assert.equal(isBreakfastExtraDay({ ...base, date: "2026-09-05", dayLabel: "SEG." }).dayMismatch, true); // conferência pela coluna Dia
  const cpfA = cpfWithDigits("111444777"), cpfB = cpfWithDigits("222555888");
  const row = (sourceRow: number, cpf: string | null, date: string, extra: Partial<typeof base> = {}) => ({ sourceRow, name: `P${sourceRow}`, cpf, rawCpf: cpf ?? "123", date, ...base, ...extra });
  const result = buildBreakfastExtraSuggestions([
    row(2, cpfA, "2026-09-05"), row(3, cpfA, "2026-09-05"), // mesma pessoa + data duplicada → +1
    row(4, cpfA, "2026-09-06"), row(5, cpfA, "2026-09-07", { nature: "Feriado", journey: "Feriado" }),
    row(6, cpfB, "2026-09-12", { nature: "Feriado" }), // sábado que também é feriado → +1 (coluna Feriado)
    row(7, cpfB, "2026-09-19", { workedMinutes: 0 }), row(8, cpfB, "2026-09-08"),
    row(9, null, "2026-09-05"),
  ]);
  const byCpf = (cpf: string) => result.people.find((person) => person.cpf === cpf)!;
  assert.deepEqual([byCpf(cpfA).saturdays, byCpf(cpfA).sundays, byCpf(cpfA).holidays, byCpf(cpfA).extraQuantity], [1, 1, 1, 3]);
  assert.deepEqual([byCpf(cpfB).saturdays, byCpf(cpfB).holidays, byCpf(cpfB).extraQuantity], [0, 1, 1]);
  assert.equal(result.totals.extraDates, 5); assert.equal(result.totals.invalidCpf, 1); assert.equal(result.totals.peopleWithExtras, 3); // CPF inválido conta no total encontrado, mas nunca é aplicado
  assert.deepEqual(result.period, { from: "2026-09-05", to: "2026-09-19" }); // período do arquivo, sem filtrar pela competência
  assert.ok(result.people.every((person) => !person.cpfMasked.includes(person.cpf?.slice(0, 9) ?? "x")));
});

test("espelho de ponto: aplicar ATRIBUI (idempotente), só selecionados aptos, e a edição manual prevalece", async () => {
  const { applyBreakfastExtraSuggestions } = await import("../src/modules/accounts-payable/breakfast/point-mirror");
  const { calculateFinalQuantity, calculateBreakfastEmployeeTotal } = await import("../src/modules/accounts-payable/breakfast/calculations");
  const values = { a: { extra: "2", discount: "2" }, b: { extra: "1", discount: "0" }, c: { extra: "7", discount: "0" } };
  const suggestions = [{ employeeId: "a", extraQuantity: 3, status: "APPLY" }, { employeeId: "b", extraQuantity: 0, status: "APPLY" }, { employeeId: "c", extraQuantity: 9, status: "NOT_IN_FILE" }, { employeeId: "x", extraQuantity: 4, status: "NOT_SELECTED" }];
  const once = applyBreakfastExtraSuggestions(values, suggestions);
  assert.deepEqual([once.a.extra, once.b.extra, once.c.extra, "x" in once], ["3", "0", "7", false]); // = e não +=; fora do arquivo mantém
  assert.equal(once.a.discount, "2"); assert.equal(values.a.extra, "2"); // não muta o estado anterior
  const twice = applyBreakfastExtraSuggestions(once, suggestions);
  assert.equal(twice.a.extra, "3"); // reimportar o mesmo arquivo nunca dobra
  const edited = { ...twice, a: { ...twice.a, extra: "5" } }; // usuário corrige 3 → 5
  assert.equal(edited.a.extra, "5");
  // fórmula inalterada: 21 + 3 − 2 = 22 × R$ 12,50 = R$ 275,00; depois da edição usa 5
  assert.equal(calculateBreakfastEmployeeTotal(1250, calculateFinalQuantity(21, Number(twice.a.extra), 2)), 27500);
  assert.equal(calculateFinalQuantity(21, Number(edited.a.extra), 2), 24);
  const [section, route, server] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/breakfast/BreakfastSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/breakfast/point-mirror/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/point-mirror-server.ts", import.meta.url), "utf8"),
  ]);
  // input de extras continua editável e só muda pelo clique explícito (sem effect reaplicando)
  // (Fase 7F: input na BreakfastFillTable, repassado à seção por onPatch=patchValue)
  const fillTable = await readFile(new URL("../src/modules/accounts-payable/breakfast/ui/BreakfastFillTable.tsx", import.meta.url), "utf8");
  assert.match(fillTable, /quantityInput\(row, "extra", "Quantidade extras"\)/); assert.match(fillTable, /value=\{value\[key\]\} onChange=\{\(event\) => onPatch\(row\.id, \{ \[key\]: event\.target\.value \}\)\}/);
  assert.match(section, /onPatch=\{patchValue\}/); assert.doesNotMatch(fillTable, /applyBreakfastExtraSuggestions|useEffect/);
  assert.doesNotMatch(section, /useEffect\([^)]*applyBreakfastExtraSuggestions/); assert.match(section, /onApply=\{applyPointMirror\}/); // ImportFlow: botão "Aplicar Quantidades Extras" (clique explícito)
  // segurança: mesma permissão do lançamento, limite de tamanho, nada persistido, sem log de conteúdo
  assert.match(route, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_CREATE\)/); assert.match(route, /MAX_POINT_MIRROR_FILE_SIZE/);
  assert.doesNotMatch(server, /\.create\(|\.update\(|\.upsert\(|writeFile|storePrivateFile|console\./);
  assert.match(server, /where: \{ cpf: \{ in: cpfs \} \}/); assert.doesNotMatch(server, /normalizedName|officialName: \{/); // match só por CPF
  assert.doesNotMatch(server, /cpf: person\.cpf|cpf: employee\.cpf/); // resposta sem CPF completo
});
// ---------------------------------------------------------------- Colaboradores: Data de Admissão
test("data de admissão: parser dd/MM/yyyy, Date do XLSX, serial do Excel, inválidas e sem deslocamento de fuso", async () => {
  const { parseDateOnly, parseOptionalDateOnly, dateOnlyToDb, dateOnlyFromDb, formatDateOnlyBR, DateOnlyValidationError } = await import("../src/lib/date-only");
  assert.equal(parseDateOnly("05/10/2026"), "2026-10-05"); assert.equal(parseDateOnly(" 15/03/2021 "), "2021-03-15"); assert.equal(parseDateOnly("2021-04-01"), "2021-04-01");
  assert.equal(parseDateOnly(new Date(Date.UTC(2020, 0, 1))), "2020-01-01"); // célula de data real (ExcelJS → meia-noite UTC)
  assert.equal(parseDateOnly(45931), "2025-10-01"); assert.equal(parseDateOnly(43831), "2020-01-01"); // serial do Excel
  for (const bad of ["31/02/2021", "32/01/2026", "00/00/2026", "10/05/26", "2021-13-01", "abc", "15-03-2021", 0, -1, NaN, new Date("x")]) assert.equal(parseDateOnly(bad), null, String(bad));
  assert.equal(parseOptionalDateOnly(""), null); assert.equal(parseOptionalDateOnly(null), null); assert.equal(parseOptionalDateOnly(undefined), null);
  assert.throws(() => parseOptionalDateOnly("31/02/2021", "Data de Admissão"), (error: Error) => error instanceof DateOnlyValidationError && error.message === "Data de Admissão inválida.");
  // DATE sem hora: o valor gravado é meia-noite UTC e volta exatamente para o mesmo dia (independe do TZ do processo)
  for (const iso of ["2020-01-01", "2026-10-05", "2021-03-15", "2019-10-10"]) {
    const db = dateOnlyToDb(iso);
    assert.equal(db.toISOString(), `${iso}T00:00:00.000Z`); assert.equal(dateOnlyFromDb(db), iso); assert.equal(dateOnlyFromDb(db.toISOString()), iso);
    assert.equal(formatDateOnlyBR(db.toISOString()), iso.split("-").reverse().join("/"));
  }
  assert.equal(formatDateOnlyBR(null), ""); assert.equal(dateOnlyFromDb(undefined), null);
});

test("data de admissão: cadastro manual opcional (null válido) e validada no backend", async () => {
  const { parseCollaboratorInput } = await import("../src/modules/collaborators/schema");
  const base = { officialName: "Teste Data Admissão", department: "TOPOGEO" };
  assert.equal(parseCollaboratorInput({ ...base, admissionDate: "2021-03-15" }).admissionDate?.toISOString(), "2021-03-15T00:00:00.000Z");
  assert.equal(parseCollaboratorInput({ ...base, admissionDate: "15/03/2021" }).admissionDate?.toISOString(), "2021-03-15T00:00:00.000Z");
  assert.equal(parseCollaboratorInput(base).admissionDate, null); assert.equal(parseCollaboratorInput({ ...base, admissionDate: "" }).admissionDate, null);
  assert.throws(() => parseCollaboratorInput({ ...base, admissionDate: "31/02/2021" }), /Data de Admissão inválida\./);
  const [patch, list, prismaClient, migration] = await Promise.all([
    readFile(new URL("../src/app/api/collaborators/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/collaborators/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/db/prisma.ts", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261005120000_add_employee_admission_date/migration.sql", import.meta.url), "utf8"),
  ]);
  assert.match(patch, /"admissionDate" in body \? \{ admissionDate \} : \{\}/); // ausente = mantém; enviado vazio = limpa
  assert.match(list, /admissionDate: !withAdmission/); assert.match(prismaClient, /omit: \{ foodEmployee: \{ cpf: true, admissionDate: true \} \}/);
  const sql = migration.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.match(sql, /ADD COLUMN "admissionDate" DATE;/); assert.doesNotMatch(sql, /UNIQUE|NOT NULL|DROP|UPDATE/);
});

test("data de admissão na importação: atualiza (sem localizar), vazia não apaga, inválida bloqueia, reimportação sem alteração", async () => {
  const { planCollaboratorImport, parseCollaboratorWorkbook, generateCollaboratorTemplate } = await import("../src/modules/collaborators/import");
  const { dateOnlyToDb } = await import("../src/lib/date-only");
  const person = (id: string, officialName: string, admissionDate: string | null = null) => ({ id, officialName, normalizedName: officialName.toLocaleLowerCase("pt-BR"), jobTitle: "AUXILIAR", department: "TOPOGEO", costCenter: "CC", cpf: null, admissionDate: admissionDate ? dateOnlyToDb(admissionDate) : null, active: true, mergedIntoId: null });
  const existing = [person("id-ana", "ANA SOUZA"), person("id-bia", "BIA LIMA", "2019-10-10"), person("id-caio", "CAIO DIAS", "2020-03-01")];
  const row = (sourceRow: number, officialName: string, extra: Partial<{ id: string; admissionDate: string; errors: string[] }> = {}) => ({ sourceRow, officialName, department: "TOPOGEO", errors: [], ...extra });
  let plan = planCollaboratorImport([row(2, "ANA SOUZA", { id: "id-ana", admissionDate: "2020-05-05" })], existing);
  assert.equal(plan.rows[0].status, "UPDATE"); assert.deepEqual(plan.rows[0].update, { id: "id-ana", data: { admissionDate: dateOnlyToDb("2020-05-05") } }); assert.deepEqual(plan.rows[0].changes, ["Data de Admissão"]);
  plan = planCollaboratorImport([row(2, "BIA LIMA", { id: "id-bia" })], existing); // vazia não apaga
  assert.equal(plan.rows[0].status, "UNCHANGED"); assert.equal(plan.rows[0].update, undefined);
  plan = planCollaboratorImport([row(2, "CAIO DIAS", { id: "id-caio", admissionDate: "2020-03-02" })], existing); // correção via ID
  assert.deepEqual(plan.rows[0].update?.data, { admissionDate: dateOnlyToDb("2020-03-02") });
  plan = planCollaboratorImport([row(2, "CAIO DIAS", { id: "id-caio", admissionDate: "2020-03-01" })], existing); // igual → sem alteração
  assert.equal(plan.rows[0].status, "UNCHANGED");
  // a data NÃO localiza ninguém: nome novo com a mesma data de um existente vira CREATE
  plan = planCollaboratorImport([row(2, "NOVO COLABORADOR", { admissionDate: "2019-10-10" })], existing);
  assert.equal(plan.rows[0].status, "CREATE"); assert.equal(plan.rows[0].create?.admissionDate?.toISOString(), "2019-10-10T00:00:00.000Z"); assert.equal(plan.rows[0].matchedBy, null);
  // máscara: coluna de data real; Excel edita → reimporta (Date, texto dd/MM/yyyy, serial e inválida)
  const template = await generateCollaboratorTemplate(existing);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(template as never); const sheet = workbook.getWorksheet("COLABORADORES")!;
  assert.equal(sheet.getCell("F3").value instanceof Date, true); assert.equal((sheet.getCell("F3").value as Date).toISOString(), "2019-10-10T00:00:00.000Z"); assert.equal(sheet.getCell("F3").numFmt, "dd/mm/yyyy");
  assert.equal(sheet.getCell("F2").value, null); assert.equal(sheet.getCell("G2").value, "id-ana");
  sheet.getCell("F2").value = new Date(Date.UTC(2020, 0, 1)); sheet.getCell("F4").value = "02/03/2020";
  const rows = await parseCollaboratorWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(rows.map((item) => [item.id, item.admissionDate]), [["id-ana", "2020-01-01"], ["id-bia", "2019-10-10"], ["id-caio", "2020-03-02"]]);
  plan = planCollaboratorImport(rows, existing);
  assert.deepEqual(plan.rows.map((item) => item.status), ["UPDATE", "UNCHANGED", "UPDATE"]); assert.deepEqual(plan.rows.map((item) => item.update?.id ?? null), ["id-ana", null, "id-caio"]);
  // reimportação depois de gravado → tudo sem alteração (idempotente)
  const saved = existing.map((item, index) => ({ ...item, admissionDate: dateOnlyToDb(["2020-01-01", "2019-10-10", "2020-03-02"][index]) }));
  assert.equal(planCollaboratorImport(rows, saved).counts.UNCHANGED, 3);
  sheet.getCell("F2").value = "31/02/2021";
  const invalid = planCollaboratorImport(await parseCollaboratorWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())), existing);
  assert.equal(invalid.blocked, true); assert.deepEqual(invalid.rows[0].errors, ["Data de Admissão inválida."]);
  // Espelho de Ponto e Máscara Flash não usam Data de Admissão
  const [pointServer, flash] = await Promise.all([readFile(new URL("../src/modules/accounts-payable/breakfast/point-mirror-server.ts", import.meta.url), "utf8"), readFile(new URL("../src/modules/accounts-payable/breakfast/flash.ts", import.meta.url), "utf8")]);
  assert.doesNotMatch(pointServer, /admission/i); assert.doesNotMatch(flash, /admission/i); assert.doesNotMatch(await readFile(new URL("../src/modules/accounts-payable/shared/flash.ts", import.meta.url), "utf8"), /admission/i);
});
test("data de admissão: célula XLSX com fórmula usa só o resultado salvo (sem avaliar fórmula nem vínculo externo)", async () => {
  const { parseSpreadsheetDate, dateOnlyToDb, dateOnlyFromDb } = await import("../src/lib/date-only");
  const { parseCollaboratorWorkbook, ADMISSION_FORMULA_WITHOUT_RESULT_MESSAGE } = await import("../src/modules/collaborators/import");
  const formula = "_xlfn.XLOOKUP(A2,[1]!Tabela1[NOME],[1]!Tabela1[ADMISSÃO],0)";
  // células diretas (inalterado)
  assert.deepEqual(parseSpreadsheetDate(45553), { status: "date", iso: "2024-09-18" });
  assert.deepEqual(parseSpreadsheetDate(new Date(Date.UTC(2024, 8, 18))), { status: "date", iso: "2024-09-18" });
  assert.deepEqual(parseSpreadsheetDate("18/09/2024"), { status: "date", iso: "2024-09-18" });
  assert.deepEqual(parseSpreadsheetDate("31/02/2026"), { status: "invalid" });
  for (const empty of [null, undefined, "", "  "]) assert.deepEqual(parseSpreadsheetDate(empty), { status: "empty" });
  // fórmula + resultado cacheado (número, Date, texto; também sharedFormula)
  assert.deepEqual(parseSpreadsheetDate({ formula, result: 45553 }), { status: "date", iso: "2024-09-18" });
  assert.deepEqual(parseSpreadsheetDate({ formula, result: new Date(Date.UTC(2012, 1, 1)) }), { status: "date", iso: "2012-02-01" });
  assert.deepEqual(parseSpreadsheetDate({ formula, result: "22/07/2026" }), { status: "date", iso: "2026-07-22" });
  assert.deepEqual(parseSpreadsheetDate({ sharedFormula: "F2", result: 45553 }), { status: "date", iso: "2024-09-18" });
  assert.deepEqual(parseSpreadsheetDate({ formula, result: "31/02/2026" }), { status: "invalid" });
  // XLOOKUP(...,0) sem correspondência: 0 (ou 30/12/1899 como o ExcelJS entrega) → sem data, nunca 1899
  for (const zero of [0, new Date(Date.UTC(1899, 11, 30)), null, ""]) assert.deepEqual(parseSpreadsheetDate({ formula, result: zero }), { status: "empty" }, String(zero));
  // sem resultado calculado ou erro do Excel → mensagem específica
  for (const broken of [undefined, { error: "#N/A" }, Number.NaN, "#REF!", "#VALUE!"]) assert.deepEqual(parseSpreadsheetDate({ formula, ...(broken === undefined ? {} : { result: broken }) }), { status: "formula-without-result" }, String(broken));
  // fuso: o resultado vira meia-noite UTC do mesmo dia
  assert.equal(dateOnlyToDb("2024-09-18").toISOString(), "2024-09-18T00:00:00.000Z"); assert.equal(dateOnlyFromDb(dateOnlyToDb("2024-09-18")), "2024-09-18");

  // ponta a ponta com XLSX sintético no formato da máscara (mesmo leitor do importador)
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("COLABORADORES");
  sheet.addRow(["NOME", "FUNÇÃO", "DEPARTAMENTO", "CENTRO DE CUSTO", "CPF", "DATA DE ADMISSÃO", "ID"]);
  sheet.addRow(["PESSOA FORMULA", "", "TOPOGEO", "", "", { formula, result: 45553 }, "id-1"]);
  sheet.addRow(["PESSOA DIRETA", "", "TOPOGEO", "", "", 46078, "id-2"]);
  sheet.addRow(["PESSOA SEM CORRESPONDENCIA", "", "TOPOGEO", "", "", { formula, result: 0 }, "id-3"]);
  sheet.addRow(["PESSOA SEM RESULTADO", "", "TOPOGEO", "", "", { formula }, "id-4"]);
  sheet.getColumn(6).numFmt = "dd/mm/yyyy";
  const rows = await parseCollaboratorWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(rows.map((row) => [row.id, row.admissionDate ?? null, row.errors]), [
    ["id-1", "2024-09-18", []], ["id-2", "2026-02-25", []], ["id-3", null, []], ["id-4", null, [ADMISSION_FORMULA_WITHOUT_RESULT_MESSAGE]],
  ]);
});
// ---------------------------------------------------------------- Cesta Básica
test("cesta básica: dias no mês, 2ª quarta-feira (vários meses) e feriados VT + Café deduplicados", async () => {
  const { basicBasketDaysInMonth, getSecondWednesday, mergeBasicBasketHolidays } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  assert.deepEqual([[2026, 1], [2026, 2], [2027, 2], [2028, 2], [2026, 4], [2026, 10]].map(([y, m]) => basicBasketDaysInMonth(y, m)), [31, 28, 28, 29, 30, 31]);
  // meses começando em todos os dias da semana
  const cases: Array<[number, number, string]> = [[2026, 10, "2026-10-14"], [2026, 7, "2026-07-08"], [2026, 4, "2026-04-08"], [2026, 3, "2026-03-11"], [2026, 2, "2026-02-11"], [2026, 1, "2026-01-14"], [2026, 11, "2026-11-11"], [2026, 9, "2026-09-09"], [2027, 9, "2027-09-08"], [2028, 2, "2028-02-09"], [2024, 5, "2024-05-08"]];
  for (const [y, m, expected] of cases) { const date = getSecondWednesday(y, m); assert.equal(date, expected, `${m}/${y}`); assert.equal(new Date(`${date}T00:00:00Z`).getUTCDay(), 3); }
  // propriedade em todos os meses de 2024–2030 (todos os dias de início): quarta-feira, entre 8 e 14, com exatamente 1 quarta antes
  const starts = new Set<number>();
  for (let y = 2024; y <= 2030; y += 1) for (let m = 1; m <= 12; m += 1) {
    const date = getSecondWednesday(y, m); const day = Number(date.slice(8, 10)); starts.add(new Date(Date.UTC(y, m - 1, 1)).getUTCDay());
    assert.equal(new Date(`${date}T00:00:00Z`).getUTCDay(), 3); assert.ok(day >= 8 && day <= 14, `${m}/${y}`);
    assert.equal(Array.from({ length: day - 1 }, (_, i) => new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay()).filter((weekday) => weekday === 3).length, 1);
  }
  assert.equal(starts.size, 7);
  // feriado na 2ª quarta NÃO move o pagamento (não existe regra de adiamento)
  assert.equal(getSecondWednesday(2027, 4), "2027-04-14");
  const holidays = mergeBasicBasketHolidays(2026, 10, [{ date: "2026-10-12", name: "Padroeira (VT)" }, { date: "2026-10-20", name: "Municipal" }, { date: "2026-11-02", name: "Fora da competência" }], [{ date: "2026-10-20", name: "Municipal" }, { date: "2026-10-28", name: "Servidor" }]);
  assert.deepEqual(holidays.map((holiday) => [holiday.date, holiday.sources]), [["2026-10-12", ["NATIONAL", "TRANSIT_VOUCHER"]], ["2026-10-20", ["TRANSIT_VOUCHER", "BREAKFAST"]], ["2026-10-28", ["BREAKFAST"]]]);
  assert.deepEqual(holidays[1].names, ["Municipal"]); assert.deepEqual(holidays[0].names, ["Nossa Senhora Aparecida", "Padroeira (VT)"]);
});

test("cesta básica: base financeira fixa de 30 dias (mês comercial) para a Cesta da competência e o Retroativo do MÊS ANTERIOR", async () => {
  const { BASIC_BASKET_CALCULATION_DAYS, basicBasketDaysInMonth, buildBasicBasketContext, basicBasketContextFromPayments, calculateCurrentBasketDays, calculateRetroactiveDays, commercialDay, prorateCents, calculateBasicBasketLine, countDaysInclusive, addDays, parseMoneyToCents, BasicBasketCalculationError } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  assert.equal(BASIC_BASKET_CALCULATION_DAYS, 30);
  assert.deepEqual(["2026-10-01", "2026-10-05", "2026-10-14", "2027-02-28", "2028-02-29", "2026-09-30", "2026-10-31"].map(commercialDay), [1, 5, 14, 28, 29, 30, 30]);
  assert.deepEqual([basicBasketDaysInMonth(2026, 10), basicBasketDaysInMonth(2027, 2), basicBasketDaysInMonth(2028, 2)], [31, 28, 29]); // calendário continua real
  const oct = buildBasicBasketContext(2026, 10);
  assert.deepEqual(oct, { previousPaymentDate: "2026-09-09", paymentDate: "2026-10-14", competenceYear: 2026, competenceMonth: 10, currentMonthStart: "2026-10-01", currentMonthEnd: "2026-10-31", referenceYear: 2026, referenceMonth: 9, referenceMonthStart: "2026-09-01", referenceMonthEnd: "2026-09-30", absenceReferenceYear: 2026, absenceReferenceMonth: 9, absenceReferenceMonthStart: "2026-09-01", absenceReferenceMonthEnd: "2026-09-30" });
  assert.deepEqual(basicBasketContextFromPayments("2026-09-09", "2026-10-14"), oct); // correção reconstrói o mesmo contexto a partir do mapa
  const nov = buildBasicBasketContext(2026, 11);
  assert.deepEqual([nov.previousPaymentDate, nov.paymentDate, nov.referenceMonthEnd], ["2026-10-14", "2026-11-11", "2026-10-31"]);
  // linha completa a partir do valor MENSAL R$ 400,00 (Bonificação/Acordo nunca proporcionais)
  const MONTHLY = 40000;
  const calc = (admissionDate: string, context = oct, driverBonusCents = 0, agreementCents = 0) => {
    const current = calculateCurrentBasketDays({ context, admissionDate }), retro = calculateRetroactiveDays({ context, admissionDate });
    const line = calculateBasicBasketLine({ driverBonusCents, agreementCents, monthlyBasketCents: MONTHLY, currentBasketDays: current.currentBasketDays, retroactiveDays: retro.retroactiveDays });
    return { current: current.status, days: current.currentBasketDays, retro: retro.status, retroDays: retro.retroactiveDays, payableBasketCents: line.payableBasketCents, retroactiveCents: line.retroactiveCents, totalCents: line.totalCents };
  };
  // matriz OUTUBRO/2026 (31 dias no calendário; base 30; pagamento 14/10, anterior 09/09)
  assert.deepEqual(calc("2026-10-01"), { current: "FULL_MONTH", days: 30, retro: "CURRENT_OR_LATER", retroDays: 0, payableBasketCents: 40000, retroactiveCents: 0, totalCents: 40000 });
  assert.deepEqual(calc("2026-10-05"), { current: "PRORATED", days: 26, retro: "CURRENT_OR_LATER", retroDays: 0, payableBasketCents: 34667, retroactiveCents: 0, totalCents: 34667 }); // 400 × 26/30 = 346,67 (nunca 27/31)
  assert.equal(calc("2026-10-05", oct, 15000, 10000).totalCents, 59667); // 150 + 100 + 346,67
  assert.deepEqual(calc("2026-10-14"), { current: "PRORATED", days: 17, retro: "CURRENT_OR_LATER", retroDays: 0, payableBasketCents: 22667, retroactiveCents: 0, totalCents: 22667 }); // admitido NO pagamento
  for (const late of ["2026-10-15", "2026-10-20", "2026-10-31"]) assert.deepEqual(calc(late), { current: "AFTER_PAYMENT", days: 0, retro: "CURRENT_OR_LATER", retroDays: 0, payableBasketCents: 0, retroactiveCents: 0, totalCents: 0 });
  // admitidos no mês anterior: Cesta de outubro cheia + Retroativo de setembro (só depois do pagamento anterior)
  assert.deepEqual(calc("2026-09-21"), { current: "FULL_MONTH", days: 30, retro: "PRORATED", retroDays: 10, payableBasketCents: 40000, retroactiveCents: 13333, totalCents: 53333 });
  assert.deepEqual([calc("2026-09-15").retroDays, calc("2026-09-15").retroactiveCents], [16, 21333]);
  assert.deepEqual([calc("2026-09-10").retroDays, calc("2026-09-10").retroactiveCents, calc("2026-09-30").retroDays, calc("2026-09-30").retroactiveCents], [21, 28000, 1, 1333]);
  for (const paid of ["2026-09-01", "2026-09-09", "2018-07-09"]) assert.deepEqual([calc(paid).current, calc(paid).days, calc(paid).retro, calc(paid).totalCents], ["FULL_MONTH", 30, "NONE", 40000]);
  // NOVEMBRO/2026: quem ficou sem Cesta em outubro recebe Cesta cheia + Retroativo de outubro (÷ 30, nunca ÷ 31)
  assert.deepEqual(calc("2026-10-20", nov), { current: "FULL_MONTH", days: 30, retro: "PRORATED", retroDays: 11, payableBasketCents: 40000, retroactiveCents: 14667, totalCents: 54667 }); // antes 12/31 = 154,84
  assert.deepEqual([calc("2026-10-31", nov).retroDays, calc("2026-10-31", nov).retroactiveCents, calc("2026-10-31", nov).totalCents], [1, 1333, 41333]); // dia 31 = dia 30 → 1 dia (antes 1/31 = 12,90)
  assert.deepEqual([calc("2026-10-30", nov).retroDays, calc("2026-10-15", nov).retroDays, calc("2026-10-15", nov).retroactiveCents], [1, 16, 21333]);
  for (const alreadyPaid of ["2026-10-05", "2026-10-14"]) assert.deepEqual([calc(alreadyPaid, nov).retro, calc(alreadyPaid, nov).retroactiveCents], ["NONE", 0]); // já recebeu proporcional em outubro
  assert.deepEqual(calc("2026-11-01", nov), { current: "FULL_MONTH", days: 30, retro: "CURRENT_OR_LATER", retroDays: 0, payableBasketCents: 40000, retroactiveCents: 0, totalCents: 40000 });
  // FEVEREIRO (28/29 no calendário): base continua 30
  const feb27 = buildBasicBasketContext(2027, 2), feb28 = buildBasicBasketContext(2028, 2);
  assert.deepEqual([feb27.paymentDate, feb28.paymentDate], ["2027-02-10", "2028-02-09"]);
  assert.deepEqual([calc("2027-01-20", feb27).days, calc("2027-01-20", feb27).payableBasketCents, calc("2028-01-02", feb28).days, calc("2028-01-02", feb28).payableBasketCents], [30, 40000, 30, 40000]); // mês completo 30/30
  assert.deepEqual([calc("2027-02-05", feb27).days, calc("2027-02-05", feb27).payableBasketCents, calc("2028-02-05", feb28).days], [26, 34667, 26]);
  assert.equal(calc("2027-02-20", feb27).current, "AFTER_PAYMENT");
  const mar27 = buildBasicBasketContext(2027, 3), mar28 = buildBasicBasketContext(2028, 3);
  assert.deepEqual([calc("2027-02-20", mar27).retroDays, calc("2027-02-20", mar27).retroactiveCents], [11, 14667]); // 30 − 20 + 1 = 11 (não os dias físicos até 28/02)
  assert.deepEqual([calc("2027-02-28", mar27).retroDays, calc("2028-02-29", mar28).retroDays, calc("2028-02-29", mar28).retroactiveCents], [3, 2, 2667]);
  assert.deepEqual(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: MONTHLY, currentBasketDays: 11, retroactiveDays: 0 }).payableBasketCents, 14667); // 400 × 11/30
  // virada de ano: referência dezembro, base 30
  const jan = buildBasicBasketContext(2027, 1);
  assert.deepEqual([jan.referenceYear, jan.referenceMonth, jan.previousPaymentDate, jan.paymentDate], [2026, 12, "2026-12-09", "2027-01-13"]);
  assert.deepEqual([calc("2026-12-20", jan).retroDays, calc("2026-12-20", jan).retroactiveCents, calc("2026-12-20", jan).payableBasketCents, calc("2026-12-31", jan).retroDays, calc("2027-01-05", jan).payableBasketCents], [11, 14667, 40000, 1, 34667]);
  // Data de Admissão ausente: bloqueante (sem valor inventado)
  assert.deepEqual(calculateCurrentBasketDays({ context: oct, admissionDate: null }), { status: "MISSING_ADMISSION", currentBasketDays: 0 });
  assert.deepEqual(calculateRetroactiveDays({ context: oct, admissionDate: null }), { status: "MISSING_ADMISSION", retroactiveDays: 0, retroactiveStart: null, retroactiveEnd: null });
  // valor mensal alterado → paga e Retroativo recalculados sobre o novo mensal
  assert.deepEqual(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 45000, currentBasketDays: 26, retroactiveDays: 10 }), { currentPayableDays: 26, retroactivePayableDays: 10, payableBasketCents: 39000, retroactiveCents: 15000, totalCents: 54000 });
  // arredondamento comercial exato (metade para cima), conferido com aritmética racional em BigInt
  for (let base = 0; base <= 120000; base += 997) for (let d = 1; d <= 30; d += 1) {
    const n = BigInt(base) * BigInt(d), q = BigInt(30); const two = BigInt(2);
    assert.equal(prorateCents(base, d, BASIC_BASKET_CALCULATION_DAYS), Number((two * n + q) / (two * q)));
  }
  assert.throws(() => prorateCents(100, 31, 30), BasicBasketCalculationError);
  assert.throws(() => calculateBasicBasketLine({ driverBonusCents: -1, agreementCents: 0, monthlyBasketCents: 0, currentBasketDays: 0, retroactiveDays: 0 }), BasicBasketCalculationError);
  // a fórmula não usa dias reais do mês
  const source = await readFile(new URL("../src/modules/accounts-payable/basic-basket/calculations.ts", import.meta.url), "utf8");
  const formula = source.slice(source.indexOf("export function calculateCurrentBasketDays"), source.indexOf("export const centsToDecimalString")).split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(formula, /daysInMonth|countDaysInclusive|getDate\(|monthDays/i); assert.doesNotMatch(formula, /\b30\b/); // constante central
  // datas só-dia sem deslocamento (inclusive na antiga virada de horário de verão de 04/11/2018 em São Paulo)
  assert.equal(addDays("2018-11-03", 1), "2018-11-04"); assert.equal(countDaysInclusive("2018-11-01", "2018-11-30"), 30); assert.equal(addDays("2019-02-16", 1), "2019-02-17");
  // entrada monetária pt-BR
  assert.deepEqual(["400", "400,5", "400,50", "1.234,56", "400.50", "R$ 12,34", "", "0"].map((value) => parseMoneyToCents(value, "Cesta")), [40000, 40050, 40050, 123456, 40050, 1234, 0, 0]);
  for (const bad of ["-1", "12,345", "abc", "1,2,3"]) assert.throws(() => parseMoneyToCents(bad, "Cesta"), /Cesta inválido/);
});

test("cesta básica: rateio Empresa → Departamento → Colaborador, resumo Empresa → CC e XLSX auditável fecham (base 30 + Espelho de Ponto)", async () => {
  const { groupBasicBasketByCompanyDepartment, groupBasicBasketByCompanyCostCenter } = await import("../src/modules/accounts-payable/basic-basket/rateio");
  const { buildBasicBasketWorkbook } = await import("../src/modules/accounts-payable/basic-basket/workbook");
  type Extra = { currentBasketDays?: number; currentVacationDays?: number; currentUnjustifiedAbsence?: boolean; currentPayableDays?: number; retroactiveVacationDays?: number; retroactiveUnjustifiedAbsence?: boolean; retroactivePayableDays?: number };
  const row = (employeeId: string, company: string, department: string, costCenter: string | null, values: [string, string, string, string, string], retroactiveDays: number, admissionDate: string | null = null, observation: string | null = null, extra: Extra = {}) => {
    const currentBasketDays = extra.currentBasketDays ?? 30;
    return { id: employeeId, employeeId, employeeName: `PESSOA ${employeeId.toUpperCase()}`, company, department, costCenter, driverBonus: values[0], agreementAmount: values[1], monthlyBasketAmount: "400.0000", currentCalculationDays: 30, currentBasketDays, basketAmount: values[2], retroactiveAmount: values[3], amount: values[4], referenceCalculationDays: 30, retroactiveDays, admissionDate, observation,
      currentVacationDays: extra.currentVacationDays ?? 0, currentUnjustifiedAbsence: extra.currentUnjustifiedAbsence ?? false, currentPayableDays: extra.currentPayableDays ?? currentBasketDays,
      retroactiveVacationDays: extra.retroactiveVacationDays ?? 0, retroactiveUnjustifiedAbsence: extra.retroactiveUnjustifiedAbsence ?? false, retroactivePayableDays: extra.retroactivePayableDays ?? retroactiveDays };
  };
  const rows = [
    row("a", "PROJETA", "TOPOGEO", "VALE BMSA", ["150.00", "100.00", "200.00", "0.00", "450.00"], 0, "2026-10-05T00:00:00.000Z", null, { currentBasketDays: 26, currentVacationDays: 11, currentPayableDays: 15 }), // admissão 05/10 + Férias 05–15/10
    row("b", "PROJETA", "ADMINISTRATIVO", "VALE BMSA", ["0.00", "0.00", "400.00", "80.00", "480.00"], 10, "2026-09-21T00:00:00.000Z", "Ajuste conforme acordo", { retroactiveVacationDays: 4, retroactivePayableDays: 6 }), // Retroativo 10 − 4 Férias
    row("c", "BOINGA", "TOPOGEO", null, ["150.00", "100.00", "0.0000", "280.0000", "530.0000"], 21, "2026-09-10T00:00:00.000Z", null, { currentUnjustifiedAbsence: true, currentPayableDays: 0 }), // Falta no mês de apuração: Cesta 0 (snapshot)
  ];
  const tree = groupBasicBasketByCompanyDepartment(rows);
  assert.deepEqual(tree.companies.map((company) => [company.company, company.totals.totalCents, company.departments.map((department) => [department.department, department.totals.totalCents])]), [["BOINGA", 53000, [["TOPOGEO", 53000]]], ["PROJETA", 93000, [["ADMINISTRATIVO", 48000], ["TOPOGEO", 45000]]]]);
  assert.equal(tree.totals.totalCents, 146000); assert.equal(tree.consistent, true);
  const summary = groupBasicBasketByCompanyCostCenter(rows);
  assert.deepEqual(summary.companies.map((company) => [company.company, company.costCenters.map((cc) => [cc.costCenter, cc.totals.people, cc.totals.basketCents, cc.totals.retroactiveCents, cc.totals.totalCents])]), [["BOINGA", [["Sem centro de custo", 1, 0, 28000, 53000]]], ["PROJETA", [["VALE BMSA", 2, 60000, 8000, 93000]]]]);
  assert.deepEqual([summary.totals.driverBonusCents, summary.totals.agreementCents, summary.totals.basketCents, summary.totals.retroactiveCents, summary.totals.totalCents], [30000, 20000, 60000, 36000, 146000]); assert.equal(summary.consistent, true); // Cesta PAGA, nunca o mensal
  const map = { version: 1, createdAt: new Date("2026-10-01T12:00:00Z"), previousPaymentDate: "2026-09-09T00:00:00.000Z", paymentDate: "2026-10-14T00:00:00.000Z", daysInMonth: 31, totalAmount: "1460.00", competence: { year: 2026, month: 10 }, administrativeEntity: { tradeName: "Fornecedor QA" }, financialRecord: { identifier: "PG-QA", grossAmount: "1460.0000" }, allocations: rows };
  const workbook = buildBasicBasketWorkbook(map, "qa");
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Detalhado", "Resumo", "Auditoria", "Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  const detail = workbook.getWorksheet("Detalhado")!; const values = (n: number) => (detail.getRow(n).values as unknown[]).slice(1);
  assert.deepEqual(values(1), ["Empresa", "Departamento", "Centro de Custo", "Colaborador", "Data de Admissão", "Pagamento Anterior", "Pagamento Atual", "Valor Mensal da Cesta", "Base de Cálculo da Cesta", "Dias de Direito por Admissão", "Dias de Férias", "Falta Injustificada no Mês de Apuração", "Dias Finais da Cesta", "Mês de Referência Retroativo", "Base de Cálculo Retroativo", "Dias Retroativos Originais", "Dias de Férias no Retroativo", "Falta Injustificada no Mês do Retroativo", "Dias Retroativos Finais", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total", "Observação", "Fornecedor"]);
  const iso = (cell: string) => (detail.getCell(cell).value as Date).toISOString().slice(0, 10);
  const cells = (n: number, columns: string) => columns.split("").map((column) => detail.getCell(`${column}${n}`).value);
  assert.deepEqual([iso("E2"), iso("F2"), iso("G2"), ...cells(2, "HIJKLMNOPQRSVWX")], ["2026-09-10", "2026-09-09", "2026-10-14", 400, 30, 30, 0, "Sim", 0, "09/2026", 30, 21, 0, "Não", 21, 0, 280, 530]); // Falta em outubro
  assert.deepEqual([iso("E3"), ...cells(3, "JKLMPQRSVWX")], ["2026-09-21", 30, 0, "Não", 30, 10, 4, "Não", 6, 400, 80, 480]); // Retroativo com Férias
  assert.deepEqual([iso("E4"), ...cells(4, "JKLMPSTUVWX")], ["2026-10-05", 26, 11, "Não", 15, 0, 0, 150, 100, 200, 0, 450]); // admissão + Férias
  for (const column of [5, 6, 7]) assert.equal(detail.getColumn(column).numFmt, "dd/mm/yyyy");
  for (const column of [8, 20, 21, 22, 23, 24]) assert.equal(detail.getColumn(column).numFmt, "R$ #,##0.00");
  assert.deepEqual(cells(5, "VWX"), [600, 360, 1460]); // linha TOTAL: soma a Cesta PAGA
  assert.equal(detail.getCell("Y3").value, "Ajuste conforme acordo"); assert.equal(detail.getCell("Z2").value, "Fornecedor QA");
  const resumo = workbook.getWorksheet("Resumo")!;
  assert.deepEqual((resumo.getRow(1).values as unknown[]).slice(1), ["Empresa", "Centro de Custo", "Colaboradores", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total"]);
  assert.deepEqual((resumo.getRow(resumo.rowCount).values as unknown[]).slice(1), ["Total Geral", "", 3, 300, 200, 600, 360, 1460]);
  const audit = workbook.getWorksheet("Auditoria")!;
  assert.deepEqual([audit.getCell("A2").value, audit.getCell("B2").value], ["Dias no mês (calendário)", 31]); // calendário real
  assert.equal(audit.getCell("B3").value, "09/09/2026"); assert.equal(audit.getCell("B4").value, "14/10/2026");
  assert.equal(audit.getCell("B5").value, "09/2026 (01/09/2026 a 30/09/2026)"); assert.equal(audit.getCell("B10").value, 1460);
  const auditText = JSON.stringify(audit.getSheetValues());
  assert.match(auditText, /Os cálculos de Cesta Básica e Retroativo utilizam base financeira fixa de 30 dias, independentemente da quantidade de dias do mês calendário\./);
  assert.match(auditText, /A Cesta da competência é cortada quando existe Falta Injustificada no mês imediatamente anterior à competência\./);
  assert.match(auditText, /Falta Injustificada = Jornada Considerada .Falta. \+ Evento .FALTA INJUSTIFICADA.\./); assert.match(auditText, /09\/2026 \(01\/09\/2026 a 30\/09\/2026\)/); // mês de apuração explícito
  assert.match(auditText, /Férias reduzem os dias de direito à Cesta dentro da base financeira fixa de 30 dias\./);
  assert.doesNotMatch(auditText, /31 dias|dias corridos|Cesta integral|D-15/);
  assert.throws(() => buildBasicBasketWorkbook({ ...map, totalAmount: "1459.99" }), /Inconsistência/);
});

test("cesta básica: Espelho de Ponto — Falta Injustificada (Jornada + Eventos) corta o mês; Férias proporcionais dentro do direito", async () => {
  const { buildBasicBasketContext, calculateBasicBasketLine, resolveBasicBasketAdjustments, summarizeDateRanges, NO_BASIC_BASKET_ADJUSTMENTS, EMPTY_BASIC_BASKET_OCCURRENCES } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const { classifyBasicBasketPointMirrorRow, normalizeBasicBasketPointMirrorMatrix, buildBasicBasketPointMirror, parseStoredOccurrences, splitAbsenceDates, BasicBasketPointMirrorError } = await import("../src/modules/accounts-payable/basic-basket/point-mirror");
  const oct = buildBasicBasketContext(2026, 10), nov = buildBasicBasketContext(2026, 11), feb = buildBasicBasketContext(2027, 2), mar = buildBasicBasketContext(2027, 3);
  const range = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
  const occ = (patch: Partial<typeof EMPTY_BASIC_BASKET_OCCURRENCES>) => ({ ...EMPTY_BASIC_BASKET_OCCURRENCES, ...patch });
  const run = (admissionDate: string, occurrences: typeof EMPTY_BASIC_BASKET_OCCURRENCES, context = oct) => resolveBasicBasketAdjustments({ context, admissionDate, occurrences });
  const line = (current: number, retro: number, adjustments = NO_BASIC_BASKET_ADJUSTMENTS) => calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 40000, currentBasketDays: current, retroactiveDays: retro, adjustments });
  // classificação: as DUAS condições para Falta; Férias só pelo Evento; igualdade exata (sem "contém")
  assert.deepEqual(classifyBasicBasketPointMirrorRow({ journey: "Falta", events: "FALTA INJUSTIFICADA" }), { absence: true, vacation: false, absenceEventWithoutJourney: false });
  assert.deepEqual(classifyBasicBasketPointMirrorRow({ journey: " falta ", events: "falta injustificada" }).absence, true);
  assert.deepEqual(classifyBasicBasketPointMirrorRow({ journey: "Falta", events: "FALTA JUSTIFICADA" }), { absence: false, vacation: false, absenceEventWithoutJourney: false }); // só Jornada
  assert.deepEqual(classifyBasicBasketPointMirrorRow({ journey: "Trabalho Esperado", events: "FALTA INJUSTIFICADA" }), { absence: false, vacation: false, absenceEventWithoutJourney: true }); // só Evento → sinaliza
  for (const events of ["Férias", "Ferias", "FERIAS", " férias "]) assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Folga", events }).vacation, true);
  for (const events of ["Férias Coletivas", "Pré-férias", "FERIAS PROPORCIONAIS", "FALTA INJUSTIFICADA PARCIAL"]) assert.deepEqual(classifyBasicBasketPointMirrorRow({ journey: "Falta", events }), { absence: false, vacation: false, absenceEventWithoutJourney: false });
  assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Falta", events: "Atraso, FALTA INJUSTIFICADA" }).absence, true); // lista de eventos: avaliação evento a evento
  // 57 — sem ocorrência: 30/30 R$ 400
  assert.deepEqual(line(30, 0, run("2020-01-01", EMPTY_BASIC_BASKET_OCCURRENCES)), { currentPayableDays: 30, retroactivePayableDays: 0, payableBasketCents: 40000, retroactiveCents: 0, totalCents: 40000 });
  // 58 — 15 dias de Férias: 15/30 = R$ 200
  const a58 = run("2020-01-01", occ({ currentVacationDates: range("2026-10-01", "2026-10-15") }));
  assert.deepEqual([a58.currentVacationDays, line(30, 0, a58).currentPayableDays, line(30, 0, a58).payableBasketCents], [15, 15, 20000]);
  // 59/30–34 — Falta Injustificada no MÊS DE APURAÇÃO (setembro inteiro, 01 a 30, sem limite do pagamento anterior 09/09) corta a Cesta de outubro
  assert.deepEqual([oct.absenceReferenceMonthStart, oct.absenceReferenceMonthEnd, oct.previousPaymentDate], ["2026-09-01", "2026-09-30", "2026-09-09"]);
  for (const dates of [["2026-09-14"], ["2026-09-01"], ["2026-09-05"], ["2026-09-30"], ["2026-09-05", "2026-09-12", "2026-09-20"]]) { const a = run("2020-01-01", occ({ absenceDates: dates })); assert.deepEqual([a.currentUnjustifiedAbsence, line(30, 0, a).payableBasketCents], [true, 0], dates.join()); }
  // 16/35/36 — Falta no próprio mês da competência NÃO corta (pertence à apuração da próxima)
  for (const date of ["2026-10-01", "2026-10-20", "2026-10-31"]) assert.deepEqual(run("2020-01-01", occ({ absenceDates: [date] })), NO_BASIC_BASKET_ADJUSTMENTS, date);
  // 39 — mês mais antigo não corta
  assert.deepEqual(run("2020-01-01", occ({ absenceDates: ["2026-08-31"] })), NO_BASIC_BASKET_ADJUSTMENTS);
  // 37 — competência 11/2026: Falta 14/10 corta novembro; 38 — virada de ano: qualquer dia de 12/2026 corta 01/2027
  assert.equal(run("2020-01-01", occ({ absenceDates: ["2026-10-14"] }), nov).currentUnjustifiedAbsence, true); assert.equal(line(30, 0, run("2020-01-01", occ({ absenceDates: ["2026-10-20"] }), nov)).payableBasketCents, 0);
  const jan = buildBasicBasketContext(2027, 1);
  assert.deepEqual([jan.absenceReferenceYear, jan.absenceReferenceMonth], [2026, 12]);
  for (const date of ["2026-12-01", "2026-12-09", "2026-12-31"]) assert.equal(run("2020-01-01", occ({ absenceDates: [date] }), jan).currentUnjustifiedAbsence, true, date);
  // Ocorrência ANTERIOR à admissão nunca afeta o benefício (data inclusiva)
  // 18 — admissão 05/10 + Falta 14/09: ignorada → 26/30 = R$ 346,67 (qualquer data de setembro é anterior à admissão)
  assert.equal(line(26, 0, run("2026-10-05", EMPTY_BASIC_BASKET_OCCURRENCES)).payableBasketCents, 34667);
  for (const date of ["2026-09-01", "2026-09-14", "2026-09-30"]) assert.deepEqual([run("2026-10-05", occ({ absenceDates: [date] })).currentUnjustifiedAbsence, line(26, 0, run("2026-10-05", occ({ absenceDates: [date] }))).payableBasketCents], [false, 34667], date);
  // 5 — admissão 01/09 + Falta 14/09: válida → R$ 0; 22 — colaborador antigo (01/01/2026) + Falta 05/09 (antes do pagamento 09/09): R$ 0
  assert.equal(line(30, 0, run("2026-09-01", occ({ absenceDates: ["2026-09-14"] }))).payableBasketCents, 0);
  assert.equal(line(30, 0, run("2026-01-01", occ({ absenceDates: ["2026-09-05"] }))).payableBasketCents, 0);
  // 19 — admissão 21/09 + Falta 14/09: ignorada → Cesta R$ 400 e Retroativo 10/30 = R$ 133,33
  const a19 = run("2026-09-21", occ({ absenceDates: ["2026-09-14"] }));
  assert.deepEqual([a19, line(30, 10, a19).payableBasketCents, line(30, 10, a19).retroactiveCents], [NO_BASIC_BASKET_ADJUSTMENTS, 40000, 13333]);
  // 20 — admissão 21/09 + Falta 21/09 (mesmo dia, inclusivo) e 21 — Falta 25/09: Cesta R$ 0 e Retroativo R$ 0
  for (const date of ["2026-09-21", "2026-09-25"]) { const a = run("2026-09-21", occ({ absenceDates: [date] })); assert.deepEqual([a.currentUnjustifiedAbsence, a.retroactiveUnjustifiedAbsence, line(30, 10, a).payableBasketCents, line(30, 10, a).retroactiveCents], [true, true, 0, 0], date); }
  // 23/24 — prévia: Falta no mês atual antes da admissão (20/10 × 05/10) é ignorada; depois (25/10) afeta a próxima competência
  assert.deepEqual(splitAbsenceDates(["2026-10-05"], oct, "2026-10-20"), { beforeAdmission: ["2026-10-05"], apuration: [], nextCompetence: [] });
  assert.deepEqual(splitAbsenceDates(["2026-10-25"], oct, "2026-10-20"), { beforeAdmission: [], apuration: [], nextCompetence: ["2026-10-25"] });
  assert.equal(run("2026-10-20", occ({ absenceDates: ["2026-10-25"] }), nov).currentUnjustifiedAbsence, true); // em 11/2026 corta novembro
  assert.equal(run("2026-10-20", occ({ absenceDates: ["2026-10-05"] }), nov).currentUnjustifiedAbsence, false); // anterior à admissão: nunca
  // 62 — admissão 05/10 (26/30) + 10 dias de Férias aplicáveis → 16/30 = R$ 213,33
  const a62 = run("2026-10-05", occ({ currentVacationDates: range("2026-10-06", "2026-10-15") }));
  assert.deepEqual([a62.currentVacationDays, line(26, 0, a62).currentPayableDays, line(26, 0, a62).payableBasketCents], [10, 16, 21333]);
  // 63 — Férias antes da admissão não reduzem
  assert.equal(run("2026-10-05", occ({ currentVacationDates: range("2026-10-01", "2026-10-04") })).currentVacationDays, 0);
  // 64 — Férias 01–15/10 com admissão 05/10: só 05–15 (11) → 15/30 = R$ 200
  const a64 = run("2026-10-05", occ({ currentVacationDates: range("2026-10-01", "2026-10-15") }));
  assert.deepEqual([a64.currentVacationDays, line(26, 0, a64).currentPayableDays, line(26, 0, a64).payableBasketCents], [11, 15, 20000]);
  // 65/50 — Férias na competência + Falta no mês de apuração: Falta vence → 0
  const a65 = run("2020-01-01", occ({ currentVacationDates: range("2026-10-01", "2026-10-15"), absenceDates: ["2026-09-20"] }));
  assert.deepEqual([a65.currentVacationDays, a65.currentUnjustifiedAbsence, line(30, 0, a65).payableBasketCents], [15, true, 0]);
  // 68 — Retroativo 10/30 (admissão 21/09) com 4 dias de Férias aplicáveis → 6/30 = R$ 80
  const a68 = run("2026-09-21", occ({ referenceVacationDates: range("2026-09-21", "2026-09-24") }));
  assert.deepEqual([a68.retroactiveVacationDays, a68.currentVacationDays, line(30, 10, a68).retroactivePayableDays, line(30, 10, a68).retroactiveCents, line(30, 10, a68).payableBasketCents], [4, 0, 6, 8000, 40000]);
  // 22 — Férias 15–25/09 com admissão 21/09: só 21–25 (5) → 5/30 do Retroativo pagável
  assert.equal(run("2026-09-21", occ({ referenceVacationDates: range("2026-09-15", "2026-09-25") })).retroactiveVacationDays, 5);
  // 17/18 — regras SEPARADAS sobre a mesma Falta de setembro: flag da Cesta (mês de apuração) e flag do Retroativo
  // (regra própria já validada: Falta dentro do mês do Retroativo zera o Retroativo)
  const a69 = run("2026-09-21", occ({ absenceDates: ["2026-09-25"] }));
  assert.deepEqual([a69.currentUnjustifiedAbsence, a69.retroactiveUnjustifiedAbsence, line(30, 10, a69).payableBasketCents, line(30, 10, a69).retroactiveCents], [true, true, 0, 0]);
  // Falta de setembro ANTES da admissão (02/09 × 21/09): não corta a Cesta nem zera o Retroativo
  assert.deepEqual(run("2026-09-21", occ({ absenceDates: ["2026-09-02"] })), NO_BASIC_BASKET_ADJUSTMENTS);
  // Falta em outubro + Retroativo de setembro: nada muda em outubro (Cesta R$ 400, Retroativo R$ 133,33)
  const a70 = run("2026-09-21", occ({ absenceDates: ["2026-10-05"] }));
  assert.deepEqual([line(30, 10, a70).payableBasketCents, line(30, 10, a70).retroactiveCents], [40000, 13333]);
  // Falta no mês de apuração SEM Retroativo (admitido antes): corta só a Cesta
  assert.deepEqual(run("2020-01-01", occ({ absenceDates: ["2026-09-25"] })), { ...NO_BASIC_BASKET_ADJUSTMENTS, currentUnjustifiedAbsence: true });
  // admitido após o pagamento: nada a cortar (continua "receberá na próxima competência")
  assert.deepEqual(run("2026-10-20", occ({ absenceDates: ["2026-09-25", "2026-10-25"], currentVacationDates: ["2026-10-26"] })), NO_BASIC_BASKET_ADJUSTMENTS);
  // 71 — dia 31: base 30, nunca > 30 dias; Férias no mês inteiro (31 datas) → 0/30; só o dia 31 → 1 dia
  const full = run("2020-01-01", occ({ currentVacationDates: range("2026-10-01", "2026-10-31") }));
  assert.deepEqual([full.currentVacationDays, line(30, 0, full).currentPayableDays], [30, 0]);
  assert.deepEqual([run("2020-01-01", occ({ currentVacationDates: ["2026-10-31"] })).currentVacationDays, run("2020-01-01", occ({ currentVacationDates: ["2026-10-30", "2026-10-31"] })).currentVacationDays], [1, 1]);
  // Retroativo de outubro em novembro (admissão 20/10 → 11/30) com Férias 25–31/10 → 6 dias comerciais (25..30)
  assert.equal(run("2026-10-20", occ({ referenceVacationDates: range("2026-10-25", "2026-10-31") }), nov).retroactiveVacationDays, 6);
  // 72 — fevereiro: base 30; Férias no mês inteiro zeram (28 datas alcançam o fim do mês → dias comerciais 29–30 também)
  const febFull = run("2020-01-01", occ({ currentVacationDates: range("2027-02-01", "2027-02-28") }), feb);
  assert.deepEqual([febFull.currentVacationDays, line(30, 0, febFull).currentPayableDays], [30, 0]);
  assert.deepEqual([run("2020-01-01", occ({ currentVacationDates: range("2027-02-01", "2027-02-14") }), feb).currentVacationDays, line(30, 0, run("2020-01-01", occ({ currentVacationDates: range("2027-02-01", "2027-02-14") }), feb)).payableBasketCents], [14, 21333]);
  assert.equal(run("2027-02-20", occ({ referenceVacationDates: range("2027-02-25", "2027-02-28") }), mar).retroactiveVacationDays, 6); // 25..30 comerciais, de 11 de direito
  // parser: headers reais, CPF com zero perdido, datas únicas (duplicidade), meses separados, fora do período
  const header = ["CNPJ", "Nome", "Matrícula", "PIS", "CPF", "Admissão", "Demissão", "Filial", "Departamento", "Cargo", "Data", "Dia", "Jornada Esperada", "Horas Esperadas", "Nome Escala", "Natureza Dia", "Marcações Válidas", "Jornada Considerada", "Horas Trabalhadas", "Eventos", "Centro Custo", "Grupos"];
  const mk = (cpf: string, date: string, journey: string, events: string) => { const r = header.map(() => ""); r[1] = "PESSOA"; r[4] = cpf; r[10] = date; r[17] = journey; r[19] = events; return r; };
  const withCheckDigits = (base: string) => { let digits = base; for (const size of [9, 10]) { const sum = digits.split("").reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0); const rest = (sum * 10) % 11; digits += String(rest === 10 ? 0 : rest); } return digits; };
  const cpf = "52998224725", lost = "99999999999" /* inválido */, zeroCpf = withCheckDigits("012345678");
  const rows = normalizeBasicBasketPointMirrorMatrix([header, mk(cpf, "05/10/2026", "Trabalho Esperado", "Férias"), mk(cpf, "05/10/2026", "Trabalho Esperado", "Férias"), mk(cpf, "06/10/2026", "Folga", "Ferias"), mk(cpf, "25/09/2026", "Falta", "FALTA INJUSTIFICADA"), mk(cpf, "20/08/2026", "Falta", "FALTA INJUSTIFICADA"), mk(cpf, "07/10/2026", "Trabalho Esperado", "FALTA INJUSTIFICADA"), mk(lost, "05/10/2026", "Falta", "FALTA INJUSTIFICADA"), []]);
  assert.equal(rows.length, 7);
  const parsed = buildBasicBasketPointMirror(rows, oct);
  const person = parsed.people.find((item) => item.cpf === cpf)!;
  assert.deepEqual([person.currentVacationDates, person.absenceDates, person.duplicateVacationRows, person.outOfPeriodRows, person.absenceEventWithoutJourney], [["2026-10-05", "2026-10-06"], ["2026-09-25"], 1, 1, 1]); // 20/08: fora do período de apuração
  const nextRows = normalizeBasicBasketPointMirrorMatrix([header, mk(cpf, "14/09/2026", "Falta", "FALTA INJUSTIFICADA"), mk(cpf, "20/10/2026", "Falta", "FALTA INJUSTIFICADA"), mk(cpf, "31/08/2026", "Falta", "FALTA INJUSTIFICADA"), mk(cpf, "15/09/2026", "Falta", "Atestado"), mk(cpf, "16/09/2026", "Trabalho Esperado", "FALTA INJUSTIFICADA")]);
  const nextPerson = buildBasicBasketPointMirror(nextRows, oct).people[0];
  assert.deepEqual([nextPerson.absenceDates, nextPerson.outOfPeriodRows, nextPerson.absenceEventWithoutJourney], [["2026-09-14", "2026-10-20"], 1, 1]); // 40/41: Jornada sem Evento / Evento sem Jornada não contam
  assert.deepEqual(splitAbsenceDates(nextPerson.absenceDates, oct, "2020-01-01"), { beforeAdmission: [], apuration: ["2026-09-14"], nextCompetence: ["2026-10-20"] });
  assert.deepEqual(splitAbsenceDates(nextPerson.absenceDates, oct, "2026-10-05"), { beforeAdmission: ["2026-09-14"], apuration: [], nextCompetence: ["2026-10-20"] });
  assert.equal(person.cpfMasked.includes("52998224725"), false);
  assert.deepEqual([parsed.totals.invalidCpf, parsed.totals.duplicateVacationRows, parsed.totals.outOfPeriodRows], [1, 1, 1]);
  assert.throws(() => normalizeBasicBasketPointMirrorMatrix([["Nome", "CPF", "Data", "Jornada Considerada"]]), /Eventos/);
  assert.throws(() => normalizeBasicBasketPointMirrorMatrix([]), BasicBasketPointMirrorError);
  // CPF com zero à esquerda perdido pelo Excel (mesma normalização do Café)
  assert.equal(zeroCpf.startsWith("0"), true);
  assert.equal(normalizeBasicBasketPointMirrorMatrix([header, mk(zeroCpf.slice(1), "05/10/2026", "Falta", "FALTA INJUSTIFICADA")])[0].cpf, zeroCpf);
  // célula XLSX com fórmula → só o resultado salvo
  const formulaRow = header.map(() => "" as unknown); formulaRow[4] = cpf; formulaRow[10] = { formula: "A1", result: "05/10/2026" }; formulaRow[17] = "Falta"; formulaRow[19] = { formula: "B1", result: "FALTA INJUSTIFICADA" };
  assert.equal(normalizeBasicBasketPointMirrorMatrix([header, formulaRow])[0].date, "2026-10-05");

  // JSON guardado é validado ao reler
  assert.deepEqual(parseStoredOccurrences({ e1: { absenceDates: ["2026-09-14"], currentVacationDates: ["2026-10-05"], referenceVacationDates: [] } }).e1, { absenceDates: ["2026-09-14"], currentVacationDates: ["2026-10-05"], referenceVacationDates: [] });
  assert.throws(() => parseStoredOccurrences({ e1: { absenceDates: "x" } }), BasicBasketPointMirrorError);
  assert.throws(() => parseStoredOccurrences([]), BasicBasketPointMirrorError);
  // resumo de datas na prévia
  assert.equal(summarizeDateRanges(["2026-10-03", "2026-10-01", "2026-10-02", "2026-10-12", "2026-10-02"]), "01/10 a 03/10, 12/10");
});
test("cesta básica: backend autoritativo, padrões, observação, soft cancel, correção e isolamento", async () => {
  const [server, deletion, section, page, schema, migration, proration, referenceMonth, currentMonth, commercial, workbook] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/basic-basket/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/deletion-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/basic-basket/BasicBasketSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261005150000_add_basic_basket/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261005180000_basic_basket_retroactive_proration/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261005200000_basic_basket_retroactive_reference_month/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261005220000_basic_basket_current_month_proration/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261006090000_basic_basket_commercial_30_days/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/basic-basket/workbook.ts", import.meta.url), "utf8"),
  ]);
  // servidor deriva pagamentos, dias de direito (base 30), Cesta paga, mês de referência, Retroativo e Total, e lê a Data de Admissão do cadastro (nunca do cliente)
  assert.match(server, /const cycle = buildBasicBasketContext\(input\.year, input\.month\)/); assert.match(server, /select: \{ id: true, officialName: true, department: true, costCenter: true, admissionDate: true \}/);
  assert.match(server, /calculateCurrentBasketDays\(\{ context: cycle, admissionDate: employee\.admissionDate \}\)/); assert.match(server, /calculateRetroactiveDays\(\{ context: cycle, admissionDate: employee\.admissionDate \}\)/);
  assert.match(server, /if \(!employee\.admissionDate\) throw new BasicBasketValidationError/); assert.match(server, /"Informe a Data de Admissão do colaborador para calcular a Cesta Básica\."/); // ausência bloqueia
  assert.match(server, /monthlyBasketCents: entry\.basketCents/); assert.match(server, /monthlyBasketAmount: centsToDecimalString\(entry\.basketCents\)/); assert.match(server, /basketAmount: centsToDecimalString\(line\.payableBasketCents\)/);
  assert.match(server, /return \{ year, month, daysInMonth: basicBasketDaysInMonth\(year, month\), calculationDays: BASIC_BASKET_CALCULATION_DAYS, \.\.\.cycle, holidays, people \}/); // contexto: dias reais (card) + base 30
  assert.match(server, /currentCalculationDays: BASIC_BASKET_CALCULATION_DAYS/); assert.match(server, /referenceCalculationDays: BASIC_BASKET_CALCULATION_DAYS/);
  for (const source of [server, section, workbook]) assert.doesNotMatch(source, /currentMonthDays|referenceMonthDays/); // sem campo ambíguo de "dias do mês" na fórmula
  assert.doesNotMatch(server, /entry\.(retroactiveAmount|retroactiveDays|referenceCalculationDays|currentBasketDays|currentCalculationDays|monthlyBasketAmount|payable\w*|totalAmount|amount|admissionDate|previousPaymentDate|department|costCenter)/);
  assert.doesNotMatch(server, /retroactiveWindowStart|accrual|cycleFromPayments|RetroactiveContext|retroactiveContextFromPayments/); // regras anteriores removidas
  assert.match(server, /createFinancialRecordInTransaction/); assert.match(server, /Prisma\.TransactionIsolationLevel\.Serializable/);
  // padrões: Bonificação, Acordo, Cesta MENSAL e empresa; NUNCA Observação/Retroativo/valor proporcional
  const defaults = /const defaults = \{([^}]*)\}/.exec(server)?.[1] ?? "";
  assert.match(defaults, /driverBonus/); assert.match(defaults, /agreementAmount/); assert.match(defaults, /basketAmount: centsToDecimalString\(entry\.basketCents\)/); assert.doesNotMatch(defaults, /observation|retroactive|payable/);
  assert.match(section, /observation: "" \}/); // nova competência: observação vazia
  // correção preserva snapshots (admissão usada + ciclo do mapa), parte do valor mensal e é soft delete; cancelamento é soft cancel
  assert.match(server, /admissionDate: dateOnlyFromDb\(original\.admissionDate\)/); assert.match(server, /basicBasketContextFromPayments\(isoDay\(map\.previousPaymentDate\), isoDay\(map\.paymentDate\)\)/); assert.match(server, /deletedAt: new Date\(\)/);
  assert.match(section, /basket: toInput\(row\.monthlyBasketAmount\)/);
  assert.match(deletion, /export async function cancelBasicBasketMap/); assert.doesNotMatch(deletion, /basicBasket\w*\.delete(Many)?\(/);
  // tela: card mostra os dias REAIS do calendário; base 30 vem da constante; ausência de admissão bloqueia; lote explícito
  // dias do calendário (mês real, só exibição) separados da base financeira fixa de 30 dias
  assert.match(section, /label: "Dias do calendário", value: String\(ctx\?\.daysInMonth \?\? "—"\)/); assert.match(section, /label: "Base da Cesta", value: `\$\{BASIC_BASKET_CALCULATION_DAYS\} dias`/); assert.match(section, /BASIC_BASKET_CALCULATION_DAYS/);
  assert.match(section, /Receberá na próxima competência/); assert.match(section, /A pagar: /); assert.match(section, /if \(currentStatus === "MISSING_ADMISSION"\) return \{ \.\.\.base, error: MISSING_ADMISSION \}/);
  assert.match(section, /selectedIds\.includes\(id\) \? \{ \.\.\.value, basket: bulkBasket \}/); assert.doesNotMatch(section, /useEffect\([^)]*bulkBasket/); assert.doesNotMatch(section, /Cesta Básica desta competência é integral|dias corridos/);
  // calendário somente leitura (sem cadastro/edição de feriado na Cesta)
  assert.doesNotMatch(section, /HolidayModal|holidays", "POST"|holidays", "DELETE"/);
  // aba nova sem quebrar as existentes; domínio próprio; migrations só aditivas
  assert.match(page, /useState<"alimentacao" \| "cafe" \| "cesta">\("alimentacao"\)/); assert.match(page, /subsection === "cafe" && <BreakfastSection \/>/);
  assert.match(schema, /model BasicBasketAllocation \{/); assert.doesNotMatch(schema.slice(schema.indexOf("model BreakfastAllocation {"), schema.indexOf("enum BreakfastObservationType")), /basket|driverBonus/i);
  const strip = (text: string) => text.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n");
  const sql = strip(migration);
  assert.doesNotMatch(sql, /DROP|RENAME|ALTER TABLE "(?!BasicBasket)/); assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 4);
  const prorationSql = strip(proration);
  assert.doesNotMatch(prorationSql, /DROP|RENAME|ALTER TABLE "(?!BasicBasket)|UPDATE "(?!BasicBasket)/); assert.doesNotMatch(prorationSql, /"(retroactiveAmount|amount|basketAmount)" =/); // não reescreve valores
  const referenceSql = strip(referenceMonth);
  assert.match(referenceSql, /RENAME COLUMN "accrualPeriodDays" TO "referenceMonthDays"/); assert.doesNotMatch(referenceSql, /DROP|ALTER TABLE "(?!BasicBasketAllocation)|"(retroactiveAmount|amount|basketAmount|totalAmount|grossAmount)" =/);
  const currentSql = strip(currentMonth);
  assert.match(currentSql, /ADD COLUMN "monthlyBasketAmount" DECIMAL\(19,4\)/); assert.doesNotMatch(currentSql, /DROP|RENAME|DELETE|ALTER TABLE "(?!BasicBasketAllocation)|UPDATE "(?!BasicBasketAllocation)|"(retroactiveAmount|amount|basketAmount|totalAmount|grossAmount)" =/);
  // migration da base de 30: trava contra linhas proporcionais antigas, só renomeia bases e ajusta metadados — nunca dinheiro
  const commercialSql = strip(commercial);
  assert.match(commercialSql, /RAISE EXCEPTION/); assert.match(commercialSql, /RENAME COLUMN "currentMonthDays" TO "currentCalculationDays"/); assert.match(commercialSql, /RENAME COLUMN "referenceMonthDays" TO "referenceCalculationDays"/);
  assert.doesNotMatch(commercialSql, /DROP|DELETE|ALTER TABLE "(?!BasicBasketAllocation)|UPDATE "(?!BasicBasketAllocation)|"(retroactiveAmount|amount|basketAmount|monthlyBasketAmount|totalAmount|grossAmount)" =/);
  assert.match(schema, /previousPaymentDate\s+DateTime\s+@db\.Date/); assert.match(schema, /retroactiveDays\s+Int/); assert.match(schema, /monthlyBasketAmount\s+Decimal\s+@db\.Decimal\(19, 4\)/); assert.match(schema, /currentBasketDays\s+Int/);
  assert.match(schema, /currentCalculationDays\s+Int/); assert.match(schema, /referenceCalculationDays\s+Int/); assert.doesNotMatch(schema, /accrualPeriodDays|currentMonthDays\s+Int|referenceMonthDays\s+Int/);
  // Espelho de Ponto: o cliente só envia o id da importação; Férias/Falta/dias/valores vêm do servidor (importação gravada ou snapshot na correção)
  const [pointServer, pointRoute, pointMigration, entriesRoute] = await Promise.all([
    readFile(new URL("../src/modules/accounts-payable/basic-basket/point-mirror-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/basic-basket/point-mirror/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20261006120000_basic_basket_point_mirror/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/basic-basket/entries/route.ts", import.meta.url), "utf8"),
  ]);
  // do cliente só vem o INSUMO Férias manuais (validado no servidor, Fase 7E.3); dias/Falta/ajustes nunca
  assert.doesNotMatch(server, /entry\.(?!manualVacationDays\b)(\w*[Vv]acation\w*|\w*[Aa]bsence\w*|\w*PayableDays|adjustments|occurrences)/); assert.doesNotMatch(entriesRoute, /vacation|absence|adjustments|occurrences/i);
  assert.match(server, /resolveReviewedBasicBasketAdjustments\(\{ context: cycle, admissionDate: employeeById\.get\(entry\.employeeId\)!\.admissionDate, occurrences,/);
  assert.match(await readFile(new URL("../src/modules/accounts-payable/basic-basket/point-mirror-review.ts", import.meta.url), "utf8"), /resolveBasicBasketAdjustments\(\{ context: input\.context, admissionDate: input\.admissionDate, occurrences: approvedPointMirrorOccurrences\(/);
  assert.match(server, /record\.createdByUserId !== input\.userId \|\| record\.year !== input\.year \|\| record\.month !== input\.month/); // mesma competência e usuário
  assert.match(server, /currentVacationDays: original\.currentVacationDays, currentUnjustifiedAbsence: original\.currentUnjustifiedAbsence/); // correção usa o snapshot
  assert.match(server, /if \(total\.lte\(0\)\) throw new BasicBasketValidationError/); // lote zerado não gera obrigação
  assert.doesNotMatch(pointServer, /writeFile|storePrivateFile|console\.|cpf: person\.cpf|cpf: employee\.cpf/); assert.match(pointServer, /where: \{ cpf: \{ in: cpfs \} \}/); assert.doesNotMatch(pointServer, /officialName: \{|normalizedName/); // só CPF, nada do arquivo persistido/logado
  assert.match(pointRoute, /MAX_POINT_MIRROR_FILE_SIZE/); assert.match(pointRoute, /console\.error\("BASIC_BASKET_POINT_MIRROR_ERROR"\)/);
  assert.match(section, /Aplicar Faltas e Férias/); assert.match(section, /pointMirrorImportId: activeApplied\?\.importId \?\? null/); assert.match(section, /setApplied\(\{ importId: pointPreview\.importId, competence, byEmployee: body\.byEmployee,/); // substitui, não soma (ajustes calculados pelo servidor com as aprovadas — Fase 7E.3)
  const pointSql = strip(pointMigration);
  assert.match(pointSql, /CREATE TABLE "BasicBasketPointMirrorImport"/); assert.match(pointSql, /SET "currentPayableDays" = "currentBasketDays", "retroactivePayableDays" = "retroactiveDays"/);
  assert.doesNotMatch(pointSql, /DROP |RENAME |DELETE FROM|TRUNCATE|ALTER TABLE "(?!BasicBasket)|UPDATE "(?!BasicBasketAllocation)|"(retroactiveAmount|amount|basketAmount|monthlyBasketAmount|totalAmount|grossAmount)" =/);
  assert.match(schema, /model BasicBasketPointMirrorImport \{/); assert.doesNotMatch(schema.slice(schema.indexOf("model BasicBasketPointMirrorImport {"), schema.indexOf("model BasicBasketEmployeeConfig {")), /cpf|fileName|buffer|content\s/i);
  // Falta Injustificada: mês de apuração = mês calendário anterior completo (sem previousPaymentDate), flag separada do Retroativo
  const calcSource = await readFile(new URL("../src/modules/accounts-payable/basic-basket/calculations.ts", import.meta.url), "utf8");
  assert.match(calcSource, /currentUnjustifiedAbsence: current\.currentBasketDays > 0 && inMonth\(absenceDates, context\.absenceReferenceMonthStart, context\.absenceReferenceMonthEnd\)/);
  assert.match(calcSource, /retroactiveUnjustifiedAbsence: retro\.retroactiveDays > 0 && inMonth\(absenceDates, context\.referenceMonthStart, context\.referenceMonthEnd\)/);
  assert.match(calcSource, /const absenceDates = applicableOccurrenceDates\(occurrences\.absenceDates, admissionDate\)/); assert.match(calcSource, /dates\.filter\(\(date\) => date >= admissionDate\)/); // corte pela admissão no domínio (backend)
  // a prévia do Espelho é exibida em ui/BasicBasketPointMirror (apresentação); os rótulos de situação seguem na seção
  const pointMirrorUi = await readFile(new URL("../src/modules/accounts-payable/basic-basket/ui/BasicBasketPointMirror.tsx", import.meta.url), "utf8");
  assert.match(pointMirrorUi, /anterior à admissão, ignorada/); assert.match(pointMirrorUi, /Anterior à admissão — não reduz/); assert.match(section, /Ocorrência anterior à admissão — ignorada/);
  assert.match(calcSource, /const absence = previousCompetence\(competenceYear, competenceMonth\), absenceBounds = monthBounds\(absence\.year, absence\.month\)/);
  assert.match(section, /Afeta a próxima competência/); assert.match(section, /Fora do período de apuração/); assert.doesNotMatch(section, /Fora do período relevante/);
});
test("cesta básica: Férias por blocos contínuos no mês comercial de 30 dias (fevereiro, dia 31, admissão, Retroativo)", async () => {
  const { buildBasicBasketContext, buildBasicBasketVacationBlocks, calculateBasicBasketLine, resolveBasicBasketAdjustments, EMPTY_BASIC_BASKET_OCCURRENCES } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const { classifyBasicBasketPointMirrorRow } = await import("../src/modules/accounts-payable/basic-basket/point-mirror");
  const range = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
  const fin = (dates: string[], start: string, end: string, from?: string) => new Set(buildBasicBasketVacationBlocks(dates, start, end, from).flatMap((block) => block.financialDays)).size;
  const feb27 = ["2027-02-01", "2027-02-28"] as const, feb28 = ["2028-02-01", "2028-02-29"] as const, oct = ["2026-10-01", "2026-10-31"] as const;
  // 49/16 — fevereiro/2027 completo → 30 dias financeiros (bloco contínuo até o último dia real)
  assert.equal(fin(range("2027-02-01", "2027-02-28"), ...feb27), 30);
  // 50/17 — 20/02 → 28/02 → 20..30 = 11; 51/18 — bissexto 20/02 → 29/02 → 11
  assert.equal(fin(range("2027-02-20", "2027-02-28"), ...feb27), 11); assert.equal(fin(range("2028-02-20", "2028-02-29"), ...feb28), 11);
  // 52/53/19/20 — último dia ISOLADO não estende (1 dia) e sinaliza aviso
  for (const [date, bounds] of [["2027-02-28", feb27], ["2028-02-29", feb28]] as const) { const blocks = buildBasicBasketVacationBlocks([date], bounds[0], bounds[1]); assert.deepEqual([blocks.length, blocks[0].financialDays.length, blocks[0].extendedToMonthEnd, blocks[0].isolatedLastDay], [1, 1, false, true], date); }
  // 54/21 — 27 e 28/02 → 27..30 = 4; 55/22 — bloco que não chega ao fim → 3; 56/23 — buraco → 2 blocos, 4 dias (22 não é preenchido)
  assert.equal(fin(["2027-02-27", "2027-02-28"], ...feb27), 4);
  assert.equal(fin(range("2027-02-20", "2027-02-22"), ...feb27), 3);
  const gap = buildBasicBasketVacationBlocks(["2027-02-20", "2027-02-21", "2027-02-23", "2027-02-24"], ...feb27);
  assert.deepEqual(gap.map((block) => [block.start, block.end, block.financialDays]), [["2027-02-20", "2027-02-21", [20, 21]], ["2027-02-23", "2027-02-24", [23, 24]]]);
  // 60/3 — duplicidades: 20,20,21,21,22 → bloco 20→22 = 3
  const dup = buildBasicBasketVacationBlocks(["2027-02-20", "2027-02-20", "2027-02-21", "2027-02-21", "2027-02-22"], ...feb27);
  assert.deepEqual(dup.map((block) => [block.start, block.end, block.financialDays.length]), [["2027-02-20", "2027-02-22", 3]]);
  // 57–59/10–12 — mês de 31 dias: 31/10 → 1; 30+31 → {30} = 1; 29+30+31 → {29,30} = 2 (nada passa de 30)
  assert.deepEqual([fin(["2026-10-31"], ...oct), fin(["2026-10-30", "2026-10-31"], ...oct), fin(["2026-10-29", "2026-10-30", "2026-10-31"], ...oct), fin(range("2026-10-01", "2026-10-31"), ...oct)], [1, 1, 2, 30]);
  assert.equal(buildBasicBasketVacationBlocks(["2026-10-31"], ...oct)[0].isolatedLastDay, false); // mês com 31 dias: sem aviso de continuidade
  // 5 — nunca atravessa meses: 31/01 + 01/02 não formam bloco (cada mês é calculado separado)
  assert.deepEqual(buildBasicBasketVacationBlocks(["2027-01-31", "2027-02-01"], ...feb27).map((block) => [block.start, block.end]), [["2027-02-01", "2027-02-01"]]);
  // Cesta da competência 02/2027 (pagamento 10/02): interseção com o direito pela admissão
  const febCtx = buildBasicBasketContext(2027, 2), marCtx = buildBasicBasketContext(2027, 3);
  const adj = (admissionDate: string, patch: Partial<typeof EMPTY_BASIC_BASKET_OCCURRENCES>, context = febCtx) => resolveBasicBasketAdjustments({ context, admissionDate, occurrences: { ...EMPTY_BASIC_BASKET_OCCURRENCES, ...patch } });
  const line = (current: number, retro: number, adjustments: ReturnType<typeof adj>) => calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 40000, currentBasketDays: current, retroactiveDays: retro, adjustments });
  // 49 — mês completo de Férias em fevereiro: 30/30 de Férias → 0/30, R$ 0
  const full = adj("2020-01-01", { currentVacationDates: range("2027-02-01", "2027-02-28") });
  assert.deepEqual([full.currentVacationDays, line(30, 0, full).currentPayableDays, line(30, 0, full).payableBasketCents], [30, 0, 0]);
  // 61/62/63 — admissão 20/02 (direito 20..30 = 11; a admissão é após o pagamento de 10/02, então vale no Retroativo de 03/2027)
  assert.deepEqual([adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-28") }, marCtx).retroactiveVacationDays, adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-22") }, marCtx).retroactiveVacationDays, adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-19") }, marCtx).retroactiveVacationDays], [11, 3, 0]);
  assert.deepEqual([line(30, 11, adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-28") }, marCtx)).retroactivePayableDays, line(30, 11, adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-22") }, marCtx)).retroactivePayableDays, line(30, 11, adj("2027-02-20", { referenceVacationDates: range("2027-02-01", "2027-02-19") }, marCtx)).retroactivePayableDays], [0, 8, 11]);
  // 64 — Retroativo 20..30 (11) com Férias 20/02 → fim do mês: 0 dias retroativos finais
  const r64 = adj("2027-02-20", { referenceVacationDates: range("2027-02-20", "2027-02-28") }, marCtx);
  assert.deepEqual([r64.retroactiveVacationDays, line(30, 11, r64).retroactivePayableDays, line(30, 11, r64).retroactiveCents], [11, 0, 0]);
  // mesma lógica na Cesta proporcional (competência): admissão 05/02/2027 (≤ pagamento 10/02, direito 05..30 = 26)
  assert.deepEqual([adj("2027-02-05", { currentVacationDates: range("2027-02-01", "2027-02-28") }).currentVacationDays, adj("2027-02-05", { currentVacationDates: range("2027-02-01", "2027-02-10") }).currentVacationDays, adj("2027-02-05", { currentVacationDates: range("2027-02-01", "2027-02-04") }).currentVacationDays], [26, 6, 0]);
  // 27–29 — outubro: admissão 05/10 + Férias 01–15/10 → 11 (05..15) → 15/30 = R$ 200; 01–04 → 0; 01–10 → 6
  const octCtx = buildBasicBasketContext(2026, 10);
  assert.deepEqual([adj("2026-10-05", { currentVacationDates: range("2026-10-01", "2026-10-15") }, octCtx).currentVacationDays, adj("2026-10-05", { currentVacationDates: range("2026-10-01", "2026-10-04") }, octCtx).currentVacationDays, adj("2026-10-05", { currentVacationDates: range("2026-10-01", "2026-10-10") }, octCtx).currentVacationDays], [11, 0, 6]);
  assert.equal(line(26, 0, adj("2026-10-05", { currentVacationDates: range("2026-10-01", "2026-10-15") }, octCtx)).payableBasketCents, 20000);
  // 31 — Retroativo 21..30 com Férias 15..25/09 → 21..25 = 5 → 5/30
  const r31 = adj("2026-09-21", { referenceVacationDates: range("2026-09-15", "2026-09-25") }, octCtx);
  assert.deepEqual([r31.retroactiveVacationDays, line(30, 10, r31).retroactivePayableDays], [5, 5]);
  // 36 — Falta vence Férias, mas os dias de Férias continuam auditados
  const r36 = adj("2020-01-01", { currentVacationDates: range("2026-10-01", "2026-10-15"), absenceDates: ["2026-09-10"] }, octCtx);
  assert.deepEqual([r36.currentVacationDays, r36.currentUnjustifiedAbsence, line(30, 0, r36).payableBasketCents], [15, true, 0]);
  // 65–67 — Falta não regride
  assert.equal(line(26, 0, adj("2026-10-05", { absenceDates: ["2026-09-14"] }, octCtx)).payableBasketCents, 34667);
  const r66 = adj("2026-09-21", { absenceDates: ["2026-09-25"] }, octCtx), r67 = adj("2026-09-21", { absenceDates: ["2026-09-14"] }, octCtx);
  assert.deepEqual([line(30, 10, r66).payableBasketCents, line(30, 10, r66).retroactiveCents, line(30, 10, r67).payableBasketCents, line(30, 10, r67).retroactiveCents], [0, 0, 40000, 13333]);
  // 37/38/68 — separadores , ; | e quebra de linha; match exato
  for (const events of ["OUTRO, Férias", "OUTRO; Férias", "OUTRO | Férias", "OUTRO\nFérias"]) assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Folga", events }).vacation, true, events);
  for (const events of ["OUTRO; Férias Coletivas", "FERIAS PROGRAMADAS", "Férias Coletivas"]) assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Folga", events }).vacation, false, events);
  assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Falta", events: "Atraso; FALTA INJUSTIFICADA" }).absence, true);
  assert.equal(classifyBasicBasketPointMirrorRow({ journey: "Falta", events: "FALTA INJUSTIFICADA PARCIAL" }).absence, false);
  // continuidade com aritmética só-dia (sem fuso/horário de verão): bloco atravessando a antiga virada de 04/11/2018
  assert.deepEqual(buildBasicBasketVacationBlocks(["2018-11-03", "2018-11-04", "2018-11-05"], "2018-11-01", "2018-11-30").map((block) => block.financialDays), [[3, 4, 5]]);
});

// ---- Fase 7D: fundação para telas com muitos dados (componentes isolados; sem snapshot de HTML).
test("DataTable: semântica (caption, thead/tbody, scope), números à direita com tabular-nums, estados e seleção", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DataTable, nextSort, selectionState, toggleAllSelection } = await import("../src/components/ui/DataTable");
  type Row = { id: string; name: string; total: number };
  const rows: Row[] = [{ id: "a", name: "Linha A", total: 10 }, { id: "b", name: "Linha B", total: 20 }];
  const columns = [
    { id: "name", header: "Nome", rowHeader: true, sticky: "start" as const, width: "10rem", sortable: true, cell: (row: Row) => row.name },
    { id: "total", header: "Total", numeric: true, cell: (row: Row) => String(row.total) },
  ];
  const html = renderToStaticMarkup(createElement(DataTable<Row>, {
    caption: "Lançamentos", columns, rows, getRowId: (row) => row.id, sort: { key: "name", direction: "asc" }, onSortChange: () => undefined,
    selection: { selectedIds: ["a"], onChange: () => undefined, getRowLabel: (row) => row.name }, rowActions: () => "…", stickyActions: true, maxHeight: "20rem",
  }));
  assert.match(html, /<caption class="sr-only">Lançamentos<\/caption>/);
  assert.match(html, /<thead>/); assert.match(html, /<tbody>/);
  assert.equal((html.match(/<th scope="col"/g) ?? []).length, 4); // seleção + 2 colunas + ações
  assert.equal((html.match(/<th scope="row"/g) ?? []).length, 2);
  assert.match(html, /aria-sort="ascending"/);
  assert.match(html, /<td class="[^"]*text-right[^"]*tabular-nums[^"]*"[^>]*>10<\/td>/);
  assert.doesNotMatch(html, /text-center[^"]*tabular-nums/);
  assert.match(html, /aria-label="Selecionar Linha A"/); assert.match(html, /data-selected="true"/);
  assert.match(html, /class="[^"]*sticky top-0/); // cabeçalho fixo com maxHeight
  assert.match(html, /overflow-x-auto/);
  assert.doesNotMatch(html, /odd:|even:|zebra/);
  // estados: loading (skeleton + aria-busy), vazio (EmptyState) e erro (alerta) — sem renderizar as linhas
  const loading = renderToStaticMarkup(createElement(DataTable<Row>, { caption: "X", columns, rows, getRowId: (row) => row.id, loading: true, loadingRows: 3 }));
  assert.match(loading, /aria-busy="true"/); assert.equal((loading.match(/<tr aria-hidden="true">/g) ?? []).length, 3); assert.doesNotMatch(loading, /Linha A/);
  assert.match(renderToStaticMarkup(createElement(DataTable<Row>, { caption: "X", columns, rows: [], getRowId: (row) => row.id, empty: { title: "Nada por aqui" } })), /Nada por aqui/);
  const failed = renderToStaticMarkup(createElement(DataTable<Row>, { caption: "X", columns, rows, getRowId: (row) => row.id, error: "Falhou" }));
  assert.match(failed, /role="alert"/); assert.doesNotMatch(failed, /Linha A/);
  // dense = linhas de 36px (h-9); padrão = 44px (h-11)
  assert.match(renderToStaticMarkup(createElement(DataTable<Row>, { caption: "X", columns, rows, getRowId: (row) => row.id, density: "dense" })), /<td class="h-9 /);
  assert.match(renderToStaticMarkup(createElement(DataTable<Row>, { caption: "X", columns, rows, getRowId: (row) => row.id })), /<td class="h-11 /);
  // ordenação só visual/controlada; seleção preserva outras páginas
  assert.deepEqual(nextSort(null, "name"), { key: "name", direction: "asc" });
  assert.deepEqual(nextSort({ key: "name", direction: "asc" }, "name"), { key: "name", direction: "desc" });
  assert.deepEqual(nextSort({ key: "name", direction: "desc" }, "total"), { key: "total", direction: "asc" });
  assert.equal(selectionState(["a", "b"], ["a"]), "some"); assert.equal(selectionState(["a", "b"], ["a", "b", "z"]), "all"); assert.equal(selectionState([], ["a"]), "none");
  assert.deepEqual(toggleAllSelection(["a", "b"], ["z"]), ["z", "a", "b"]);
  assert.deepEqual(toggleAllSelection(["a", "b"], ["z", "a", "b"]), ["z"]);
  const source = await readFile(new URL("../src/components/ui/DataTable.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@tanstack|\.sort\(/); // sem TanStack e sem sort client-side automático
});

test("Pagination: nav rotulada, aria-current, anterior/próxima desabilitados nas pontas e janela de páginas", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Pagination, paginationRange, paginationSummary } = await import("../src/components/ui/Pagination");
  const first = renderToStaticMarkup(createElement(Pagination, { page: 1, pageCount: 6, onPageChange: () => undefined, totalItems: 57, pageSize: 10 }));
  assert.match(first, /<nav aria-label="Paginação"/);
  assert.match(first, /aria-current="page" aria-label="Página 1"/);
  assert.match(first, /disabled="" aria-label="Página anterior"/);
  assert.doesNotMatch(first, /disabled="" aria-label="Próxima página"/);
  assert.match(first, /Mostrando 1–10 de 57/);
  const last = renderToStaticMarkup(createElement(Pagination, { page: 6, pageCount: 6, onPageChange: () => undefined }));
  assert.match(last, /disabled="" aria-label="Próxima página"/);
  assert.deepEqual(paginationRange(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(paginationRange(6, 20), [1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 20]);
  assert.deepEqual(paginationRange(1, 20), [1, 2, "ellipsis-end", 20]);
  assert.deepEqual(paginationRange(20, 20), [1, "ellipsis-start", 19, 20]);
  assert.deepEqual(paginationRange(1, 0), []);
  assert.equal(paginationSummary(6, 10, 57), "Mostrando 51–57 de 57");
  assert.equal(paginationSummary(1, 10, 0), "Nenhum registro");
});

test("SearchInput: rótulo real (não só placeholder), botão limpar com nome e sem largura fixa", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SearchInput } = await import("../src/components/ui/SearchInput");
  const empty = renderToStaticMarkup(createElement(SearchInput, { label: "Buscar colaboradores", placeholder: "Nome", value: "", onValueChange: () => undefined, id: "busca" }));
  assert.match(empty, /<label for="busca" class="sr-only">Buscar colaboradores<\/label>/);
  assert.match(empty, /id="busca" type="search"/);
  assert.doesNotMatch(empty, /Limpar busca/);
  const filled = renderToStaticMarkup(createElement(SearchInput, { label: "Buscar", value: "ana", onValueChange: () => undefined, hideLabel: false }));
  assert.match(filled, /aria-label="Limpar busca"/);
  assert.match(filled, /class="text-label text-foreground"/);
  assert.doesNotMatch(filled, /\bw-\[\d|\bw-(64|72|80|96)\b/);
  const source = await readFile(new URL("../src/components/ui/SearchInput.tsx", import.meta.url), "utf8");
  assert.match(source, /from "lucide-react"/); assert.match(source, /Escape/);
});

test("CurrencyInput: controlado pelo módulo, inputMode decimal, prefixo R$, sem arredondamento silencioso", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CurrencyInput, formatCurrencyInput, parseCurrencyInput, isAcceptableCurrencyDraft } = await import("../src/components/ui/CurrencyInput");
  const html = renderToStaticMarkup(createElement(CurrencyInput, { id: "valor", value: 1234.5, onValueChange: () => undefined, "aria-invalid": true }));
  assert.match(html, /inputMode="decimal"/); assert.match(html, />R\$<\/span>/); assert.match(html, /value="1\.234,50"/); assert.match(html, /aria-invalid="true"/);
  assert.match(renderToStaticMarkup(createElement(CurrencyInput, { value: null, onValueChange: () => undefined, disabled: true })), /disabled=""/);
  assert.match(renderToStaticMarkup(createElement(CurrencyInput, { value: 5, onValueChange: () => undefined, readOnly: true })), /readOnly=""/);
  // parse pt-BR
  assert.equal(parseCurrencyInput(""), null);
  assert.equal(parseCurrencyInput("1.234,56"), 1234.56);
  assert.equal(parseCurrencyInput("1234,5"), 1234.5);
  assert.equal(parseCurrencyInput("12.5"), 12.5);
  assert.equal(parseCurrencyInput("1.234"), 1234);
  assert.equal(parseCurrencyInput("1,234"), undefined); // 3 casas > limite: inválido, nunca arredonda
  assert.equal(parseCurrencyInput("1,2,3"), undefined);
  assert.equal(parseCurrencyInput("-5,00"), undefined);
  assert.equal(parseCurrencyInput("-5,00", { allowNegative: true }), -5);
  // digitação além das casas permitidas é recusada (o texto não muda)
  assert.equal(isAcceptableCurrencyDraft("10,55"), true);
  assert.equal(isAcceptableCurrencyDraft("10,555"), false);
  assert.equal(isAcceptableCurrencyDraft("10,5a"), false);
  assert.equal(isAcceptableCurrencyDraft("12,"), true);
  // formatação nunca corta casas de um valor recebido
  assert.equal(formatCurrencyInput(10.555), "10,555");
  assert.equal(formatCurrencyInput(10), "10,00");
  assert.equal(formatCurrencyInput(null), "");
  const source = await readFile(new URL("../src/components/ui/CurrencyInput.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.round|toFixed/);
});

test("ImportFlow: etapas com texto/ícone, erro bloqueia, aviso não bloqueia, prévia arbitrária e sem lógica de domínio", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ImportFlow, importStepStates, canApplyImport } = await import("../src/components/ui/ImportFlow");
  assert.deepEqual(importStepStates("select"), ["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(importStepStates("preview"), ["complete", "complete", "current", "upcoming", "upcoming"]);
  assert.deepEqual(importStepStates("done"), ["complete", "complete", "complete", "complete", "complete"]);
  assert.equal(canApplyImport({ step: "preview" }), true);
  assert.equal(canApplyImport({ step: "preview", errors: [{ id: "e", message: "x" }] }), false);
  assert.equal(canApplyImport({ step: "preview", canApply: false }), false);
  assert.equal(canApplyImport({ step: "select" }), false);
  const base = { file: null, onSelect: () => undefined, onApply: () => undefined, onReset: () => undefined };
  const select = renderToStaticMarkup(createElement(ImportFlow, { ...base, step: "select", accept: ".xlsx" }));
  assert.match(select, /<ol aria-label="Etapas da importação"/);
  assert.match(select, /<li aria-current="step"[^>]*>.*?Selecionar<span class="sr-only"> \(etapa atual\)/);
  assert.match(select, /type="file"/);
  const blocked = renderToStaticMarkup(createElement(ImportFlow, {
    ...base, step: "preview", preview: createElement("table", { "data-preview": "" }),
    errors: [{ id: "e1", message: "Coluna obrigatória vazia" }], warnings: [{ id: "w1", message: "Linhas duplicadas" }],
  }));
  assert.match(blocked, /data-preview=""/);
  assert.match(blocked, /role="alert"[^]*1 erro impede a aplicação[^]*Bloqueia/);
  assert.match(blocked, /role="status"[^]*1 aviso para revisar[^]*Não bloqueia/);
  assert.match(blocked, /disabled=""[^>]*>Aplicar<\/button>/);
  const warningOnly = renderToStaticMarkup(createElement(ImportFlow, { ...base, step: "preview", warnings: [{ id: "w1", message: "Aviso" }] }));
  assert.doesNotMatch(warningOnly, /disabled=""[^>]*>Aplicar<\/button>/);
  const done = renderToStaticMarkup(createElement(ImportFlow, { ...base, step: "done", result: "3 registros aplicados" }));
  assert.match(done, /Resultado da importação/); assert.match(done, /3 registros aplicados/);
  for (const file of ["ImportFlow", "UploadDropzone", "DataTable", "FilterBar", "CurrencyInput", "CalculatedValue", "SearchInput", "Pagination", "Skeleton", "Tooltip"]) {
    const source = await readFile(new URL(`../src/components/ui/${file}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /fetch\(|\/api\//, `${file} não chama API`);
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /\b(cpf|cesta|basket|caf[eé]|breakfast|f[eé]rias|vacation|vale[- ]transporte|transit[- ]?voucher|alimenta[cç][aã]o)\b/i, `${file} sem domínio`);
    assert.doesNotMatch(source, /\b(slate|emerald|amber|red)-\d|#[0-9a-f]{3,6}\b/i, `${file} usa tokens`);
  }
});

test("UploadDropzone: input nativo focável (teclado), rótulo ligado, valida só accept/maxSize recebidos", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { UploadDropzone, validateUploadFile, matchesAccept, formatFileSize } = await import("../src/components/ui/UploadDropzone");
  const html = renderToStaticMarkup(createElement(UploadDropzone, { id: "up", label: "Arquivo", file: { name: "dados.csv", size: 2048 }, onFileSelect: () => undefined, onClear: () => undefined, accept: ".csv,.xlsx", maxSize: 1024 * 1024, helperText: "Ajuda" }));
  assert.match(html, /<input id="up" type="file" accept=".csv,.xlsx"[^>]*class="peer sr-only"/); // focável por Tab; Enter/Espaço abrem o seletor
  assert.match(html, /<label for="up"/);
  assert.match(html, /aria-describedby="up-hint"/);
  assert.match(html, /dados\.csv/); assert.match(html, /2 KB/); assert.match(html, /aria-label="Remover dados.csv"/);
  assert.match(html, /peer-focus-visible:outline/);
  const disabled = renderToStaticMarkup(createElement(UploadDropzone, { id: "d", label: "Arquivo", file: null, onFileSelect: () => undefined, disabled: true }));
  assert.match(disabled, /type="file" disabled=""/);
  const external = renderToStaticMarkup(createElement(UploadDropzone, { id: "e", label: "Arquivo", file: null, onFileSelect: () => undefined, error: "Recusado pelo servidor" }));
  assert.match(external, /aria-describedby="e-error e-hint" aria-invalid="true"/); assert.match(external, /role="alert"/);
  assert.equal(matchesAccept({ name: "A.XLSX", size: 1 }, ".xlsx"), true);
  assert.equal(matchesAccept({ name: "a.png", size: 1, type: "image/png" }, "image/*"), true);
  assert.equal(matchesAccept({ name: "a.pdf", size: 1, type: "application/pdf" }, ".csv,text/csv"), false);
  assert.equal(matchesAccept({ name: "qualquer.bin", size: 1 }), true);
  assert.match(validateUploadFile({ name: "a.pdf", size: 1 }, { accept: ".csv" }) ?? "", /Formato não aceito/);
  assert.match(validateUploadFile({ name: "a.csv", size: 3 * 1024 * 1024 }, { accept: ".csv", maxSize: 1024 * 1024 }) ?? "", /3 MB; o limite é 1 MB/);
  assert.equal(validateUploadFile({ name: "a.csv", size: 10 }, { accept: ".csv", maxSize: 1024 }), null);
  assert.equal(formatFileSize(512), "512 B"); assert.equal(formatFileSize(1536), "1,5 KB");
});

test("Tooltip: descrição sempre no DOM via aria-describedby, abre no foco, Esc fecha; posição presa à viewport", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Tooltip, tooltipPosition } = await import("../src/components/ui/Tooltip");
  const html = renderToStaticMarkup(createElement(Tooltip, { content: "Valor calculado pelo sistema", children: createElement("button", { type: "button", "aria-describedby": "ajuda" }, "i") }));
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
  assert.match(describedBy, /^ajuda \S+-tooltip$/); // preserva o aria-describedby do gatilho
  assert.ok(html.includes(`<span id="${describedBy.split(" ")[1]}" class="sr-only">Valor calculado pelo sistema</span>`));
  const source = await readFile(new URL("../src/components/ui/Tooltip.tsx", import.meta.url), "utf8");
  assert.match(source, /onFocus=/); assert.match(source, /onBlur=/); assert.match(source, /onPointerEnter=/); assert.match(source, /"Escape"/);
  assert.match(source, /aria-hidden="true"/); // balão visual não duplica a leitura
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(tooltipPosition({ top: 100, left: 100, bottom: 120, width: 20 }, { width: 100, height: 30 }, viewport), { top: 64, left: 60, placement: "top" });
  assert.equal(tooltipPosition({ top: 10, left: 100, bottom: 30, width: 20 }, { width: 100, height: 30 }, viewport).placement, "bottom"); // sem espaço acima
  assert.equal(tooltipPosition({ top: 100, left: 990, bottom: 120, width: 10 }, { width: 100, height: 30 }, viewport).left, 892); // preso à direita
});

test("Skeleton, CalculatedValue e FilterBar: movimento reduzido, valor calculado não editável e filtros com quebra de linha", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Skeleton, SkeletonGroup, SkeletonTableRows } = await import("../src/components/ui/Skeleton");
  const { CalculatedValue } = await import("../src/components/ui/CalculatedValue");
  const { FilterBar } = await import("../src/components/ui/FilterBar");
  const skeleton = renderToStaticMarkup(createElement(SkeletonGroup, null, createElement(Skeleton, { variant: "block" })));
  assert.match(skeleton, /role="status" aria-busy="true"/); assert.match(skeleton, /aria-hidden="true"/); assert.match(skeleton, /motion-reduce:animate-none/);
  assert.equal((renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement(SkeletonTableRows, { columns: 4, rows: 2 })))).match(/<td/g) ?? []).length, 8);
  const calculated = renderToStaticMarkup(createElement(CalculatedValue, { label: "Total", value: "R$ 10,00", helper: "Soma das linhas", status: { tone: "success", label: "Conferido" } }));
  assert.match(calculated, /bg-calc-surface/); assert.match(calculated, /tabular-nums/); assert.match(calculated, /\(calculado\)/); assert.match(calculated, /Conferido/);
  assert.doesNotMatch(calculated, /<input|tabindex|border-border-strong/);
  const bar = renderToStaticMarkup(createElement(FilterBar, { search: createElement("input", { "aria-label": "Buscar" }), onClear: () => undefined, activeCount: 0, advanced: { content: "x", activeCount: 2 } }, createElement("select", { "aria-label": "Status" })));
  assert.match(bar, /<section aria-label="Filtros"/); assert.match(bar, /flex flex-wrap/); assert.doesNotMatch(bar, /overflow-x/);
  assert.match(bar, /disabled=""[^>]*>.*?Limpar filtros/); // nada ativo: Limpar desabilitado
  assert.match(bar, /2<span class="sr-only"> filtros ativos<\/span>/);
});

test("cesta básica 7E: apresentação no Design System, sem regra financeira nos componentes visuais", async () => {
  const dir = "../src/modules/accounts-payable/basic-basket/";
  const files = ["ui/BasicBasketPointMirror.tsx", "ui/BasicBasketAllocationView.tsx", "ui/BasicBasketSummaryView.tsx", "ui/BasicBasketCalendar.tsx", "../shared/ui/CompetenceSummary.tsx", "../shared/ui/parts.tsx", "ui/format.ts", "ui/types.ts"];
  const [section, page, ...ui] = await Promise.all([dir + "BasicBasketSection.tsx", "../src/app/pagamentos/alimentacao/page.tsx", ...files.map((file) => dir + file)].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  // componentes do Design System na seção (abas, tabela, moeda, valor calculado, importação, diálogo)
  for (const name of ["<Tabs", "<TabPanel", "<DataTable", "<CurrencyInput", "<CalculatedValue", "<BasicBasketPointMirror", "<Dialog"]) assert.ok(section.includes(name), name);
  assert.match(ui[0], /<ImportFlow/); assert.match(page, /<Tabs label="Subseções de Alimentação"/);
  // visuais não calculam: sem cálculo de linha, sem parser monetário, sem chamadas de API
  for (const [index, source] of ui.entries()) {
    assert.doesNotMatch(source, /calculateBasicBasketLine|parseMoneyToCents|fetch\(/, files[index]);
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange|red)-\d|#[0-9a-f]{3,6}\b/i, files[index]);
    assert.doesNotMatch(source, /[↳☑☐✓⚠⌕]/, files[index]);
  }
  assert.doesNotMatch(section, /\b(emerald|amber|slate|orange)-\d|title=\{/);
  // CurrencyInput: o texto enviado ao servidor sai do número com 2 casas, lido pelo MESMO parser do cálculo
  assert.match(section, /parseMoneyToCents\(text, "Valor"\) \/ 100/); assert.match(section, /value\.toFixed\(2\)\.replace\("\.", ","\)/);
  // save/Espelho inalterados: só insumos + id da importação
  assert.match(section, /entries, pointMirrorImportId: activeApplied\?\.importId \?\? null/);
});

// ---- Fase 7E.1: perspectivas de rateio (Departamento, CC, Empresa/Depto, Empresa/CC/Depto) e Máscara Flash da Cesta.
// Fixture comum: 2 empresas (mesmo nome em ids diferentes NÃO junta), 2 CCs, 2 departamentos, linha sem CC e sem departamento.
const RATEIO_FIXTURE = [
  { id: "1", companyId: "c-projeta", company: "PROJETA", costCenter: "CC-001", department: "ENGENHARIA", employeeId: "ana", employeeName: "Ana", amount: "400.00" },
  { id: "2", companyId: "c-projeta", company: "PROJETA", costCenter: "CC-001", department: "ADMINISTRATIVO", employeeId: "maria", employeeName: "Maria", amount: "350.00" },
  { id: "3", companyId: "c-projeta", company: "PROJETA", costCenter: "CC-014", department: "ENGENHARIA", employeeId: "joao", employeeName: "João", amount: "300.0000" },
  { id: "4", companyId: "c-topogeo", company: "TOPOGEO", costCenter: "CC-014", department: "ENGENHARIA", employeeId: "bia", employeeName: "Bia", amount: "250.50" },
  { id: "5", companyId: "c-topogeo", company: "TOPOGEO", costCenter: null, department: "ADMINISTRATIVO", employeeId: "caio", employeeName: "Caio", amount: "100.25" },
  { id: "6", companyId: "c-topogeo", company: "TOPOGEO", costCenter: "CC-001", department: null, employeeId: "duda", employeeName: "Duda", amount: "99.25" },
];
const RATEIO_TOTAL = 150000;

test("rateio: quatro perspectivas sobre a mesma base (grupos, subtotais, fallback sem CC/departamento, total igual)", async () => {
  const { ALLOCATION_EMPTY_COST_CENTER, ALLOCATION_EMPTY_DEPARTMENT, assertAllocationViews, buildAllocationViews, normalizeAllocationRow } = await import("../src/modules/accounts-payable/shared/allocation-views");
  const { amountToCents } = await import("../src/modules/accounts-payable/breakfast/rateio");
  const rows = RATEIO_FIXTURE.map((row) => normalizeAllocationRow({ ...row, cents: amountToCents(row.amount), source: row }));
  const views = buildAllocationViews(rows);
  const flat = (nodes: Array<{ label: string; cents: number; children: unknown[]; rows: Array<{ employeeName: string }> }>): unknown => nodes.map((node) => [node.label, node.cents, node.children.length ? flat(node.children as typeof nodes) : node.rows.map((row) => row.employeeName)]);
  // V1 Departamento → Colaboradores (ordem pt-BR; "Sem departamento" mantido)
  assert.deepEqual(flat(views.department!.nodes), [["ADMINISTRATIVO", 45025, ["Caio", "Maria"]], ["ENGENHARIA", 95050, ["Ana", "Bia", "João"]], [ALLOCATION_EMPTY_DEPARTMENT, 9925, ["Duda"]]]);
  // V2 Centro de Custo → Colaboradores ("Sem centro de custo" mantido)
  assert.deepEqual(flat(views.costCenter!.nodes), [["CC-001", 84925, ["Ana", "Duda", "Maria"]], ["CC-014", 55050, ["Bia", "João"]], [ALLOCATION_EMPTY_COST_CENTER, 10025, ["Caio"]]]);
  // V3 Empresa → Departamento → Colaboradores
  assert.deepEqual(flat(views.companyDepartment!.nodes), [
    ["PROJETA", 105000, [["ADMINISTRATIVO", 35000, ["Maria"]], ["ENGENHARIA", 70000, ["Ana", "João"]]]],
    ["TOPOGEO", 45000, [["ADMINISTRATIVO", 10025, ["Caio"]], ["ENGENHARIA", 25050, ["Bia"]], [ALLOCATION_EMPTY_DEPARTMENT, 9925, ["Duda"]]]],
  ]);
  // V4 Empresa → Centro de Custo → Departamento → Colaboradores (nesta ordem, nunca Departamento → CC)
  assert.deepEqual(flat(views.companyCostCenterDepartment!.nodes), [
    ["PROJETA", 105000, [["CC-001", 75000, [["ADMINISTRATIVO", 35000, ["Maria"]], ["ENGENHARIA", 40000, ["Ana"]]]], ["CC-014", 30000, [["ENGENHARIA", 30000, ["João"]]]]]],
    ["TOPOGEO", 45000, [["CC-001", 9925, [[ALLOCATION_EMPTY_DEPARTMENT, 9925, ["Duda"]]]], ["CC-014", 25050, [["ENGENHARIA", 25050, ["Bia"]]]], [ALLOCATION_EMPTY_COST_CENTER, 10025, [["ADMINISTRATIVO", 10025, ["Caio"]]]]]],
  ]);
  assert.equal(views.companyCostCenterDepartment!.nodes[0].children[0].children[0].level, "department");
  // igualdade: V1 = V2 = V3 = V4 = lançamento, todas consistentes
  for (const tree of Object.values(views)) { assert.equal(tree!.totalCents, RATEIO_TOTAL); assert.equal(tree!.consistent, true); assert.equal(tree!.people, 6); }
  assert.doesNotThrow(() => assertAllocationViews(views, RATEIO_TOTAL, "teste"));
  assert.throws(() => assertAllocationViews(views, RATEIO_TOTAL + 1, "teste"), /Inconsistência no rateio de teste/);
  // chave por id: mesma razão social com ids diferentes fica separada
  const twins = buildAllocationViews([normalizeAllocationRow({ id: "x", companyId: "a", company: "ACME", employeeName: "X", cents: 100, source: null }), normalizeAllocationRow({ id: "y", companyId: "b", company: "ACME", employeeName: "Y", cents: 200, source: null })], ["companyDepartment"]);
  assert.equal(twins.companyDepartment!.nodes.length, 2);
  assert.throws(() => normalizeAllocationRow({ id: "z", employeeName: "Z", cents: 10.5, source: null }), /centavos inteiros/);
  // pura: sem Prisma/cadastro atual
  const source = await readFile(new URL("../src/modules/accounts-payable/shared/allocation-views.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "@\/lib\/db|@\/generated\/prisma|prisma\.|foodEmployee|fetch\(/);
});

test("rateio XLSX 7I.1: quatro perspectivas hierárquicas (indent/outline, subtotal no grupo, Total Geral) e base Detalhado - Colaborador", async () => {
  const { buildBreakfastWorkbook } = await import("../src/modules/accounts-payable/breakfast/workbook");
  const { buildBasicBasketWorkbook } = await import("../src/modules/accounts-payable/basic-basket/workbook");
  const { buildFoodRateioWorkbook } = await import("../src/modules/accounts-payable/food/rateio-export");
  const { ALLOCATION_VIEW_SHEET_NAMES, ALLOCATION_DETAIL_SHEET_NAME } = await import("../src/modules/accounts-payable/shared/allocation-views-workbook");
  for (const name of [...Object.values(ALLOCATION_VIEW_SHEET_NAMES), ALLOCATION_DETAIL_SHEET_NAME]) assert.ok(name.length <= 31, name);
  const cells = (sheet: ExcelJS.Worksheet, n: number) => Array.from({ length: sheet.getRow(n).cellCount }, (_, index) => sheet.getRow(n).getCell(index + 1).value);
  const tree = (sheet: ExcelJS.Worksheet) => { const out: Array<[unknown, unknown, number, number]> = []; sheet.eachRow((row, n) => { if (n > 1 && n < sheet.rowCount) out.push([row.getCell(1).value, row.getCell(2).value, row.outlineLevel ?? 0, row.getCell(1).alignment?.indent ?? 0]); }); return out; };
  // Hierarquia consistente LIDA DA PLANILHA: cada grupo = soma dos filhos diretos; topo = Total Geral; folhas = total.
  const checkHierarchy = (sheet: ExcelJS.Worksheet, leafLevel: number, expectedCents: number) => {
    const rows = tree(sheet).map(([, value, level]) => ({ cents: Math.round(Number(value) * 100), level }));
    rows.forEach((row, index) => {
      if (row.level === leafLevel) return;
      let children = 0; for (let next = index + 1; next < rows.length && rows[next].level > row.level; next++) if (rows[next].level === row.level + 1) children += rows[next].cents;
      assert.equal(children, row.cents, `${sheet.name} linha ${index + 2}`);
    });
    assert.equal(rows.filter((row) => row.level === 0).reduce((sum, row) => sum + row.cents, 0), expectedCents, sheet.name);
    assert.equal(rows.filter((row) => row.level === leafLevel).reduce((sum, row) => sum + row.cents, 0), expectedCents, sheet.name);
    assert.deepEqual(cells(sheet, sheet.rowCount), ["Total Geral", expectedCents / 100], sheet.name);
  };
  const detailSum = (sheet: ExcelJS.Worksheet) => { const valueColumn = sheet.getRow(1).cellCount; let cents = 0; sheet.eachRow((row, n) => { if (n > 1) cents += Math.round(Number(row.getCell(valueColumn).value) * 100); }); return cents; };
  const breakfastMap = (totalAmount: string) => ({ id: "m", version: 1, createdAt: new Date("2026-09-01T00:00:00Z"), administrativeEntityId: "e", totalAmount, holidaysSnapshot: [], competence: { year: 2026, month: 9 }, administrativeEntity: { tradeName: "F" },
    allocations: RATEIO_FIXTURE.map((row) => ({ ...row, workingDays: 21, baseQuantity: 21, extraQuantity: 0, discountQuantity: 0, finalQuantity: 21, unitPrice: "12.50", observationType: null, observationDetails: null })) }) as unknown as Parameters<typeof buildBreakfastWorkbook>[0];

  // Café — V4 completa: Empresa (0) → CC (1) → Departamento (2) → Colaborador (3); grupo ACIMA dos filhos; sem coluna "Linha"
  const breakfast = buildBreakfastWorkbook(breakfastMap("1500.00"));
  const v4 = breakfast.getWorksheet("Rateio - Empresa CC Depto")!;
  assert.deepEqual(cells(v4, 1), ["Empresa / Centro de Custo / Departamento / Colaborador", "Valor"]); assert.equal(v4.getRow(1).cellCount, 2);
  assert.deepEqual(tree(v4), [
    ["PROJETA", 1050, 0, 0], ["CC-001", 750, 1, 2], ["ADMINISTRATIVO", 350, 2, 4], ["Maria", 350, 3, 6], ["ENGENHARIA", 400, 2, 4], ["Ana", 400, 3, 6], ["CC-014", 300, 1, 2], ["ENGENHARIA", 300, 2, 4], ["João", 300, 3, 6],
    ["TOPOGEO", 450, 0, 0], ["CC-001", 99.25, 1, 2], ["Sem departamento", 99.25, 2, 4], ["Duda", 99.25, 3, 6], ["CC-014", 250.5, 1, 2], ["ENGENHARIA", 250.5, 2, 4], ["Bia", 250.5, 3, 6], ["Sem centro de custo", 100.25, 1, 2], ["ADMINISTRATIVO", 100.25, 2, 4], ["Caio", 100.25, 3, 6],
  ]);
  assert.equal(v4.getRow(2).font?.bold, true); assert.equal(v4.getRow(5).font?.bold, undefined); // grupo em negrito, colaborador normal
  assert.equal(typeof v4.getRow(5).getCell(2).value, "number"); assert.equal(v4.getRow(5).getCell(2).numFmt, "R$ #,##0.00"); // número + formato, nunca texto
  assert.equal(v4.properties.outlineProperties?.summaryBelow, false); assert.ok(!v4.getRow(5).hidden); // abre expandido
  assert.equal((v4.getRow(1).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb, "FFAF1B1B"); assert.equal((v4.getRow(v4.rowCount).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb, "FF000000"); // identidade atual
  assert.equal(v4.views[0].state, "frozen");
  checkHierarchy(v4, 3, RATEIO_TOTAL);
  for (const [sheetName, header, leafLevel] of [["Rateio - Departamento", "Departamento / Colaborador", 1], ["Rateio - Centro de Custo", "Centro de Custo / Colaborador", 1], ["Rateio - Empresa Departamento", "Empresa / Departamento / Colaborador", 2]] as const) {
    const sheet = breakfast.getWorksheet(sheetName)!;
    assert.deepEqual(cells(sheet, 1), [header, "Valor"]); checkHierarchy(sheet, leafLevel, RATEIO_TOTAL);
  }
  assert.deepEqual(tree(breakfast.getWorksheet("Rateio - Departamento")!).slice(0, 3), [["ADMINISTRATIVO", 450.25, 0, 0], ["Caio", 100.25, 1, 2], ["Maria", 350, 1, 2]]);
  assert.ok(tree(breakfast.getWorksheet("Rateio - Centro de Custo")!).some(([label]) => label === "Sem centro de custo"));
  // Detalhado (Café): base limpa, uma linha por alocação, valores numéricos, AutoFilter e freeze
  const detail = breakfast.getWorksheet("Detalhado - Colaborador")!;
  assert.deepEqual(cells(detail, 1), ["Colaborador", "Empresa", "Centro de Custo", "Departamento", "Competência", "Fornecedor", "Dias Úteis", "Quantidade Base", "Desconto", "Extras", "Quantidade Final", "Valor Unitário", "Valor"]);
  assert.equal(detail.rowCount, 1 + RATEIO_FIXTURE.length); // sem subtotal nem total
  assert.deepEqual(cells(detail, 2), ["Ana", "PROJETA", "CC-001", "ENGENHARIA", "09/2026", "F", 21, 21, 0, 0, 21, 12.5, 400]);
  assert.deepEqual(cells(detail, 4), ["Caio", "TOPOGEO", "Sem centro de custo", "ADMINISTRATIVO", "09/2026", "F", 21, 21, 0, 0, 21, 12.5, 100.25]); // fallback preservado
  assert.equal(detail.getRow(2).getCell(13).numFmt, "R$ #,##0.00"); assert.equal(detail.getRow(2).getCell(12).numFmt, "R$ #,##0.00");
  assert.equal(detailSum(detail), RATEIO_TOTAL); assert.deepEqual(detail.views[0], { state: "frozen", ySplit: 1, xSplit: 1 });
  assert.ok(detail.autoFilter);
  assert.throws(() => buildBreakfastWorkbook(breakfastMap("1500.01")), /Inconsistência no rateio de Café da Manhã/); // divergência bloqueia
  // round-trip: abre sem reparo, outline/indent/números/AutoFilter preservados
  const reread = new ExcelJS.Workbook(); await reread.xlsx.load(await breakfast.xlsx.writeBuffer() as ArrayBuffer);
  const v4b = reread.getWorksheet("Rateio - Empresa CC Depto")!;
  assert.equal(v4b.getRow(5).outlineLevel, 3); assert.equal(v4b.getRow(5).getCell(1).alignment?.indent, 6); assert.equal(v4b.getRow(5).getCell(2).value, 350);
  assert.equal(reread.getWorksheet("Detalhado - Colaborador")!.autoFilter?.toString(), "A1:M7");

  // Cesta — componentes e Férias lidos do snapshot (origem Manual/Espelho), Total salvo
  const basketRows = RATEIO_FIXTURE.map((row, index) => ({ ...row, driverBonus: "0", agreementAmount: "0", basketAmount: row.amount, retroactiveAmount: "0", monthlyBasketAmount: row.amount, admissionDate: null, currentCalculationDays: 30, currentBasketDays: 30, referenceCalculationDays: 30, retroactiveDays: 0, observation: null, currentVacationDays: index === 0 ? 5 : index === 1 ? 3 : 0, currentUnjustifiedAbsence: false, currentPayableDays: 30, retroactiveVacationDays: 0, retroactiveUnjustifiedAbsence: false, retroactivePayableDays: 0, manualVacationDays: index === 0 ? 5 : null, importedVacationDays: index === 1 ? 3 : null }));
  const basket = buildBasicBasketWorkbook({ version: 1, createdAt: new Date("2026-10-01T12:00:00Z"), previousPaymentDate: "2026-09-09T00:00:00.000Z", paymentDate: "2026-10-14T00:00:00.000Z", daysInMonth: 31, totalAmount: "1500.00", competence: { year: 2026, month: 10 }, administrativeEntity: { tradeName: "F" }, financialRecord: { identifier: "PG-X", grossAmount: "1500.00" }, allocations: basketRows });
  for (const [name, level] of [["Rateio - Departamento", 1], ["Rateio - Centro de Custo", 1], ["Rateio - Empresa Departamento", 2], ["Rateio - Empresa CC Depto", 3]] as const) checkHierarchy(basket.getWorksheet(name)!, level, RATEIO_TOTAL);
  const basketDetail = basket.getWorksheet("Detalhado - Colaborador")!;
  assert.deepEqual(cells(basketDetail, 1), ["Colaborador", "Empresa", "Centro de Custo", "Departamento", "Competência", "Fornecedor", "Bonificação Condutor", "Acordo", "Cesta", "Retroativo", "Férias Utilizadas (dias)", "Origem das Férias", "Valor"]);
  assert.deepEqual(cells(basketDetail, 2), ["Ana", "PROJETA", "CC-001", "ENGENHARIA", "10/2026", "F", 0, 0, 400, 0, 5, "Manual", 400]);
  assert.deepEqual(cells(basketDetail, 5).slice(10), [0, "Sem importação", 99.25]); assert.equal(cells(basketDetail, 7)[0], "Maria"); assert.deepEqual(cells(basketDetail, 7).slice(10, 12), [3, "Espelho"]);
  assert.equal(detailSum(basketDetail), RATEIO_TOTAL); assert.equal(basket.worksheets[0].name, "Detalhado"); // aba histórica intacta

  // Alimentação PA (Empresa pela NF, NF/Fornecedor/Localidade/Restaurante) e MA (Ciclo; legado "Sem ...")
  const occurrence = (id: string, employeeId: string, name: string, sector: string, invoiceEmission: string | null, amount: number, restaurantName: string | null = null) => ({ id, employeeId, normalizedReceivedName: name.toLowerCase(), receivedName: name, officialName: name, receivedDepartment: sector, confirmedDepartment: null, mealQuantity: 1, restaurantName, invoiceEmission, unitPrice: 12.5, amount, included: true });
  const meals = [occurrence("1", "ana", "ANA", "ENGENHARIA", "NF 02", 12.5, "REST A"), occurrence("2", "ana", "ANA", "ENGENHARIA", "NF 02", 12.5, "REST B"), occurrence("3", "bia", "BIA", "ADMINISTRATIVO", "NF 01", 12.5), { ...occurrence("4", "eva", "EVA", "ADMINISTRATIVO", "NF 01", 99), included: false }];
  const context = { competence: { year: 2026, month: 10 }, administrativeEntity: { tradeName: "FORNECEDOR PA" } };
  const pa = buildFoodRateioWorkbook({ locality: "PA", ...context, mealOccurrences: meals });
  assert.deepEqual(tree(pa.getWorksheet("Rateio - Empresa Departamento")!), [["BOINGA", 12.5, 0, 0], ["ADMINISTRATIVO", 12.5, 1, 2], ["BIA", 12.5, 2, 4], ["PROJETA", 25, 0, 0], ["ENGENHARIA", 25, 1, 2], ["ANA", 25, 2, 4]]);
  for (const [name, level] of [["Rateio - Departamento", 1], ["Rateio - Centro de Custo", 1], ["Rateio - Empresa Departamento", 2], ["Rateio - Empresa CC Depto", 3]] as const) checkHierarchy(pa.getWorksheet(name)!, level, 3750);
  const paDetail = pa.getWorksheet("Detalhado - Colaborador")!;
  assert.deepEqual(cells(paDetail, 1), ["Colaborador", "Empresa", "Centro de Custo", "Departamento", "Competência", "Localidade", "Fornecedor", "Restaurante", "Refeições", "Emissão NF", "Valor Unitário", "Valor"]);
  assert.deepEqual(cells(paDetail, 2), ["ANA", "PROJETA", "Sem centro de custo", "ENGENHARIA", "10/2026", "PA", "FORNECEDOR PA", "REST A, REST B", 2, "NF 02", 12.5, 25]);
  assert.equal(paDetail.rowCount, 3); assert.equal(detailSum(paDetail), 3750); // excluída fora; ANA = 1 linha (mesma alocação)
  const ma = buildFoodRateioWorkbook({ locality: "MA", cycle: 1, ...context, mealOccurrences: meals.map((meal) => ({ ...meal, invoiceEmission: null })) });
  assert.deepEqual(tree(ma.getWorksheet("Rateio - Empresa CC Depto")!)[0], ["Sem empresa", 37.5, 0, 0]);
  const maDetail = ma.getWorksheet("Detalhado - Colaborador")!;
  assert.deepEqual(cells(maDetail, 1), ["Colaborador", "Empresa", "Centro de Custo", "Departamento", "Competência", "Localidade", "Ciclo", "Fornecedor", "Restaurante", "Refeições", "Valor Unitário", "Valor"]);
  assert.deepEqual(cells(maDetail, 3), ["BIA", "Sem empresa", "Sem centro de custo", "ADMINISTRATIVO", "10/2026", "MA", "1º Ciclo (dias 1 a 15)", "FORNECEDOR PA", null, 1, 12.5, 12.5]);
  assert.equal(detailSum(maDetail), 3750);
  // preço salvo diferente na mesma linha: Valor Unitário vazio (não inventa média); Valor = soma salva
  const mixed = buildFoodRateioWorkbook({ locality: "MA", mealOccurrences: [occurrence("1", "ana", "ANA", "ENGENHARIA", null, 12.5), { ...occurrence("2", "ana", "ANA", "ENGENHARIA", null, 15), unitPrice: 15 }] });
  assert.deepEqual(cells(mixed.getWorksheet("Detalhado - Colaborador")!, 2).slice(-3), [2, null, 27.5]);
  const rereadPa = new ExcelJS.Workbook(); await rereadPa.xlsx.load(await pa.xlsx.writeBuffer() as ArrayBuffer);
  assert.equal(rereadPa.getWorksheet("Rateio - Empresa Departamento")!.getRow(4).getCell(2).value, 12.5);
});

test("vale transporte XLSX 7I.1: abas históricas intactas + quatro perspectivas e Detalhado ao final, total = mapa", async () => {
  const { buildTransitVoucherWorkbook } = await import("../src/modules/accounts-payable/transit-voucher/workbook");
  const cells = (sheet: ExcelJS.Worksheet, n: number) => Array.from({ length: sheet.getRow(n).cellCount }, (_, index) => sheet.getRow(n).getCell(index + 1).value);
  const map = (totalAmount: string, issues: unknown[] = []) => ({ id: "vt", originalName: "vt.xlsx", version: 1, processedAt: new Date("2026-10-01T00:00:00Z"), administrativeEntityId: "e", totalAmount, holidaysSnapshot: [], competence: { year: 2026, month: 10 }, administrativeEntity: { tradeName: "SET" }, issues,
    allocations: RATEIO_FIXTURE.map((row) => ({ ...row, locality: "MA", days: null, dailyPassageQuantity: 2, previousPassageDifference: 0, passageDiscount: 1, workingDays: 21, passagesToReceive: 41, fareUnitPrice: "4.80", observationType: null, observationDetails: null })) }) as unknown as Parameters<typeof buildTransitVoucherWorkbook>[0];
  const workbook = buildTransitVoucherWorkbook(map("1500.00"));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo", "Rateio por Colaborador", "Auditoria", "Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto", "Detalhado - Colaborador"]);
  const withIssues = buildTransitVoucherWorkbook(map("1500.00", [{ sourceRow: 3, employeeName: "X", code: "C", message: "M" }]));
  assert.equal(withIssues.worksheets[3].name, "Pendências"); assert.equal(withIssues.worksheets.at(-1)!.name, "Detalhado - Colaborador"); // novas abas sempre depois
  // abas históricas: mesmo cabeçalho de antes
  assert.deepEqual(cells(workbook.getWorksheet("Rateio por Colaborador")!, 1), ["Empresa", "Nome", "Departamento", "Centro de custo", "Passagens por Dia", "Diferença Mês Anterior", "Descontos", "Dias Úteis", "Passagens a Receber", "Valor Unitário", "Valor Total", "Observação"]);
  for (const name of ["Rateio - Departamento", "Rateio - Centro de Custo", "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto"]) assert.deepEqual(cells(workbook.getWorksheet(name)!, workbook.getWorksheet(name)!.rowCount), ["Total Geral", 1500], name);
  const detail = workbook.getWorksheet("Detalhado - Colaborador")!;
  assert.deepEqual(cells(detail, 1), ["Colaborador", "Empresa", "Centro de Custo", "Departamento", "Competência", "Localidade", "Fornecedor", "Dias Úteis", "Passagens por Dia", "Diferença Mês Anterior", "Descontos", "Passagens a Receber", "Tarifa", "Valor"]);
  assert.deepEqual(cells(detail, 2), ["Ana", "PROJETA", "CC-001", "ENGENHARIA", "10/2026", "MA", "SET", 21, 2, 0, 1, 41, 4.8, 400]);
  assert.throws(() => buildTransitVoucherWorkbook(map("1499.99")), /Inconsistência no rateio de Vale Transporte/);
  const source = await readFile(new URL("../src/modules/accounts-payable/transit-voucher/export.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/); assert.match(source, /buildTransitVoucherWorkbook\(map\)\.xlsx\.writeBuffer\(\)/);
});

test("rateio XLSX 7I.1: gerador compartilhado sem regra de módulo e Flash fora do escopo", async () => {
  const shared = await readFile(new URL("../src/modules/accounts-payable/shared/allocation-views-workbook.ts", import.meta.url), "utf8");
  assert.doesNotMatch(shared.replace(/^\s*\/\/.*$/gm, ""), /Férias|Passagens|Extras|Emissão NF|prisma|fetch\(|foodEmployee/); // colunas específicas ficam nos adapters
  assert.match(shared, /alignment = \{ indent: depth \* 2/); assert.match(shared, /row\.outlineLevel = depth/); assert.match(shared, /summaryBelow: false/);
  const flash = await readFile(new URL("../src/modules/accounts-payable/shared/flash.ts", import.meta.url), "utf8");
  assert.doesNotMatch(flash, /allocation-views-workbook|Detalhado - Colaborador/);
});

test("cesta básica: Máscara Flash (mesma especificação do Café) — colunas, CNPJ texto, CPF, FLEXIVEL = Total salvo, validações, rota", async () => {
  const { buildFlashWorkbook, buildFlashRows, FlashExportError, FLASH_SHEET_NAME } = await import("../src/modules/accounts-payable/shared/flash");
  const breakfast = await import("../src/modules/accounts-payable/breakfast/flash");
  assert.equal(breakfast.buildBreakfastFlashWorkbook, buildFlashWorkbook); assert.equal(breakfast.BreakfastFlashExportError, FlashExportError); // Café e Cesta: mesma implementação
  const leadingZero = cpfWithDigits("012345678");
  // alocações da Cesta (Total = Bonificação + Acordo + Cesta paga + Retroativo, já gravado pelo servidor)
  const alloc = (id: string, name: string, company: string, taxId: string | null, cpf: string | null, amount: string) => ({ id, employeeId: id, employeeName: name, company, companyId: taxId ? company : null, companyRef: taxId === null ? null : { taxId }, employee: { cpf }, amount });
  const allocations = [alloc("b", "PESSOA B", "PROJETA", "04892580000120", "52998224725", "480.0000"), alloc("a", "PESSOA A", "BOINGA", "02801028000153", leadingZero, "530.00"), alloc("c", "PESSOA C", "PROJETA", "04892580000120", null, "0.00")];
  const map = { totalAmount: "1010.00", financialRecord: { grossAmount: "1010.0000" }, allocations };
  const sheet = buildFlashWorkbook(map).worksheets[0];
  assert.equal(sheet.name, FLASH_SHEET_NAME); assert.equal(sheet.columnCount, 4);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["CNPJ", "NOME COMPLETO", "CPF", "FLEXIVEL (R$)"]);
  assert.deepEqual([2, 3, 4].map((n) => [sheet.getCell(`A${n}`).value, sheet.getCell(`B${n}`).value]), [["02801028000153", "PESSOA A"], ["04892580000120", "PESSOA B"], ["04892580000120", "PESSOA C"]]);
  assert.equal(sheet.getCell("A2").numFmt, "@"); assert.equal(typeof sheet.getCell("A2").value, "string"); // CNPJ texto com zero à esquerda
  assert.equal(String(sheet.getCell("C2").value).padStart(11, "0"), leadingZero); assert.equal(sheet.getCell("C2").numFmt, '000"."000"."000"-"00'); // CPF: mesma regra do Café
  assert.equal(sheet.getCell("C4").value, null); // sem CPF cadastrado: célula vazia (política do Café)
  assert.deepEqual([2, 3, 4].map((n) => sheet.getCell(`D${n}`).value), [530, 480, 0]); assert.equal(typeof sheet.getCell("D3").value, "number");
  assert.equal(buildFlashRows(map).totalCents, 101000); // Σ FLEXIVEL = Σ alocações = Map = obrigação
  assert.throws(() => buildFlashRows({ ...map, allocations: [alloc("x", "X", "ACME", null, null, "10.00")] }), (error: Error) => error instanceof FlashExportError && /A empresa ACME não possui CNPJ cadastrado/.test(error.message));
  assert.throws(() => buildFlashRows({ ...map, allocations: [...allocations, { ...allocations[0], id: "b2" }] }), /mais de uma vez/);
  assert.throws(() => buildFlashRows({ ...map, totalAmount: "1010.01" }), /Inconsistência na Máscara Flash/);
  assert.throws(() => buildFlashRows({ ...map, financialRecord: null }), /sem obrigação financeira/);
  assert.throws(() => buildFlashRows({ ...map, allocations: [] }), /Não há colaboradores/);
  const [route, cafeRoute, section, view] = await Promise.all([
    readFile(new URL("../src/app/api/accounts-payable/basic-basket/[mapId]/flash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/accounts-payable/breakfast/[mapId]/flash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/basic-basket/BasicBasketSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/basic-basket/ui/BasicBasketAllocationView.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_READ\)/); assert.match(cafeRoute, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_READ\)/); // mesma permissão do Café
  assert.match(route, /basicBasketMap\.findFirst\(\{ where: \{ id: mapId, current: true, cancelledAt: null \}/); assert.match(route, /deletedAt: null/); // só lançamento salvo/vigente
  assert.match(route, /status: 404/); assert.match(route, /status: 422/);
  assert.match(route, /Mascara_Flash_Cesta_Basica_\$\{map\.competence\.year\}-\$\{String\(map\.competence\.month\)\.padStart\(2, "0"\)\}\.xlsx/);
  assert.match(route, /employee: \{ select: \{ cpf: true \} \}/); assert.doesNotMatch(route, /calculateBasicBasketLine|request\.json|searchParams/); // sem cálculo e sem valor vindo do cliente
  assert.match(section, /\/api\/accounts-payable\/basic-basket\/\$\{mapId\}\/flash/); assert.match(view, />Máscara Flash</); assert.match(view, /variant="secondary"[^>]*onClick=\{\(\) => onFlash\(map\.id\)\}/);
});

// ---- Fase 7E.2: snapshot histórico de Centro de Custo e Empresa na Alimentação (MA e PA com 4/4 perspectivas).
test("alimentação: snapshot do rateio — MA usa a empresa padrão do Café no lançamento, PA não grava empresa, CC do cadastro no momento", async () => {
  const { buildFoodRateioSnapshot, loadFoodRateioSnapshots, loadFoodSnapshotCompanies } = await import("../src/modules/accounts-payable/food/rateio-snapshot");
  const companyA = { id: "co-a", legalName: "EMPRESA A LTDA", tradeName: "EMPRESA A" };
  assert.deepEqual(buildFoodRateioSnapshot("MA", { costCenter: "  CC  A " }, companyA), { costCenter: "CC A", companyId: "co-a", company: "EMPRESA A" });
  assert.deepEqual(buildFoodRateioSnapshot("MA", { costCenter: "" }, null), { costCenter: null, companyId: null, company: null }); // sem config/CC: null (vira "Sem ...")
  assert.deepEqual(buildFoodRateioSnapshot("MA", { costCenter: "CC" }, { id: "x", legalName: "RAZÃO", tradeName: null }), { costCenter: "CC", companyId: "x", company: "RAZÃO" });
  assert.deepEqual(buildFoodRateioSnapshot("PA", { costCenter: "CC A" }, companyA), { costCenter: "CC A", companyId: null, company: null }); // PA: empresa vem da NF
  // leitura no servidor numa consulta só (sem N+1), dentro da transação, pela configuração do Café
  let configA = true; const calls: unknown[] = [];
  const tx = { breakfastEmployeeConfig: { findMany: async (args: unknown) => { calls.push(args); return [{ employeeId: "ana", defaultCompany: configA ? companyA : { id: "co-b", legalName: "EMPRESA B", tradeName: null } }]; } } } as never;
  const captured = await loadFoodRateioSnapshots(tx, "MA", [{ id: "ana", costCenter: "CC A" }, { id: "ana", costCenter: "CC A" }, { id: "bia", costCenter: null }]);
  assert.equal(calls.length, 1); assert.deepEqual((calls[0] as { where: { employeeId: { in: string[] } } }).where.employeeId.in, ["ana", "bia"]);
  assert.deepEqual(captured.get("ana"), { costCenter: "CC A", companyId: "co-a", company: "EMPRESA A" }); assert.deepEqual(captured.get("bia"), { costCenter: null, companyId: null, company: null });
  assert.equal((await loadFoodSnapshotCompanies(tx, "PA", ["ana"])).size, 0); assert.equal(calls.length, 1); // PA nem consulta empresa
  // histórico imutável: o cadastro/config muda para Empresa B / CC B DEPOIS do lançamento; o rateio usa o snapshot salvo
  const { buildFoodRateioViewRows } = await import("../src/modules/accounts-payable/food/rateio-views");
  const saved = { employeeId: "ana", normalizedReceivedName: "ana", receivedName: "ANA", officialName: "ANA", receivedDepartment: "ENGENHARIA", confirmedDepartment: "ENGENHARIA", amount: "25.00", included: true, ...captured.get("ana")! };
  configA = false; const employeeNow = { id: "ana", costCenter: "CC B" };
  const recaptured = await loadFoodRateioSnapshots(tx, "MA", [employeeNow]);
  assert.equal(recaptured.get("ana")!.company, "EMPRESA B"); // o cadastro de hoje é outro…
  assert.deepEqual(buildFoodRateioViewRows("MA", [saved]).rows.map((row) => [row.company, row.costCenter]), [["EMPRESA A", "CC A"]]); // …e o rateio continua A/A
  // captura no servidor: finalização (MA e PA), lançamento manual e edição só ao TROCAR o colaborador; nada vem do cliente
  const [ma, manual, contract, views] = await Promise.all(["../src/modules/accounts-payable/food/ma-server.ts", "../src/modules/accounts-payable/food/manual-server.ts", "../src/modules/accounts-payable/food/manual-contract.ts", "../src/modules/accounts-payable/food/rateio-views.ts"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(ma, /\.\.\.buildFoodRateioSnapshot\(batch\.locality, employee, snapshotCompanies\.get\(employee\.id\)\),\s+validationStatus: "CONFIRMED"/); // finalização
  assert.match(ma, /\.\.\.\(occurrence\.employeeId !== employee\.id \? buildFoodRateioSnapshot\(batch\.locality, employee, snapshotCompanies\.get\(employee\.id\)\) : \{\}\)/); // edição
  assert.match(manual, /loadFoodRateioSnapshots\(tx, input\.locality, accepted\.map\(\(\{ employee \}\) => employee\)\)/);
  for (const source of [ma, manual, contract]) assert.doesNotMatch(source, /(input|edit|resolution|item)\.(costCenter|companyId|company)\b/);
  assert.doesNotMatch(views, /foodEmployee|breakfastEmployeeConfig|prisma/); // o rateio nunca consulta cadastro atual
});

test("alimentação: 4/4 perspectivas em MA e PA — snapshots, Empresa PA pela NF, legado em 'Sem ...' e totais iguais", async () => {
  const { buildFoodRateioViewRows } = await import("../src/modules/accounts-payable/food/rateio-views");
  const { buildAllocationViews, normalizeAllocationRow, ALLOCATION_EMPTY_COMPANY, ALLOCATION_EMPTY_COST_CENTER } = await import("../src/modules/accounts-payable/shared/allocation-views");
  const meal = (employeeId: string, department: string, amount: string, extra: Record<string, unknown> = {}) => ({ employeeId, normalizedReceivedName: employeeId, receivedName: employeeId.toUpperCase(), officialName: employeeId.toUpperCase(), receivedDepartment: department, confirmedDepartment: department, mealQuantity: 1, amount, included: true, ...extra });
  const flat = (nodes: Array<{ label: string; cents: number; children: unknown[] }>): unknown => nodes.map((node) => [node.label, node.cents, ...(node.children.length ? [flat(node.children as typeof nodes)] : [])]);
  const viewsOf = (locality: string, meals: Parameters<typeof buildFoodRateioViewRows>[1]) => { const base = buildFoodRateioViewRows(locality, meals); return { base, views: buildAllocationViews(base.rows.map((row) => normalizeAllocationRow({ ...row, source: row }))) }; };
  // MA: 2 empresas (snapshot), 2 CCs, 2 departamentos, 1 refeição legada (sem snapshot) e 1 excluída (fora do total)
  const ma = viewsOf("MA", [
    meal("ana", "ENGENHARIA", "25.00", { companyId: "a", company: "EMPRESA A", costCenter: "CC A" }), meal("ana", "ENGENHARIA", "25.00", { companyId: "a", company: "EMPRESA A", costCenter: "CC A" }),
    meal("bia", "ADMINISTRATIVO", "25.00", { companyId: "b", company: "EMPRESA B", costCenter: "CC B" }),
    meal("caio", "ENGENHARIA", "25.00", { companyId: "b", company: "EMPRESA B", costCenter: "CC A" }),
    meal("duda", "ADMINISTRATIVO", "25.00"), // anterior à migration: companyId/company/costCenter ausentes
    meal("eva", "ADMINISTRATIVO", "99.00", { included: false, companyId: "a", company: "EMPRESA A", costCenter: "CC A" }),
  ]);
  assert.equal(ma.base.totalCents, 12500); assert.equal(ma.base.legacyCompany, 1); assert.equal(ma.base.legacyCostCenter, 1);
  assert.deepEqual(ma.base.rows.find((row) => row.employeeId === "ana"), { id: "ana|a|CC A|ENGENHARIA", employeeId: "ana", employeeName: "ANA", companyId: "a", company: "EMPRESA A", costCenter: "CC A", department: "ENGENHARIA", meals: 2, cents: 5000, invoiceEmission: null });
  assert.deepEqual(flat(ma.views.department!.nodes), [["ADMINISTRATIVO", 5000], ["ENGENHARIA", 7500]]);
  assert.deepEqual(flat(ma.views.costCenter!.nodes), [["CC A", 7500], ["CC B", 2500], [ALLOCATION_EMPTY_COST_CENTER, 2500]]);
  assert.deepEqual(flat(ma.views.companyDepartment!.nodes), [["EMPRESA A", 5000, [["ENGENHARIA", 5000]]], ["EMPRESA B", 5000, [["ADMINISTRATIVO", 2500], ["ENGENHARIA", 2500]]], [ALLOCATION_EMPTY_COMPANY, 2500, [["ADMINISTRATIVO", 2500]]]]);
  assert.deepEqual(flat(ma.views.companyCostCenterDepartment!.nodes), [
    ["EMPRESA A", 5000, [["CC A", 5000, [["ENGENHARIA", 5000]]]]],
    ["EMPRESA B", 5000, [["CC A", 2500, [["ENGENHARIA", 2500]]], ["CC B", 2500, [["ADMINISTRATIVO", 2500]]]]],
    [ALLOCATION_EMPTY_COMPANY, 2500, [[ALLOCATION_EMPTY_COST_CENTER, 2500, [["ADMINISTRATIVO", 2500]]]]], // legado: Sem empresa → Sem CC → Depto
  ]);
  for (const tree of Object.values(ma.views)) { assert.equal(tree!.totalCents, 12500); assert.equal(tree!.consistent, true); }
  // PA: Empresa SEMPRE pela Emissão NF salva — um companyId/company na refeição (ex.: cadastro/config mudou) é ignorado
  const pa = viewsOf("PA", [
    meal("ana", "ENGENHARIA", "12.50", { invoiceEmission: "NF 01", costCenter: "CC A", companyId: "outra", company: "OUTRA EMPRESA" }),
    meal("bia", "ADMINISTRATIVO", "12.50", { invoiceEmission: "nf-02", costCenter: "CC B" }),
    meal("caio", "ADMINISTRATIVO", "12.50", { invoiceEmission: "NF 02" }), // legado sem CC
  ]);
  assert.deepEqual(flat(pa.views.companyCostCenterDepartment!.nodes), [["BOINGA", 1250, [["CC A", 1250, [["ENGENHARIA", 1250]]]]], ["PROJETA", 2500, [["CC B", 1250, [["ADMINISTRATIVO", 1250]]], [ALLOCATION_EMPTY_COST_CENTER, 1250, [["ADMINISTRATIVO", 1250]]]]]]);
  assert.equal(pa.base.rows.find((row) => row.employeeId === "bia")!.invoiceEmission, "NF 02"); assert.equal(pa.base.legacyCompany, 0);
  for (const tree of Object.values(pa.views)) { assert.equal(tree!.totalCents, 3750); assert.equal(tree!.consistent, true); }
  // UI: as 4 perspectivas habilitadas (sem "indisponível") e aviso discreto para legado; payload normalizado vindo do servidor
  const [page, server] = await Promise.all([readFile(new URL("../src/app/pagamentos/alimentacao/page.tsx", import.meta.url), "utf8"), readFile(new URL("../src/modules/accounts-payable/food/server.ts", import.meta.url), "utf8")]);
  assert.doesNotMatch(page, /availableViews|indisponíve/); assert.match(page, /Alguns lançamentos anteriores à captura histórica de/);
  assert.match(server, /rateioViews: rateioViewsByBatch\.get\(batch\.id\) \?\? null/); assert.match(server, /costCenter: true, companyId: true, company: true/);
});

test("alimentação: migration aditiva (nullable, sem backfill) e schema com snapshot de rateio em FoodMealOccurrence", async () => {
  const [migration, schema] = await Promise.all([readFile(new URL("../prisma/migrations/20261008090000_food_meal_occurrence_rateio_snapshot/migration.sql", import.meta.url), "utf8"), readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8")]);
  const sql = migration.replace(/^--.*$/gm, "");
  assert.match(sql, /ALTER TABLE "FoodMealOccurrence" ADD COLUMN "costCenter" TEXT,\s*ADD COLUMN "companyId" TEXT,\s*ADD COLUMN "company" TEXT;/);
  assert.doesNotMatch(sql, /NOT NULL|^\s*UPDATE\b|\bDROP\b|DELETE FROM|CREATE INDEX/im); // aditiva, sem backfill, sem índice novo
  const model = schema.slice(schema.indexOf("model FoodMealOccurrence {"), schema.indexOf("}", schema.indexOf("model FoodMealOccurrence {")));
  for (const field of [/costCenter\s+String\?/, /companyId\s+String\?/, /company\s+String\?/, /companyRef\s+Company\?/]) assert.match(model, field);
});

// ---- Fase 7E.3: Férias manuais + revisão/aprovação por ocorrência do Espelho de Ponto (Cesta Básica).
test("cesta básica 7E.3: Férias manuais — null usa o Espelho aprovado, valor substitui (nunca soma), zero é override, limites e direito", async () => {
  const { buildBasicBasketContext, calculateBasicBasketLine } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const { applyManualVacation, buildPointMirrorCandidates, parseManualVacationDays, resolveReviewedBasicBasketAdjustments } = await import("../src/modules/accounts-payable/basic-basket/point-mirror-review");
  const context = buildBasicBasketContext(2026, 10);
  const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `2026-10-${String(from + index).padStart(2, "0")}`);
  const occurrences = { absenceDates: [], currentVacationDates: days(1, 8), referenceVacationDates: [] }; // Espelho: 8 dias
  const candidates = buildPointMirrorCandidates({ importId: "imp", context, employeeId: "ana", admissionDate: "2020-01-01", occurrences });
  const approved = new Set(candidates.map((candidate) => candidate.id));
  const resolve = (manualVacationDays: number | null) => resolveReviewedBasicBasketAdjustments({ context, admissionDate: "2020-01-01", occurrences, candidates, approved, manualVacationDays });
  assert.equal(resolve(null).adjustments.currentVacationDays, 8); // null → Espelho aprovado
  assert.deepEqual([resolve(10).adjustments.currentVacationDays, resolve(10).importedVacationDays], [10, 8]); // manual 10 + Espelho 8 → 10 (NÃO 18); importado registrado
  assert.equal(resolve(0).adjustments.currentVacationDays, 0); // zero = override explícito, não volta ao Espelho
  assert.equal(resolve(null).adjustments.currentVacationDays, 8); // limpar → volta ao Espelho
  assert.deepEqual(applyManualVacation({ currentVacationDays: 3, currentUnjustifiedAbsence: true, retroactiveVacationDays: 2, retroactiveUnjustifiedAbsence: false }, 10), { currentVacationDays: 10, currentUnjustifiedAbsence: true, retroactiveVacationDays: 2, retroactiveUnjustifiedAbsence: false }); // Retroativo/Falta intactos
  // cálculo visual do exemplo: mensal R$ 400,00 · Férias 10 · Cesta paga 20/30 = R$ 266,67
  assert.deepEqual((({ currentPayableDays, payableBasketCents }) => [currentPayableDays, payableBasketCents])(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 40000, currentBasketDays: 30, retroactiveDays: 0, adjustments: resolve(10).adjustments })), [20, 26667]);
  // faixa: inteiro 0..30; vazio = null; acima do direito BLOQUEIA (sem clamp)
  assert.equal(parseManualVacationDays(""), null); assert.equal(parseManualVacationDays(null), null); assert.equal(parseManualVacationDays("0"), 0); assert.equal(parseManualVacationDays(30), 30);
  for (const invalid of [-1, 31, 1.5, "1.5", "abc", "-2", Number.NaN]) assert.throws(() => parseManualVacationDays(invalid), /inteiro de 0 a 30/);
  assert.throws(() => parseManualVacationDays(15, 11), /O colaborador possui apenas 11 dias financeiros elegíveis nesta competência\./);
  assert.equal(parseManualVacationDays(11, 11), 11);
  // servidor: valida a faixa ao interpretar o insumo e bloqueia acima dos dias de direito; correção usa o snapshot
  const server = await readFile(new URL("../src/modules/accounts-payable/basic-basket/server.ts", import.meta.url), "utf8");
  assert.match(server, /manualVacationDays: parseManualVacationDays\(entry\.manualVacationDays\)/);
  assert.match(server, /vacation\.manualVacationDays > current\.currentBasketDays\) throw new BasicBasketValidationError/);
  // correção (Fase 7E.4): manual corrigível; omitido → mantém o do original; importado sempre do snapshot
  assert.match(server, /const manualVacationDays = correctionManualVacationDays\(input\.entry\.manualVacationDays, entry\.manualVacationDays, original\.manualVacationDays\);/);
  assert.match(server, /manualVacationDays: vacation\.manualVacationDays, importedVacationDays: vacation\.importedVacationDays/); // histórico: manual × importado × efetivo
  assert.doesNotMatch(server, /basicBasketEmployeeConfig\.upsert\([^)]*manualVacation/); // não vira padrão do colaborador
});

test("cesta básica 7E.3: revisão por ocorrência — pendentes bloqueiam, só aprovadas entram, Falta independe do manual, tampering e reimportação", async () => {
  const { buildBasicBasketContext, calculateBasicBasketLine } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const review = await import("../src/modules/accounts-payable/basic-basket/point-mirror-review");
  const { buildPointMirrorCandidates, isPointMirrorCandidateActionable, pointMirrorCandidateId, resolveReviewedBasicBasketAdjustments, summarizePointMirrorReview, validatePointMirrorDecisions } = review;
  const context = buildBasicBasketContext(2026, 10); // apuração da Falta = 09/2026
  // Férias válida (01/10), Falta válida (10/09 → corta 10/2026) e Falta do próprio mês (05/10 → afeta a próxima: IGNORADA)
  const occurrences = { absenceDates: ["2026-09-10", "2026-10-05"], currentVacationDates: ["2026-10-01"], referenceVacationDates: [] };
  const candidates = buildPointMirrorCandidates({ importId: "imp-a", context, employeeId: "ana", admissionDate: "2020-01-01", occurrences });
  const vacation = candidates.find((candidate) => candidate.kind === "VACATION_CURRENT")!, absence = candidates.find((candidate) => candidate.date === "2026-09-10")!, ignored = candidates.find((candidate) => candidate.date === "2026-10-05")!;
  assert.equal(vacation.id, pointMirrorCandidateId("imp-a", "ana", "VACATION_CURRENT", "2026-10-01")); // id determinístico (sem CPF/índice)
  assert.deepEqual(absence.effects, ["CURRENT_CUT"]); assert.equal(ignored.ignoredReason, "Afeta a próxima competência");
  const summary = (decisions: Record<string, "APPROVED" | "REJECTED">) => (({ PENDING, APPROVED, REJECTED, IGNORED }) => ({ PENDING, APPROVED, REJECTED, IGNORED }))(summarizePointMirrorReview(candidates, decisions, {}));
  const validate = (approvedIds: string[], rejectedIds: string[], manual: number | null = null) => validatePointMirrorDecisions({ candidates, approvedIds, rejectedIds, employeeIds: ["ana"], manualByEmployee: { ana: manual } });
  assert.deepEqual(summary({}), { PENDING: 2, APPROVED: 0, REJECTED: 0, IGNORED: 1 }); assert.throws(() => validate([], []), /2 pendentes/); // aplicação bloqueada
  assert.deepEqual(summary({ [vacation.id]: "APPROVED" }), { PENDING: 1, APPROVED: 1, REJECTED: 0, IGNORED: 1 }); assert.throws(() => validate([vacation.id], []), /1 pendente/);
  assert.deepEqual(summary({ [vacation.id]: "APPROVED", [absence.id]: "REJECTED" }), { PENDING: 0, APPROVED: 1, REJECTED: 1, IGNORED: 1 });
  const approved = validate([vacation.id], [absence.id]); // liberado
  const resolved = resolveReviewedBasicBasketAdjustments({ context, admissionDate: "2020-01-01", occurrences, candidates, approved, manualVacationDays: null }).adjustments;
  assert.deepEqual(resolved, { currentVacationDays: 1, currentUnjustifiedAbsence: false, retroactiveVacationDays: 0, retroactiveUnjustifiedAbsence: false }); // Férias aprovada entra; Falta rejeitada e ignorada não
  // Falta aprovada + Férias manuais 10: Cesta cortada pela Falta e as 10 Férias continuam registradas (auditoria)
  const withAbsence = resolveReviewedBasicBasketAdjustments({ context, admissionDate: "2020-01-01", occurrences, candidates, approved: validate([absence.id], [], 10), manualVacationDays: 10 }).adjustments;
  assert.deepEqual([withAbsence.currentUnjustifiedAbsence, withAbsence.currentVacationDays], [true, 10]);
  assert.equal(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 40000, currentBasketDays: 30, retroactiveDays: 0, adjustments: withAbsence }).payableBasketCents, 0);
  // manual informado: Férias importadas da competência ficam sem efeito (não bloqueiam); a Falta segue exigindo decisão
  assert.equal(isPointMirrorCandidateActionable(vacation, 10), false); assert.equal(isPointMirrorCandidateActionable(absence, 10), true);
  assert.throws(() => validate([], [], 10), /1 pendente/); assert.doesNotThrow(() => validate([], [absence.id], 10));
  assert.equal(isPointMirrorCandidateActionable(vacation, null), true); // limpar o manual → Férias voltam a exigir decisão
  // tampering: id inexistente, alterado (outra data), de outra importação/competência, conflito → rejeitado pelo servidor
  for (const forged of [["nao-existe"], [pointMirrorCandidateId("imp-a", "ana", "VACATION_CURRENT", "2026-10-02")], [pointMirrorCandidateId("imp-b", "ana", "VACATION_CURRENT", "2026-10-01")], [pointMirrorCandidateId("imp-a", "outro", "ABSENCE", "2026-09-10")]])
    assert.throws(() => validate([...forged, absence.id, vacation.id], []), /não pertence a esta importação/);
  assert.throws(() => validate([vacation.id, absence.id], [absence.id]), /aprovada e rejeitada/);
  assert.throws(() => validatePointMirrorDecisions({ candidates, approvedIds: "tudo", rejectedIds: [], employeeIds: ["ana"], manualByEmployee: {} }), /inválida/);
  // reimportação: a importação B gera ids novos; decisões da A não são reaproveitadas
  const reimport = buildPointMirrorCandidates({ importId: "imp-b", context, employeeId: "ana", admissionDate: "2020-01-01", occurrences });
  assert.throws(() => validatePointMirrorDecisions({ candidates: reimport, approvedIds: [vacation.id], rejectedIds: [absence.id], employeeIds: ["ana"], manualByEmployee: {} }), /não pertence a esta importação/);
  // admissão: ocorrência anterior à admissão é ignorada (não exige decisão)
  const late = buildPointMirrorCandidates({ importId: "imp-a", context, employeeId: "bia", admissionDate: "2026-10-05", occurrences: { absenceDates: ["2026-09-10"], currentVacationDates: ["2026-10-01", "2026-10-06"], referenceVacationDates: [] } });
  assert.deepEqual(late.map((candidate) => [candidate.date, candidate.ignoredReason]), [["2026-09-10", "Ocorrência anterior à admissão — ignorada"], ["2026-10-01", "Anterior à admissão — não reduz"], ["2026-10-06", null]]);
});

test("cesta básica 7E.3: blocos de Férias e fevereiro recalculados SÓ sobre as datas aprovadas; fluxo da tela e do servidor", async () => {
  const { buildBasicBasketContext } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const { buildPointMirrorCandidates, resolveReviewedBasicBasketAdjustments } = await import("../src/modules/accounts-payable/basic-basket/point-mirror-review");
  const run = (year: number, month: number, dates: string[], reject: string[]) => {
    const context = buildBasicBasketContext(year, month), occurrences = { absenceDates: [], currentVacationDates: dates, referenceVacationDates: [] };
    const candidates = buildPointMirrorCandidates({ importId: "i", context, employeeId: "e", admissionDate: "2020-01-01", occurrences });
    return resolveReviewedBasicBasketAdjustments({ context, admissionDate: "2020-01-01", occurrences, candidates, approved: new Set(candidates.filter((candidate) => !reject.includes(candidate.date)).map((candidate) => candidate.id)), manualVacationDays: null }).adjustments.currentVacationDays;
  };
  const october = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  assert.equal(run(2026, 10, october, []), 5); assert.equal(run(2026, 10, october, ["2026-10-03"]), 4); // rejeitar o meio do bloco: 2 blocos
  assert.equal(run(2026, 10, ["2026-10-30", "2026-10-31"], []), 1); // dia 31 → 30 (mesmo dia financeiro)
  assert.equal(run(2027, 2, ["2027-02-27", "2027-02-28"], []), 4); // fevereiro: bloco que alcança o último dia vai até o dia 30
  assert.equal(run(2027, 2, ["2027-02-27", "2027-02-28"], ["2027-02-27"]), 1); // aprovado só o dia isolado 28: não estende
  // tela + servidor: processar não aplica; Revisar → Aplicar via servidor (só ids); salvar exige a revisão; "Remover
  // ajustes do Espelho" não apaga Férias manuais; prévia devolve candidatos e datas sem CPF
  const [section, server, pm, route, flow, ui] = await Promise.all(["../src/modules/accounts-payable/basic-basket/BasicBasketSection.tsx", "../src/modules/accounts-payable/basic-basket/server.ts", "../src/modules/accounts-payable/basic-basket/point-mirror-server.ts", "../src/app/api/accounts-payable/basic-basket/point-mirror/review/route.ts", "../src/components/ui/ImportFlow.tsx", "../src/modules/accounts-payable/basic-basket/ui/BasicBasketPointMirror.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(section, /setPointPreview\(\{ \.\.\.\(body as PointMirrorPreview\), competence \}\); setDecisions\(\{\}\); setReviewing\(false\)/); // nova importação = nova revisão
  assert.match(section, /post\("\/api\/accounts-payable\/basic-basket\/point-mirror\/review", "POST", \{ importId: pointPreview\.importId, year, month, employeeIds: selectedIds, approvedIds, rejectedIds, manualVacationDays: manualByEmployee \}\)/);
  assert.match(section, /onRemoveAdjustments=\{\(\) => setApplied\(null\)\}/); // remove só o Espelho; manualVacation vive em `values`
  assert.match(section, /canApply=\{reviewPending === 0\}/); assert.match(section, /&& !appliedPending\)/);
  assert.match(section, /inputMode="numeric" min=\{0\} max=\{BASIC_BASKET_CALCULATION_DAYS\} step=\{1\}/); assert.match(section, /Deixe vazio para usar o Espelho de Ponto/);
  assert.match(server, /if \(!input\.pointMirrorReview\) throw new BasicBasketValidationError\("Revise e aplique as ocorrências do Espelho de Ponto antes de salvar\."\)/);
  assert.match(server, /record\.createdByUserId !== input\.userId \|\| record\.year !== input\.year \|\| record\.month !== input\.month/); // dono e competência preservados
  assert.match(pm, /candidates,\s+occurrences: stored,/); assert.doesNotMatch(pm, /cpf: person\.cpf|cpf: employee/);
  assert.match(route, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_CREATE\)/); assert.doesNotMatch(route, /VacationDays\s*[:=]\s*body\.(?!manualVacationDays)/);
  assert.match(flow, /IMPORT_FLOW_REVIEW_STEPS/); assert.match(ui, /Remover ajustes do Espelho/);
});

// ---- Fase 7E.4: correção histórica das Férias manuais da Cesta (replacement; importado e Falta do snapshot).
test("cesta básica 7E.4: correção das Férias manuais — 10→12, limpar volta ao importado, zero, limites, Falta preservada", async () => {
  const { calculateBasicBasketLine } = await import("../src/modules/accounts-payable/basic-basket/calculations");
  const { correctionAdjustments, historicalImportedVacationDays, parseManualVacationDays } = await import("../src/modules/accounts-payable/basic-basket/point-mirror-review");
  const original = { currentVacationDays: 10, currentUnjustifiedAbsence: false, retroactiveVacationDays: 2, retroactiveUnjustifiedAbsence: false, manualVacationDays: 10, importedVacationDays: 8 };
  const frozen = JSON.stringify(original);
  // A. 10 → 12: importado preservado (8), manual 12, efetivo 12; Retroativo do snapshot
  assert.deepEqual(correctionAdjustments(original, 12), { currentVacationDays: 12, currentUnjustifiedAbsence: false, retroactiveVacationDays: 2, retroactiveUnjustifiedAbsence: false });
  assert.equal(historicalImportedVacationDays(original), 8);
  // B. limpar → efetivo = importado do lançamento (8), nunca um Espelho novo
  assert.equal(correctionAdjustments(original, null).currentVacationDays, 8);
  // C. zero → override zero (não volta ao importado)
  assert.equal(correctionAdjustments(original, 0).currentVacationDays, 0);
  // D/E. mesmas validações do lançamento: acima do direito e decimal bloqueiam (sem truncar)
  assert.throws(() => parseManualVacationDays(15, 11), /possui apenas 11 dias financeiros elegíveis/);
  for (const invalid of ["1.5", 1.5, -1, 31]) assert.throws(() => parseManualVacationDays(invalid, 30), /inteiro de 0 a 30/);
  // F. Falta histórica + correção manual 12: Cesta segue cortada; 12 dias registrados para auditoria
  const withAbsence = correctionAdjustments({ ...original, currentUnjustifiedAbsence: true }, 12);
  assert.deepEqual([withAbsence.currentUnjustifiedAbsence, withAbsence.currentVacationDays], [true, 12]);
  assert.equal(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 40000, currentBasketDays: 30, retroactiveDays: 0, adjustments: withAbsence }).payableBasketCents, 0);
  // lançamento anterior à 7E.3 (sem importado/manual registrados): as Férias efetivas vieram do Espelho
  const legacy = { currentVacationDays: 5, currentUnjustifiedAbsence: false, retroactiveVacationDays: 0, retroactiveUnjustifiedAbsence: false, manualVacationDays: null, importedVacationDays: null };
  assert.equal(historicalImportedVacationDays(legacy), 5); assert.equal(correctionAdjustments(legacy, null).currentVacationDays, 5); assert.equal(correctionAdjustments(legacy, 7).currentVacationDays, 7);
  assert.equal(historicalImportedVacationDays({ ...legacy, currentVacationDays: 4, manualVacationDays: 4 }), 0); // tinha só manual, sem importação
  assert.equal(JSON.stringify(original), frozen); // H (puro): o original não é alterado
  // semântica final do campo na correção: omitido (undefined) preserva o original; null limpa; 0 e N são overrides
  const { correctionManualVacationDays } = await import("../src/modules/accounts-payable/basic-basket/point-mirror-review");
  assert.equal(correctionManualVacationDays(undefined, null, 10), 10);
  assert.equal(correctionManualVacationDays(null, null, 10), null); assert.equal(correctionAdjustments(original, correctionManualVacationDays(null, null, 10)).currentVacationDays, 8);
  assert.equal(correctionManualVacationDays(0, 0, 10), 0); assert.equal(correctionAdjustments(original, 0).currentVacationDays, 0);
  assert.equal(correctionManualVacationDays(12, 12, 10), 12);
  assert.equal(correctionManualVacationDays(undefined, null, null), null); // omitido em lançamento sem manual: segue sem manual
});

test("cesta básica 7E.4: servidor corrige só o manual — importado/efetivo/Falta/valor do cliente ignorados; original preservado + replacement", async () => {
  const [server, route, section] = await Promise.all(["../src/modules/accounts-payable/basic-basket/server.ts", "../src/app/api/accounts-payable/basic-basket/[mapId]/entries/[allocationId]/route.ts", "../src/modules/accounts-payable/basic-basket/BasicBasketSection.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const correction = server.slice(server.indexOf("export async function correctBasicBasketEntry"), server.indexOf("}, { isolationLevel", server.indexOf("export async function correctBasicBasketEntry")));
  // manual: único campo de Férias aceito; omitido mantém o original; validação de faixa (parseEntry) e de direito (computeRow)
  assert.match(server, /manualVacationDays: parseManualVacationDays\(entry\.manualVacationDays\)/);
  assert.match(correction, /const corrected = \{ \.\.\.adjustments, \.\.\.correctionAdjustments\(\{ \.\.\.adjustments, manualVacationDays: original\.manualVacationDays, importedVacationDays: original\.importedVacationDays \}, manualVacationDays\) \};/);
  assert.match(correction, /computeRow\(\{ \.\.\.entry, manualVacationDays \}, snapshot, company, basicBasketContextFromPayments\(isoDay\(map\.previousPaymentDate\), isoDay\(map\.paymentDate\)\), corrected, original\.pointMirrorImportId, \{ manualVacationDays, importedVacationDays: original\.importedVacationDays \}\)/);
  assert.match(server, /vacation\.manualVacationDays > current\.currentBasketDays\) throw new BasicBasketValidationError/);
  // G. o cliente não é autoridade sobre importado/efetivo/Falta/valor nem reabre o Espelho
  assert.doesNotMatch(correction, /entry\.(importedVacationDays|currentVacationDays|currentUnjustifiedAbsence|amount|basketAmount\b(?!\s*:))|pointMirrorReview|loadPointMirrorImport|buildPointMirrorCandidates|foodEmployee\.find/);
  assert.match(correction, /currentUnjustifiedAbsence: original\.currentUnjustifiedAbsence, retroactiveVacationDays: original\.retroactiveVacationDays/);
  assert.doesNotMatch(route, /importedVacationDays|currentVacationDays|absence/i);
  // H. original intacto (só cancelamento lógico com motivo) + replacement novo
  assert.match(correction, /const replacement = await tx\.basicBasketAllocation\.create\(\{ data: \{ \.\.\.row,/);
  assert.match(correction, /tx\.basicBasketAllocation\.update\(\{ where: \{ id: original\.id \}, data: \{ deletedAt: new Date\(\), deletedByUserId: input\.userId, deletionReason:/);
  // tela: importado só leitura (CalculatedValue), manual editável/limpável, efetivo calculado; envia só o manual
  assert.match(section, /<CalculatedValue label="Espelho de Ponto" value=\{`\$\{historicalImportedVacationDays\(row\)\}/);
  assert.match(section, /<Field label="Férias manuais \(dias\)" helper="Deixe vazio para voltar a utilizar os dias aprovados do Espelho de Ponto\."/);
  assert.match(section, /<CalculatedValue label="Férias utilizadas" live/); assert.match(section, /aria-label="Limpar Férias manuais"/);
  assert.match(section, /observation: form\.observation, manualVacationDays: manual\.value \} \}\)/);
  assert.doesNotMatch(section, /importedVacationDays: form\.|currentVacationDays: form\./);
  // Dialog da foundation: só o corpo rola (sr-only/absolutos não estendem o <dialog>; sem barra dupla nem vazio no mobile)
  const dialog = await readFile(new URL("../src/components/ui/Dialog.tsx", import.meta.url), "utf8");
  assert.match(dialog, /m-auto w-\[calc\(100%-2rem\)\] overflow-hidden rounded-modal/); assert.match(dialog, /"relative min-h-0 flex-1 overflow-y-auto/);
});

// ---- Fase 7F: Café da Manhã no Design System (só apresentação; regras e chamadas seguem na seção).
test("café da manhã 7F: apresentação no Design System, regras na seção e componentes visuais sem cálculo", async () => {
  const base = "../src/modules/accounts-payable/breakfast/";
  const [section, fill, mirror, view, summary] = await Promise.all(["BreakfastSection.tsx", "ui/BreakfastFillTable.tsx", "ui/BreakfastPointMirror.tsx", "ui/BreakfastAllocationView.tsx", "ui/BreakfastSummaryView.tsx"].map((path) => readFile(new URL(base + path, import.meta.url), "utf8")));
  // estrutura: Tabs da foundation, Dialog na correção, componentes visuais extraídos
  assert.match(section, /<Tabs label="Etapas do Café da Manhã" items=\{STAGES\}/); assert.match(section, /<Dialog\s/); assert.doesNotMatch(section, /modal-box|role="tablist"|<table/);
  for (const name of ["BreakfastFillTable", "BreakfastPointMirror", "BreakfastAllocationView", "BreakfastSummaryView"]) assert.match(section, new RegExp(`<${name}\\s`), name);
  // regras e payloads continuam na seção (Quantidade Final = base + extras − desconto; Total = final × valor unitário)
  assert.match(section, /calculateFinalQuantity\(baseDays, Number\(value\.extra\), Number\(value\.discount\)\)/); assert.match(section, /calculateBreakfastEmployeeTotal\(priceCents, finalQuantity\)/);
  assert.match(section, /entries = selectedIds\.map\(\(id\) => \{ const value = values\[id\]; return \{ employeeId: id, companyId: value\.companyId, extraQuantity: Number\(value\.extra\), discountQuantity: Number\(value\.discount\)/);
  assert.match(section, /method: "PATCH"/); assert.match(section, /fixedDepartment=\{BREAKFAST_ALLOWED_DEPARTMENT\}/);
  // componentes visuais: sem cálculo, sem fetch, sem tokens crus de cor/hex nem title=
  for (const [name, source] of Object.entries({ fill, mirror, view, summary })) {
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /calculateFinalQuantity|calculateBreakfastEmployeeTotal|parseUnitPriceToCents|fetch\(/, name);
    // title= de elemento HTML (tooltip nativo); title de componente (Card/ImportFlow/FeedbackAlert) é cabeçalho
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange|red)-\d|#[0-9a-fA-F]{3,6}\b|<[a-z][a-z0-9]*\s[^>]*\btitle=/, name);
  }
  assert.doesNotMatch(section, /\b(emerald|amber|slate|orange|red)-\d|title=\{/);
  // Espelho do Café: 5 etapas (sem Revisar), CSV/XLSX até 10 MB, aplicar só por clique
  assert.doesNotMatch(mirror, /\sreview=|onReview/); assert.match(mirror, /accept=".csv,.xlsx"/); assert.match(mirror, /maxSize=\{MAX_POINT_MIRROR_FILE_SIZE\}/);
  // Rateio: quatro perspectivas compartilhadas, padrão Empresa/Departamento, Corrigir só em linhas calculadas
  assert.match(view, /<AllocationViews/); assert.match(view, /useState<AllocationViewId>\("companyDepartment"\)/); assert.match(view, /rowActions=\{\(row\) => row\.finalQuantity !== null &&/);
  assert.match(view, /expectedCents=\{amountToCents\(map\.totalAmount\)\}/);
  // Resumo: Empresa → Centro de Custo (não é perspectiva do Rateio)
  assert.match(summary, /caption="Resumo por Empresa e Centro de Custo"/); assert.doesNotMatch(summary, /AllocationViews/);
});

// ---- Fase 7G: Vale Transporte no Design System + limpeza dos compartilhados de competência (só apresentação).
test("vale transporte 7G: apresentação no Design System, regras na página e componentes visuais sem cálculo", async () => {
  const base = "../src/modules/accounts-payable/transit-voucher/ui/";
  const [page, fill, view, summary] = await Promise.all(["../src/app/pagamentos/vale-transporte/page.tsx", base + "TransitFillTable.tsx", base + "TransitAllocationView.tsx", base + "TransitSummaryView.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(page, /<Tabs label="Etapas do Vale Transporte" items=\{STAGES\}/); assert.match(page, /<Dialog\s/); assert.match(page, /<CurrencyInput/); assert.doesNotMatch(page, /modal-box|role="tablist"|<table|ManualEntrySection|MetricCard|AllocationCard/);
  // regras e payloads continuam na página: Passagens a Receber = dias úteis + diferença − descontos; total = tarifa × passagem/dia × a receber
  assert.match(page, /calculatePassagesToReceive\(baseDays, Number\(value\.diff\), Number\(value\.discount\)\)/); assert.match(page, /calculateTransitVoucherEmployeeTotal\(fareCents, Number\(value\.qty\), passages\)/);
  assert.match(page, /dailyPassageQuantity: Number\(value\.qty\), previousPassageDifference: Number\(value\.diff\), passageDiscount: Number\(value\.discount\)/); assert.match(page, /method: "PATCH"/);
  // tarifa: o mesmo texto com 2 casas vai ao servidor (que valida com parseFareToCents)
  assert.match(page, /fareUnitPrice: fareInput/); assert.match(page, /value\.toFixed\(2\)/);
  for (const [name, source] of Object.entries({ fill, view, summary })) {
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /calculatePassagesToReceive|calculateTransitVoucherEmployeeTotal|parseFareToCents|fetch\(/, name);
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange|red)-\d|#[0-9a-fA-F]{3,6}\b|<[a-z][a-z0-9]*\s[^>]*\btitle=|[↳☑☐✓⚠⌕]/, name);
    assert.doesNotMatch(source, /basic-basket\/ui/, name); // VT nunca depende da Cesta
  }
  // Rateio: perspectivas compartilhadas sobre os snapshots do lançamento (empresa, CC, departamento), padrão Empresa/Departamento
  assert.match(view, /<AllocationViews/); assert.match(view, /useState<AllocationViewId>\("companyDepartment"\)/);
  assert.match(view, /costCenter: row\.costCenter, department: row\.department/); assert.doesNotMatch(view, /collaborators|foodEmployee|\/api\/collaborators/);
  assert.match(view, /row\.passagesToReceive !== null && <Button/); assert.match(view, /onDeleteRecord\(map\.id, row\.id\)/);
  // Resumo segue Empresa → Departamento (não é perspectiva do Rateio)
  assert.match(summary, /caption="Resumo por Empresa e Departamento"/); assert.doesNotMatch(summary, /AllocationViews/);
});

test("compartilhados 7G: calendário, feriado, empresa e combobox no Design System, mesma API", async () => {
  const [holidays, company, combo, summary, parts] = await Promise.all(["../src/components/allocation/CompetenceHolidays.tsx", "../src/components/allocation/CompanyPicker.tsx", "../src/components/CollaboratorMultiCombobox.tsx", "../src/modules/accounts-payable/shared/ui/CompetenceSummary.tsx", "../src/modules/accounts-payable/shared/ui/parts.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const [name, source] of Object.entries({ holidays, company, combo, summary, parts })) {
    // title= de elemento HTML (tooltip nativo); title de componente (Dialog) é cabeçalho
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange)-\d|<[a-z][a-z0-9]*\s[^>]*\btitle=|modal-box|className="modal"|[☑☐✓⚠⌕↳]/, name);
  }
  // calendário: mesma grade (buildCompetenceCalendar), mesmo onSelect, estado por texto acessível e legenda
  assert.match(holidays, /buildCompetenceCalendar\(year, month, holidays\.map\(\(holiday\) => holiday\.date\)\)/); assert.match(holidays, /onClick=\{\(\) => onSelect\(day\.date\)\}/);
  assert.match(holidays, /aria-label=\{`\$\{day\.day\}: /); assert.match(holidays, /aria-label="Legenda"/);
  // modais sobre o Dialog da foundation; empresa: mesmo POST e mesmo onCreated (sem gravar empresa padrão)
  assert.match(holidays, /<Dialog/); assert.match(company, /<Dialog/); assert.match(company, /fetch\("\/api\/master-data\/companies", \{ method: "POST"/); assert.match(company, /onCreated\(body\.item\)/);
  assert.doesNotMatch(company, /employee-config|defaultCompany/);
  // combobox: ids únicos por instância (sem id fixo) e o mesmo contrato controlado
  assert.doesNotMatch(combo, /food-collaborator-multi-options/); assert.match(combo, /useId\(\)/); assert.match(combo, /role="listbox" aria-multiselectable="true"/);
  assert.match(combo, /onChange\(value\.includes\(id\) \? value\.filter\(\(current\) => current !== id\) : \[\.\.\.value, id\]\)/); assert.match(combo, /\.slice\(0, 50\)/);
  // genéricos fora da Cesta: ninguém importa mais basic-basket/ui de outro módulo
  const breakfast = await readFile(new URL("../src/modules/accounts-payable/breakfast/BreakfastSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(breakfast, /basic-basket\/ui/); assert.match(breakfast, /shared\/ui\/CompetenceSummary/);
});

test("DeletionModal 7G: devolve o foco ao gatilho ao fechar (sem focar elemento removido) e mantém a confirmação destrutiva", async () => {
  const { restoreDeletionFocus } = await import("../src/components/ui/DeletionModal");
  let focused = 0;
  restoreDeletionFocus({ isConnected: true, focus: () => { focused++; } }); assert.equal(focused, 1); // Cancelar / Esc: gatilho ainda na página
  restoreDeletionFocus({ isConnected: false, focus: () => { focused++; } }); assert.equal(focused, 1); // exclusão concluída removeu o gatilho
  restoreDeletionFocus(null); assert.equal(focused, 1);
  const source = await readFile(new URL("../src/components/ui/DeletionModal.tsx", import.meta.url), "utf8");
  // gatilho capturado ANTES do showModal (o modal só existe aberto); devolvido ao desmontar e no close nativo (backdrop)
  assert.ok(source.indexOf("opener.current=document.activeElement") < source.indexOf("dialog.showModal()"));
  assert.match(source, /addEventListener\("close",restore\);return\(\)=>\{dialog\?\.removeEventListener\("close",restore\);restore\(\);\}/);
  // regras destrutivas inalteradas: palavra-chave EXCLUIR + motivo obrigatório no lote, Esc bloqueado durante a operação
  assert.match(source, /const ready=\(!requireKeyword\|\|confirmation==="EXCLUIR"\)&&\(!requireKeyword\|\|Boolean\(reason\)\);/);
  assert.match(source, /onCancel=\{busy\?event=>event\.preventDefault\(\):onClose\}/); assert.match(source, /onClick=\{\(\)=>onConfirm\(reason\)\}/);
  assert.match(source, /export function DeletionModal\(props:DeletionModalProps\)\{return props\.open\?<OpenDeletionModal \{\.\.\.props\}\/>:null;\}/);
});

// ---- Fase 7H: Alimentação MA/PA no Design System (só apresentação; regras, payloads e chamadas seguem na página/servidor).
test("alimentação 7H: MA/PA no Design System, regras na página e componentes visuais sem cálculo nem regra de NF", async () => {
  const base = "../src/modules/accounts-payable/food/ui/";
  const [page, paTable, rateio, occurrences, summary, editor, review] = await Promise.all(["../src/app/pagamentos/alimentacao/page.tsx", base + "FoodPaManualTable.tsx", base + "FoodRateioParts.tsx", base + "FoodOccurrenceTable.tsx", base + "FoodLocalitySummary.tsx", base + "FoodMaEditor.tsx", base + "FoodMaReview.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  // navegação: Tabs da foundation para estado (MA/PA mantidos montados), ciclo do MA e forma de entrada
  assert.match(page, /<Tabs label="Estado do processamento de alimentação"/); assert.match(page, /<TabPanel value="MA" keepMounted/); assert.match(page, /<TabPanel value="PA" keepMounted/);
  assert.match(page, /<Tabs label="Ciclo de alimentação do Maranhão"/); assert.match(page, /<Tabs label="Forma de entrada"/);
  assert.doesNotMatch(page, /role="tablist"|AllocationCard|AllocationDepartment|ManualEntrySection|<FileInput\s|modal-box|<table/);
  // upload no padrão (UploadDropzone) com reset preservado; rateio pelas 4 perspectivas compartilhadas, padrão Departamento
  assert.match(page, /<UploadDropzone\s+key=\{fileInputKey\}/); assert.match(page, /<AllocationViews/); assert.match(page, /useState<AllocationViewId>\("department"\)/);
  // regras/payloads seguem na página e no servidor (NF só enviada; empresa nunca no payload)
  assert.match(page, /invoiceEmission: manualInvoices\[collaboratorId\]/); assert.match(page, /paQuantitiesValid && paInvoicesValid/); assert.doesNotMatch(page, /company:\s*FOOD_PA_INVOICES|company:\s*foodInvoiceEmissionToCompany/);
  // componentes visuais: sem fetch, sem cálculo financeiro, empresa PA só lida do helper único da regra
  for (const [name, source] of Object.entries({ paTable, rateio, occurrences, summary })) {
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /fetch\(|prisma|amountToCents|buildFoodPaCompanyRateio|parseFoodPaInvoice/, name);
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange|red|blue)-\d|#[0-9a-fA-F]{3,6}\b|<[a-z][a-z0-9]*\s[^>]*\btitle=|[✓⚠×↳⌕☑]/, name);
  }
  assert.match(paTable, /FOOD_PA_INVOICES\[row\.invoice\]\.company/); assert.doesNotMatch(paTable, /"BOINGA"|"PROJETA"/);
  // revisão (workspace) e editor no Design System sem perder a estrutura testada
  for (const [name, source] of Object.entries({ editor, review })) assert.doesNotMatch(source, /\b(emerald|amber|slate|red|blue|violet)-\d|[✓⚠⌕⌄×]/, name);
  assert.match(review, /<dialog ref=\{dialogRef\}/); assert.match(review, /<StatusBadge/); assert.match(editor, /<StatusBadge tone=\{info\.tone\}>/);
  // não importa visual específico de outros módulos
  assert.doesNotMatch(page + paTable + rateio + occurrences, /basic-basket\/ui|breakfast\/ui|transit-voucher\/ui/);
});

test("Tabs 7H: keepMounted mantém o painel inativo no DOM (oculto); sem a prop, só o painel ativo é renderizado", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Tabs, TabPanel } = await import("../src/components/ui/Tabs");
  const items = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
  const kept = renderToStaticMarkup(createElement(Tabs, { label: "X", items, value: "a", onValueChange: () => undefined }, createElement(TabPanel, { value: "a", keepMounted: true, children: "painel-a" }), createElement(TabPanel, { value: "b", keepMounted: true, children: "painel-b" })));
  assert.match(kept, /painel-a/); assert.match(kept, /<div role="tabpanel"[^>]*hidden=""[^>]*>painel-b/);
  const plain = renderToStaticMarkup(createElement(Tabs, { label: "X", items, value: "a", onValueChange: () => undefined }, createElement(TabPanel, { value: "a", children: "painel-a" }), createElement(TabPanel, { value: "b", children: "painel-b" })));
  assert.match(plain, /painel-a/); assert.doesNotMatch(plain, /painel-b/);
});

// ---- Fase 7I: Cadastros (Colaboradores e Entidades administrativas) no Design System (só apresentação).
test("cadastros 7I: colaboradores no Design System, payloads/CPF/admissão/importação preservados e UI sem regra", async () => {
  const base = "../src/modules/collaborators/ui/";
  const [page, table, form, importer] = await Promise.all(["../src/app/cadastros/colaboradores/page.tsx", base + "CollaboratorTable.tsx", base + "CollaboratorFormFields.tsx", base + "CollaboratorImport.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  // foundation: Dialog único (sem o dialog local antigo), FilterBar/SearchInput, DataTable, ImportFlow
  assert.doesNotMatch(page.replace(/^\s*\/\/.*$/gm, ""), /function Dialog\(|className="modal"|modal-box|<table|[✕⇄▾→]/); assert.match(page, /<FilterBar/); assert.match(page, /<SearchInput/);
  assert.match(page, /<CollaboratorTable/); assert.match(page, /<CollaboratorImport/); assert.match(importer, /<ImportFlow/); assert.match(table, /<DataTable/);
  // payloads e regras na página: CPF normalizado/validado, admissão date-only, mesmos endpoints e confirmações
  assert.match(page, /body: JSON\.stringify\(\{ \.\.\.form, cpf: normalizeCpf\(form\.cpf\) \|\| null, admissionDate: form\.admissionDate \|\| null \}\)/);
  assert.match(page, /if \(form\.cpf\.trim\(\) && !isValidCpf\(form\.cpf\)\) \{ setCpfError\("CPF inválido\."\)/); assert.match(page, /dateOnlyFromDb\(item\.admissionDate\)/);
  assert.match(page, /data\.set\("mode", mode\); data\.set\("overrides", JSON\.stringify\(next\)\)/); assert.match(page, /deleteConfirmation !== "EXCLUIR COLABORADORES"/);
  assert.match(page, /\/api\/collaborators\/bulk/); assert.match(page, /\/api\/collaborators\/merge/); assert.match(page, /<ConfirmModal/);
  // componentes visuais: sem fetch e sem regra (CPF/admissão só formatados; admissão em input date; nada monetário)
  for (const [name, source] of Object.entries({ table, form, importer })) {
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /fetch\(|prisma|normalizeCpf|isValidCpf|CurrencyInput/, name);
    assert.doesNotMatch(source, /\b(emerald|amber|slate|orange|red)-\d|#[0-9a-fA-F]{3,6}\b|badge-(success|info|ghost|warning|error)/, name);
  }
  assert.match(table, /formatCpf\(item\.cpf\)/); assert.match(table, /formatDateOnlyBR\(item\.admissionDate\)/); assert.match(form, /type="date"/);
});

test("cadastros 7I: entidades administrativas no Design System, CNPJ/SIM-NÃO/payload preservados, Company à parte", async () => {
  const [page, table, form] = await Promise.all(["../src/app/cadastros/page.tsx", "../src/modules/administrative-entities/ui/EntityTable.tsx", "../src/modules/administrative-entities/ui/EntityFormFields.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(page, /<Dialog/); assert.match(page, /<FilterBar/); assert.match(page, /<EntityTable/); assert.doesNotMatch(page.replace(/^\s*\/\/.*$/gm, ""), /<table|className="card|→/);
  assert.match(page, /if \(digits && !isValidCnpj\(digits\)\) return setCnpjError\("Informe um CNPJ válido\."\)/);
  assert.match(page, /body: JSON\.stringify\(\{ \.\.\.form, cnpj: digits \|\| null, appliesProjeta: form\.appliesProjeta === "true", appliesBoinga: form\.appliesBoinga === "true" \}\)/);
  assert.match(page, /method: editingId \? "PATCH" : "POST"/); assert.doesNotMatch(page, /master-data\/companies/); // Company (empresa do rateio) não é este cadastro
  for (const [name, source] of Object.entries({ table, form })) assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /fetch\(|isValidCnpj|prisma/, name);
  assert.match(form, /list="activity-area-options"/); assert.match(table, /formatCnpj\(item\.cnpj\)/);
});
