// Backfill: vincula ao cadastro de colaboradores (FoodEmployee) as linhas de Alimentação (FoodMealOccurrence)
// e de Vale Transporte (TransitVoucherAllocation) que ainda estão sem employeeId.
// Uso: npx tsx scripts/backfill-collaborators.ts — ESCREVE no banco (update linha a linha, sem transação).
// Usa matchFoodEmployee (nome + departamento + apelidos/aliases); linhas sem correspondência ficam pendentes
// e são apenas contadas no JSON final. É idempotente: só olha linhas com employeeId nulo.
import { prisma } from "../src/lib/db/prisma";
import { matchFoodEmployee } from "../src/modules/accounts-payable/food/matching";
// Na Alimentação também grava nome oficial, departamento confirmado e o método de match;
// no Vale Transporte só o vínculo e o nome oficial.
async function main(){const [employees,aliases,meals,transit]=await Promise.all([prisma.foodEmployee.findMany(),prisma.foodEmployeeAlias.findMany({include:{employee:true}}),prisma.foodMealOccurrence.findMany({where:{employeeId:null}}),prisma.transitVoucherAllocation.findMany({where:{employeeId:null}})]);let foodLinked=0,transitLinked=0;for(const row of meals){const match=matchFoodEmployee(row.receivedName,row.receivedDepartment,employees,aliases);if(match.employee){await prisma.foodMealOccurrence.update({where:{id:row.id},data:{employeeId:match.employee.id,officialName:match.employee.officialName,confirmedDepartment:match.employee.department,matchMethod:match.method}});foodLinked++;}}for(const row of transit){const match=matchFoodEmployee(row.employeeName,row.department??"",employees,aliases);if(match.employee){await prisma.transitVoucherAllocation.update({where:{id:row.id},data:{employeeId:match.employee.id,employeeName:match.employee.officialName}});transitLinked++;}}console.log(JSON.stringify({food:{analyzed:meals.length,linked:foodLinked,pending:meals.length-foodLinked},transit:{analyzed:transit.length,linked:transitLinked,pending:transit.length-transitLinked}}));await prisma.$disconnect();}
main().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1});
