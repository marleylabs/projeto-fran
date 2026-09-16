import ExcelJS from "exceljs";
import { findHeader, normalizeCell, readXlsxMatrix } from "@/modules/accounts-payable/shared/spreadsheet";
import { normalizeCollaboratorSearch, parseCollaboratorInput } from "./schema";

export type CollaboratorRow = ReturnType<typeof parseCollaboratorInput>;
export type ExistingCollaborator = CollaboratorRow & { id: string; active: boolean };
export type ImportClassification = "NEW" | "EXISTING" | "UPDATE_AVAILABLE" | "POSSIBLE_DUPLICATE";

function tokens(value: string) { return new Set(normalizeCollaboratorSearch(value).split(" ").filter(token => token.length > 1)); }
export function collaboratorSimilarity(a: Pick<CollaboratorRow,"officialName"|"department"|"jobTitle"|"costCenter">, b: Pick<CollaboratorRow,"officialName"|"department"|"jobTitle"|"costCenter">) {
  const left=tokens(a.officialName),right=tokens(b.officialName); const intersection=[...left].filter(token=>right.has(token)).length; const nameScore=intersection/Math.max(Math.min(left.size,right.size),1);
  const fieldScore=[a.department&&b.department&&normalizeCollaboratorSearch(a.department)===normalizeCollaboratorSearch(b.department),a.costCenter&&b.costCenter&&normalizeCollaboratorSearch(a.costCenter)===normalizeCollaboratorSearch(b.costCenter),a.jobTitle&&b.jobTitle&&normalizeCollaboratorSearch(a.jobTitle)===normalizeCollaboratorSearch(b.jobTitle)].filter(Boolean).length;
  return Math.min(1,nameScore*0.8+fieldScore*0.1);
}
export function classifyCollaborator(row: CollaboratorRow, existing: ExistingCollaborator[]) {
  const exact=existing.find(item=>item.normalizedName===row.normalizedName);
  if(exact){const fields: Array<keyof Pick<CollaboratorRow,"officialName"|"jobTitle"|"department"|"costCenter">>=["officialName","jobTitle","department","costCenter"];const changed=fields.some(field=>normalizeCollaboratorSearch(row[field])!==normalizeCollaboratorSearch(exact[field]));return{classification:(changed?"UPDATE_AVAILABLE":"EXISTING") as ImportClassification,match:exact,score:1};}
  const ranked=existing.map(item=>({item,score:collaboratorSimilarity(row,item)})).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=0.72?{classification:"POSSIBLE_DUPLICATE" as const,match:ranked[0].item,score:ranked[0].score}:{classification:"NEW" as const,match:null,score:0};
}
export async function parseCollaboratorWorkbook(buffer: Buffer) {
  const matrix=await readXlsxMatrix(buffer); if(!matrix.length)throw new Error("A planilha está vazia.");
  const headers=matrix[0].map(normalizeCell); const name=findHeader(headers,["NOME"]),job=findHeader(headers,["FUNÇÃO","FUNCAO"]),department=findHeader(headers,["DEPARTAMENTO"]),cost=findHeader(headers,["CENTRO DE CUSTO","CENTRO DE CUSTO "]);
  if(name<0||department<0)throw new Error("A máscara deve conter NOME e DEPARTAMENTO.");
  return matrix.slice(1).map((values,index)=>({sourceRow:index+2,values})).filter(item=>item.values.some(value=>normalizeCell(value))).map(item=>({sourceRow:item.sourceRow,data:parseCollaboratorInput({officialName:normalizeCell(item.values[name]),jobTitle:job>=0?normalizeCell(item.values[job]):"",department:normalizeCell(item.values[department]),costCenter:cost>=0?normalizeCell(item.values[cost]):""})}));
}
export async function generateCollaboratorTemplate(){const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet("COLABORADORES");sheet.addRow(["NOME","FUNÇÃO","DEPARTAMENTO","CENTRO DE CUSTO"]);sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFAF1B1B"}};[38,30,28,24].forEach((width,index)=>sheet.getColumn(index+1).width=width);sheet.views=[{state:"frozen",ySplit:1}];sheet.autoFilter="A1:D1";return Buffer.from(await workbook.xlsx.writeBuffer());}
