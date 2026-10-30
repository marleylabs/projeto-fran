// Ordenação alfabética em português, usada em listas e exportações. `sensitivity: "base"` ignora
// acentos e maiúsculas; `numeric` ordena "CC 2" antes de "CC 10".
const ptBrCollator = new Intl.Collator("pt-BR", { sensitivity: "base", usage: "sort", numeric: true });

/** Comparador pt-BR tolerante a null/undefined (tratados como ""). */
export function comparePtBr(a:string|null|undefined,b:string|null|undefined){return ptBrCollator.compare((a??"").trim(),(b??"").trim());}
/** Ordena por data crescente (sem data = 0, vem primeiro) e desempata pelo id, para ordem estável. */
export function compareDateThenId(a:Date|string|null|undefined,b:Date|string|null|undefined,aId:string,bId:string){const timeA=a?new Date(a).getTime():0;const timeB=b?new Date(b).getTime():0;return timeA-timeB||comparePtBr(aId,bId);}
/** Cópia ordenada por `name` em pt-BR; `tie` opcional desempata nomes iguais. Não altera o array original. */
export function sortedPtBr<T>(values:readonly T[],name:(value:T)=>string|null|undefined,tie?:(a:T,b:T)=>number){return [...values].sort((a,b)=>comparePtBr(name(a),name(b))||(tie?.(a,b)??0));}
