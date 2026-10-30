// Auditoria (somente leitura) de possíveis colaboradores duplicados no cadastro (FoodEmployee).
// Uso: npx tsx scripts/audit-collaborator-duplicates.ts — imprime JSON com os pares suspeitos, do maior score ao menor.
// Reaproveita classifyCollaborator (mesma heurística da importação de colaboradores): compara cada par
// i<j uma única vez (O(n²)), tratando o segundo colaborador como "existente". Não grava nada no banco.
// Atenção: a saída contém nomes de colaboradores (dado pessoal) — não compartilhe fora da equipe.
import { prisma } from "../src/lib/db/prisma";
import { classifyCollaborator } from "../src/modules/collaborators/import";
// Lista pares classificados como POSSIBLE_DUPLICATE (nome parecido) ou EXISTING (mesmo nome normalizado).
async function main(){const employees=await prisma.foodEmployee.findMany({orderBy:{officialName:"asc"}});const pairs=[];for(let left=0;left<employees.length;left++)for(let right=left+1;right<employees.length;right++){const result=classifyCollaborator(employees[left],employees.filter(item=>item.id===employees[right].id));if(result.classification==="POSSIBLE_DUPLICATE"||result.classification==="EXISTING")pairs.push({score:result.score,left:{id:employees[left].id,name:employees[left].officialName},right:{id:employees[right].id,name:employees[right].officialName}})}console.log(JSON.stringify({analyzed:employees.length,possibleDuplicates:pairs.length,pairs:pairs.sort((a,b)=>b.score-a.score)},null,2));await prisma.$disconnect()}
main().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1});
