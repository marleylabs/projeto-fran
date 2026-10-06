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
  const [layout, shell, styles, header] = await Promise.all([
    readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CorporateHeader.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Manrope/);assert.doesNotMatch(layout,/Cause/);assert.match(layout,/<AppShell>/);
  for(const token of ["--color-sidebar: #0a0a0a","--color-background: #f5f5f5","--color-surface: #ffffff","--color-primary: #af1b1b"])assert.ok(styles.toLowerCase().includes(token));
  assert.match(styles,/\.app-sidebar/);assert.match(styles,/@media \(min-width: 1024px\)/);assert.match(styles,/width: 15\.5rem/);
  assert.match(shell,/NAVIGATION_MODULES/);assert.match(shell,/\/api\/auth\/me/);assert.match(shell,/\/api\/auth\/logout/);assert.match(shell,/app-drawer/);
  assert.doesNotMatch(header,/Módulos da plataforma/);
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
  assert.match(styles, /\.btn \{ min-height: var\(--density-control-md\)/);
  assert.match(styles, /\.table :where\(td,th\).*padding: \.45rem \.75rem/);
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

test("rateio XLSX de alimentação mantém cálculos e entrega somente as duas abas gerenciais", async () => {
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
  assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),["Resumo por Setor","Rateio por Colaborador"]);
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
  assert.deepEqual(reopened.worksheets.map(sheet=>sheet.name),["Resumo por Setor","Rateio por Colaborador"]);
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
  assert.match(page, /1\. Dados necessários/); assert.match(page, /Salvar \/ Gerar Rateio/);
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
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo", "Rateio por Colaborador", "Auditoria"]);
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
  const [route, section, transit] = await Promise.all([
    readFile(new URL("../src/app/api/accounts-payable/breakfast/[mapId]/flash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/accounts-payable/breakfast/BreakfastSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/pagamentos/vale-transporte/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePermission\(PERMISSIONS\.FINANCIAL_RECORDS_READ\)/); assert.match(route, /deletedAt: null/);
  assert.match(section, /Download do rateio XLSX/); assert.match(section, /Download da Máscara Flash/);
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
  assert.ok(input.includes("value={manualAmount}") && input.includes("setManualAmount(e.target.value)"));
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
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo por Setor", "Resumo por Empresa", "Rateio por Colaborador"]);
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
  assert.deepEqual(ma.worksheets.map((sheet) => sheet.name), ["Resumo por Setor", "Rateio por Colaborador"]);
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
  assert.match(page, /<span>Refeições<\/span>\s*<span>Emissão NF<\/span>\s*<span>Subtotal<\/span>/);
  assert.match(page, /aria-label=\{`Emissão NF de \$\{employee\?\.officialName/); assert.match(page, /FOOD_PA_INVOICE_CODES\.map/);
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
  assert.match(section, /aria-label="Quantidade extras"[^>]*value=\{value\.extra\} onChange=\{\(event\) => patchValue\(row\.id, \{ extra: event\.target\.value \}\)\}/);
  assert.doesNotMatch(section, /useEffect\([^)]*applyBreakfastExtraSuggestions/); assert.match(section, /onClick=\{applyPointMirror\}/);
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
  assert.doesNotMatch(pointServer, /admission/i); assert.doesNotMatch(flash, /admission/i);
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
  assert.deepEqual(oct, { previousPaymentDate: "2026-09-09", paymentDate: "2026-10-14", competenceYear: 2026, competenceMonth: 10, currentMonthStart: "2026-10-01", currentMonthEnd: "2026-10-31", referenceYear: 2026, referenceMonth: 9, referenceMonthStart: "2026-09-01", referenceMonthEnd: "2026-09-30" });
  assert.deepEqual(basicBasketContextFromPayments("2026-09-09", "2026-10-14"), oct); // correção reconstrói o mesmo contexto a partir do mapa
  const nov = buildBasicBasketContext(2026, 11);
  assert.deepEqual([nov.previousPaymentDate, nov.paymentDate, nov.referenceMonthEnd], ["2026-10-14", "2026-11-11", "2026-10-31"]);
  // linha completa a partir do valor MENSAL R$ 400,00 (Bonificação/Acordo nunca proporcionais)
  const MONTHLY = 40000;
  const calc = (admissionDate: string, context = oct, driverBonusCents = 0, agreementCents = 0) => {
    const current = calculateCurrentBasketDays({ context, admissionDate }), retro = calculateRetroactiveDays({ context, admissionDate });
    const line = calculateBasicBasketLine({ driverBonusCents, agreementCents, monthlyBasketCents: MONTHLY, currentBasketDays: current.currentBasketDays, retroactiveDays: retro.retroactiveDays });
    return { current: current.status, days: current.currentBasketDays, retro: retro.status, retroDays: retro.retroactiveDays, ...line };
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
  assert.deepEqual(calculateBasicBasketLine({ driverBonusCents: 0, agreementCents: 0, monthlyBasketCents: 45000, currentBasketDays: 26, retroactiveDays: 10 }), { payableBasketCents: 39000, retroactiveCents: 15000, totalCents: 54000 });
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

test("cesta básica: rateio Empresa → Departamento → Colaborador, resumo Empresa → CC e XLSX auditável fecham (base 30)", async () => {
  const { groupBasicBasketByCompanyDepartment, groupBasicBasketByCompanyCostCenter } = await import("../src/modules/accounts-payable/basic-basket/rateio");
  const { buildBasicBasketWorkbook } = await import("../src/modules/accounts-payable/basic-basket/workbook");
  const row = (employeeId: string, company: string, department: string, costCenter: string | null, values: [string, string, string, string, string], retroactiveDays: number, admissionDate: string | null = null, observation: string | null = null, currentBasketDays = 30) => ({ id: employeeId, employeeId, employeeName: `PESSOA ${employeeId.toUpperCase()}`, company, department, costCenter, driverBonus: values[0], agreementAmount: values[1], monthlyBasketAmount: "400.0000", currentCalculationDays: 30, currentBasketDays, basketAmount: values[2], retroactiveAmount: values[3], amount: values[4], referenceCalculationDays: 30, retroactiveDays, admissionDate, observation });
  const rows = [
    row("a", "PROJETA", "TOPOGEO", "VALE BMSA", ["150.00", "100.00", "346.67", "0.00", "596.67"], 0, "2026-10-05T00:00:00.000Z", null, 26), // admissão na competência: 26 de 30
    row("b", "PROJETA", "ADMINISTRATIVO", "VALE BMSA", ["0.00", "0.00", "400.00", "133.33", "533.33"], 10, "2026-09-21T00:00:00.000Z", "Ajuste conforme acordo"), // Retroativo parcial
    row("c", "BOINGA", "TOPOGEO", null, ["150.00", "100.00", "400.0000", "280.0000", "930.0000"], 21, "2026-09-10T00:00:00.000Z"), // desde o dia seguinte ao pagamento anterior
  ];
  const tree = groupBasicBasketByCompanyDepartment(rows);
  assert.deepEqual(tree.companies.map((company) => [company.company, company.totals.totalCents, company.departments.map((department) => [department.department, department.totals.totalCents])]), [["BOINGA", 93000, [["TOPOGEO", 93000]]], ["PROJETA", 113000, [["ADMINISTRATIVO", 53333], ["TOPOGEO", 59667]]]]);
  assert.equal(tree.totals.totalCents, 206000); assert.equal(tree.consistent, true);
  const summary = groupBasicBasketByCompanyCostCenter(rows);
  assert.deepEqual(summary.companies.map((company) => [company.company, company.costCenters.map((cc) => [cc.costCenter, cc.totals.people, cc.totals.basketCents, cc.totals.retroactiveCents, cc.totals.totalCents])]), [["BOINGA", [["Sem centro de custo", 1, 40000, 28000, 93000]]], ["PROJETA", [["VALE BMSA", 2, 74667, 13333, 113000]]]]);
  assert.deepEqual([summary.totals.driverBonusCents, summary.totals.agreementCents, summary.totals.basketCents, summary.totals.retroactiveCents, summary.totals.totalCents], [30000, 20000, 114667, 41333, 206000]); assert.equal(summary.consistent, true);
  const map = { version: 1, createdAt: new Date("2026-10-01T12:00:00Z"), previousPaymentDate: "2026-09-09T00:00:00.000Z", paymentDate: "2026-10-14T00:00:00.000Z", daysInMonth: 31, totalAmount: "2060.00", competence: { year: 2026, month: 10 }, administrativeEntity: { tradeName: "Fornecedor QA" }, financialRecord: { identifier: "PG-QA", grossAmount: "2060.0000" }, allocations: rows };
  const workbook = buildBasicBasketWorkbook(map, "qa");
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Detalhado", "Resumo", "Auditoria"]);
  const detail = workbook.getWorksheet("Detalhado")!; const values = (n: number) => (detail.getRow(n).values as unknown[]).slice(1);
  assert.deepEqual(values(1), ["Empresa", "Departamento", "Centro de Custo", "Colaborador", "Data de Admissão", "Pagamento Anterior", "Pagamento Atual", "Valor Mensal da Cesta", "Base de Cálculo da Cesta", "Dias de Direito à Cesta", "Mês de Referência Retroativo", "Base de Cálculo Retroativo", "Dias Retroativos", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total", "Observação", "Fornecedor"]);
  const iso = (cell: string) => (detail.getCell(cell).value as Date).toISOString().slice(0, 10);
  const cells = (n: number, columns: string) => columns.split("").map((column) => detail.getCell(`${column}${n}`).value);
  assert.deepEqual([iso("E2"), iso("F2"), iso("G2"), ...cells(2, "HIJKLMPQR")], ["2026-09-10", "2026-09-09", "2026-10-14", 400, 30, 30, "09/2026", 30, 21, 400, 280, 930]); // BOINGA
  assert.deepEqual([iso("E3"), ...cells(3, "HIJLMPQR")], ["2026-09-21", 400, 30, 30, 30, 10, 400, 133.33, 533.33]); // Retroativo parcial
  assert.deepEqual([iso("E4"), ...cells(4, "HIJMNOPQR")], ["2026-10-05", 400, 30, 26, 0, 150, 100, 346.67, 0, 596.67]); // Cesta proporcional 26 de 30
  for (const column of [5, 6, 7]) assert.equal(detail.getColumn(column).numFmt, "dd/mm/yyyy");
  for (const column of [8, 14, 15, 16, 17, 18]) assert.equal(detail.getColumn(column).numFmt, "R$ #,##0.00");
  assert.deepEqual(cells(5, "PQR"), [1146.67, 413.33, 2060]); // linha TOTAL: soma a Cesta PAGA
  assert.equal(detail.getCell("S3").value, "Ajuste conforme acordo"); assert.equal(detail.getCell("T2").value, "Fornecedor QA");
  const resumo = workbook.getWorksheet("Resumo")!;
  assert.deepEqual((resumo.getRow(1).values as unknown[]).slice(1), ["Empresa", "Centro de Custo", "Colaboradores", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total"]);
  assert.deepEqual((resumo.getRow(resumo.rowCount).values as unknown[]).slice(1), ["Total Geral", "", 3, 300, 200, 1146.67, 413.33, 2060]);
  const audit = workbook.getWorksheet("Auditoria")!;
  assert.deepEqual([audit.getCell("A2").value, audit.getCell("B2").value], ["Dias no mês (calendário)", 31]); // calendário real
  assert.equal(audit.getCell("B3").value, "09/09/2026"); assert.equal(audit.getCell("B4").value, "14/10/2026");
  assert.equal(audit.getCell("B5").value, "09/2026 (01/09/2026 a 30/09/2026)"); assert.equal(audit.getCell("B10").value, 2060);
  const auditText = JSON.stringify(audit.getSheetValues());
  assert.match(auditText, /Os cálculos de Cesta Básica e Retroativo utilizam base financeira fixa de 30 dias, independentemente da quantidade de dias do mês calendário\./);
  assert.doesNotMatch(auditText, /apuração|31 dias|dias corridos|Cesta integral/);
  assert.throws(() => buildBasicBasketWorkbook({ ...map, totalAmount: "2059.99" }), /Inconsistência/);
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
  assert.match(section, /<MetricCard label="Dias no mês" value=\{String\(ctx\?\.daysInMonth \?\? "—"\)\}/); assert.match(section, /BASIC_BASKET_CALCULATION_DAYS/);
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
});
