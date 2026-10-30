import "server-only";
// Fachada de exportação de Alimentação usada pelas rotas de download (por lote e consolidado).
// O download de um lote é o XLSX de rateio (rateio-export.ts).
import { Prisma } from "@/generated/prisma";
import { exportFoodRateio } from "./rateio-export";

// Lote com todas as relações que o rateio precisa.
type ExportBatch = Prisma.FoodBatchGetPayload<{ include: { competence: true; administrativeEntity: true; allocations: true; mealOccurrences: true; issues: true } }>;

/** Gera o XLSX de rateio de um lote; `cycles` opcional limita/rotula os ciclos MA exportados. */
export async function exportFoodBatch(batch: ExportBatch & { cycles?: number[] }) {
  return exportFoodRateio(batch);
}

export { exportFoodConsolidated } from "./consolidated-export";
