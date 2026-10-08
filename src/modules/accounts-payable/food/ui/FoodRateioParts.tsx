"use client";

// Peças de apresentação do Rateio da Alimentação (MA e PA). SÓ APRESENTAÇÃO: os grupos chegam prontos — por Empresa
// (PA, derivados da Emissão NF no servidor: buildFoodPaCompanyRateio), por Setor (alocações salvas) e as linhas finais
// das perspectivas (rateioViews do servidor). Nada aqui calcula valor, decide empresa ou consulta cadastro.
import { CheckCircle2, XCircle } from "lucide-react";
import clsx from "clsx";
import { DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import type { AllocationViewRow } from "@/modules/accounts-payable/shared/allocation-views";
import { Disclosure } from "@/modules/accounts-payable/shared/ui/parts";
import { FOOD_PA_UNIDENTIFIED_COMPANY, type FoodPaRateioCompany, type FoodPaRateioPerson } from "../invoice-company";
import type { FoodRateioViewRow } from "../rateio-views";
import { money, moneyCents } from "./format";

const meals = (count: number) => `${count} ${count === 1 ? "refeição" : "refeições"}`;

/** PA: rateio por Empresa (Emissão NF) com a conferência empresas = lote/obrigação. */
export function FoodPaCompanyRateio({ companies, companiesCents, expectedCents, consistent }: { companies: FoodPaRateioCompany[]; companiesCents: number; expectedCents: number; consistent: boolean }) {
  const ok = consistent && companiesCents === expectedCents;
  const columns: DataTableColumn<FoodPaRateioPerson>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "16rem", cell: (person) => <span className="grid min-w-0"><span className="truncate">{person.name}</span><span className="truncate text-caption font-normal text-foreground-muted">{person.department}</span></span> },
    { id: "invoice", header: "Emissão NF", cell: (person) => person.invoiceEmission || "—" },
    { id: "meals", header: "Refeições", numeric: true, cell: (person) => person.meals },
    { id: "amount", header: "Valor", numeric: true, cell: (person) => <strong>{moneyCents(person.amountCents)}</strong> },
  ];
  return (
    <section aria-label="Rateio por empresa" className="grid gap-2">
      <h4 className="text-label text-foreground-muted">Por empresa (Emissão NF)</h4>
      {companies.map((company) => (
        <Disclosure key={company.company} title={<span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-normal">{company.company}{company.company === FOOD_PA_UNIDENTIFIED_COMPANY && <StatusBadge tone="warning">NF fora do padrão</StatusBadge>}</span>} meta={`${company.collaborators} colaboradores · ${meals(company.meals)} · ${moneyCents(company.amountCents)}`}>
          <DataTable caption={`Rateio PA — ${company.company}`} columns={columns} rows={company.people} getRowId={(person) => person.key} density="dense" minWidth="620px" />
        </Disclosure>
      ))}
      <p className={clsx("flex flex-wrap items-center gap-1.5 text-caption tabular-nums", ok ? "text-foreground-muted" : "text-danger-text")} role={ok ? undefined : "alert"}>
        {ok ? <CheckCircle2 size={14} aria-hidden="true" className="text-success-text" /> : <XCircle size={14} aria-hidden="true" />}
        {companies.map((company) => `${company.company} ${moneyCents(company.amountCents)}`).join(" + ")} = {moneyCents(companiesCents)}
        {ok ? " · confere com o total do lote e a obrigação" : ` · diferença de ${moneyCents(expectedCents - companiesCents)}`}
      </p>
    </section>
  );
}

export type FoodSectorGroup = { sector: string; collaborators: number; meals: number; amount: number; people: Array<{ id: string; name: string; meals: number; amount: string }> };

/** Perspectiva Departamento (lista de setores das alocações salvas, como sempre foi). */
export function FoodSectorRateio({ sectors }: { sectors: FoodSectorGroup[] }) {
  type Person = FoodSectorGroup["people"][number];
  const columns: DataTableColumn<Person>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "18rem", cell: (person) => <span className="block truncate">{person.name}</span> },
    { id: "meals", header: "Refeições", numeric: true, cell: (person) => person.meals },
    { id: "amount", header: "Valor", numeric: true, cell: (person) => <strong>{money(person.amount)}</strong> },
  ];
  return (
    <div className="grid gap-2">
      {sectors.map((sector) => (
        <Disclosure key={sector.sector} title={sector.sector} meta={`${sector.collaborators} colaboradores · ${meals(sector.meals)} · ${money(sector.amount)}`}>
          <DataTable caption={`Setor ${sector.sector}`} columns={columns} rows={sector.people} getRowId={(person) => person.id} density="dense" minWidth="480px" />
        </Disclosure>
      ))}
    </div>
  );
}

/** Linhas finais das perspectivas (Centro de Custo / Empresa…): colaborador, NF (PA), refeições e valor salvos. */
export function FoodViewLeaf({ rows, caption }: { rows: AllocationViewRow<FoodRateioViewRow>[]; caption: string }) {
  const columns: DataTableColumn<AllocationViewRow<FoodRateioViewRow>>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "18rem", cell: (row) => <span className="grid min-w-0"><span className="truncate">{row.employeeName}</span>{row.source.invoiceEmission && <span className="text-caption font-normal text-foreground-muted">{row.source.invoiceEmission}</span>}</span> },
    { id: "meals", header: "Refeições", numeric: true, cell: (row) => row.source.meals },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => <strong>{moneyCents(row.cents)}</strong> },
  ];
  return <DataTable caption={caption} columns={columns} rows={rows} getRowId={(row) => row.id} density="dense" minWidth="480px" />;
}
