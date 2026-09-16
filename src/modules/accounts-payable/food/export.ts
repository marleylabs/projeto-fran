import "server-only";
import { Prisma } from "@/generated/prisma";
import { exportFoodRateio } from "./rateio-export";

type ExportBatch = Prisma.FoodBatchGetPayload<{ include: { competence: true; administrativeEntity: true; allocations: true; mealOccurrences: true; issues: true } }>;

export async function exportFoodBatch(batch: ExportBatch) {
  return exportFoodRateio(batch);
}

export { exportFoodConsolidated } from "./consolidated-export";
