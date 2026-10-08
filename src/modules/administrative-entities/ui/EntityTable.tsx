"use client";

// Listagem do cadastro geral de entidades administrativas (favorecidos/fornecedores das obrigações). SÓ APRESENTAÇÃO:
// busca e filtros vão para a API na página; CNPJ só é formatado. Área de atuação e localidade aparecem como gravadas
// (são usadas por Alimentação/Café/Cesta/VT para filtrar fornecedores e não são reinterpretadas aqui).
import { PencilLine } from "lucide-react";
import { Button, DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import { formatCnpj } from "../schema";
import type { AdministrativeEntityItem } from "./types";

const yesNo = (value: boolean) => (value ? <StatusBadge tone="success">SIM</StatusBadge> : <StatusBadge tone="neutral">NÃO</StatusBadge>);

export function EntityTable({ rows, loading, onEdit }: { rows: AdministrativeEntityItem[]; loading: boolean; onEdit: (item: AdministrativeEntityItem) => void }) {
  const columns: DataTableColumn<AdministrativeEntityItem>[] = [
    { id: "name", header: "Razão social", rowHeader: true, sticky: "start", width: "17rem", cell: (item) => (
      <span className="grid min-w-0"><span className="truncate">{item.legalName}</span><span className="truncate text-caption font-normal text-foreground-muted">{item.tradeName}</span></span>
    ) },
    { id: "cnpj", header: "CNPJ", cell: (item) => (item.cnpj ? <span className="tabular-nums">{formatCnpj(item.cnpj)}</span> : <span className="text-foreground-muted">Não informado</span>) },
    { id: "area", header: "Área de atuação", cell: (item) => item.activityArea },
    { id: "projeta", header: "Projeta", align: "center", cell: (item) => yesNo(item.appliesProjeta) },
    { id: "boinga", header: "Boinga", align: "center", cell: (item) => yesNo(item.appliesBoinga) },
    { id: "locality", header: "Localidade", cell: (item) => item.locality },
  ];
  return (
    <DataTable
      caption="Cadastros de entidades administrativas"
      columns={columns}
      rows={rows}
      getRowId={(item) => item.id}
      density="dense"
      minWidth="900px"
      loading={loading && rows.length === 0}
      loadingRows={6}
      rowActions={(item) => <Button size="sm" variant="ghost" onClick={() => onEdit(item)} aria-label={`Editar ${item.tradeName || item.legalName}`}><PencilLine size={14} aria-hidden="true" />Editar</Button>}
      empty={{ title: "Nenhum cadastro encontrado", description: "Ajuste os filtros ou crie um novo cadastro." }}
    />
  );
}
