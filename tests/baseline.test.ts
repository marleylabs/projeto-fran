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
  assert.match(page, /UtensilsCrossed/); assert.match(page, /BusFront/); assert.match(page, /PackagePlus/);
  assert.match(page, /lg:grid-cols-2/); assert.match(page, /\/pagamentos\/alimentacao/); assert.match(page, /\/pagamentos\/vale-transporte/);
  assert.match(card, /card card-side/); assert.match(card, /sm:flex-row/); assert.match(card, /h-20 w-full/); assert.match(card, /sm:w-\[7\.5rem\]/);
  assert.match(card, /hover:-translate-y-px/); assert.match(card, /focus-visible:ring-2/); assert.match(card, /aria-disabled="true"/);
  assert.doesNotMatch(`${page}\n${card}`, /🍽️|🚌|https?:\/\//);
});
