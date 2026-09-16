const ptBrCollator = new Intl.Collator("pt-BR", { sensitivity: "base", usage: "sort", numeric: true });

export function comparePtBr(a:string|null|undefined,b:string|null|undefined){return ptBrCollator.compare((a??"").trim(),(b??"").trim());}
export function compareDateThenId(a:Date|string|null|undefined,b:Date|string|null|undefined,aId:string,bId:string){const timeA=a?new Date(a).getTime():0;const timeB=b?new Date(b).getTime():0;return timeA-timeB||comparePtBr(aId,bId);}
export function sortedPtBr<T>(values:readonly T[],name:(value:T)=>string|null|undefined,tie?:(a:T,b:T)=>number){return [...values].sort((a,b)=>comparePtBr(name(a),name(b))||(tie?.(a,b)??0));}
