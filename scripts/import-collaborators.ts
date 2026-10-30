// Importação inicial/legada de colaboradores a partir da planilha "Dados Cadastro.xlsx" (1ª aba).
// Uso: npx tsx scripts/import-collaborators.ts <caminho.xlsx> — ESCREVE no banco (FoodEmployee).
// Colunas obrigatórias (cabeçalho na linha 1, comparado sem acento/caixa): Nome, Função, Departamento, Centro De Custo.
// Regras: chave de casamento é o nome normalizado; existente → update, novo → create; todos ficam active=true.
// Nome repetido na própria planilha aborta a execução (os registros anteriores já gravados permanecem).
// A importação pela tela (src/modules/collaborators/import.ts) é a via atual, com prévia e detecção de duplicidade.
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/db/prisma";
import { normalizeCollaboratorText, normalizeCollaboratorSearch } from "../src/modules/collaborators/schema";

// Lê a planilha, valida cabeçalhos e faz upsert manual por normalizedName; imprime contagens em JSON.
async function main() {
const source = process.argv[2]; if (!source) throw new Error("Informe o caminho de Dados Cadastro.xlsx.");
const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(source); const sheet = workbook.worksheets[0];
const headers = new Map<string, number>(); sheet.getRow(1).eachCell((cell, col) => headers.set(normalizeCollaboratorSearch(cell.value), col));
const column = (name: string) => { const index = headers.get(normalizeCollaboratorSearch(name)); if (!index) throw new Error(`Coluna ausente: ${name}`); return index; };
const [nameCol, jobCol, departmentCol, costCol] = [column("Nome"), column("Função"), column("Departamento"), column("Centro De Custo")];
let analyzed = 0, created = 0, updated = 0; const seen = new Set<string>();
for (let row = 2; row <= sheet.rowCount; row++) { const officialName = normalizeCollaboratorText(sheet.getCell(row, nameCol).text); if (!officialName) continue; analyzed++; const normalizedName = normalizeCollaboratorSearch(officialName); if (seen.has(normalizedName)) throw new Error(`Duplicidade no arquivo: ${officialName}`); seen.add(normalizedName); const data = { officialName, normalizedName, jobTitle: normalizeCollaboratorText(sheet.getCell(row, jobCol).text), department: normalizeCollaboratorText(sheet.getCell(row, departmentCol).text), costCenter: normalizeCollaboratorText(sheet.getCell(row, costCol).text), active: true }; const existing = await prisma.foodEmployee.findUnique({ where: { normalizedName } }); if (existing) { await prisma.foodEmployee.update({ where: { id: existing.id }, data }); updated++; } else { await prisma.foodEmployee.create({ data }); created++; } }
console.log(JSON.stringify({ analyzed, unique: seen.size, created, updated })); await prisma.$disconnect();
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
