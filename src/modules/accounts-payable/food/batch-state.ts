export const FOOD_BATCH_EDITABLE_STATUSES = ["UNDER_REVIEW", "WITH_INCONSISTENCIES"] as const;
export type FoodBatchStatus = (typeof FOOD_BATCH_EDITABLE_STATUSES)[number] | "READY";

export function canManageFoodOccurrences(status: FoodBatchStatus) {
  return FOOD_BATCH_EDITABLE_STATUSES.includes(status as (typeof FOOD_BATCH_EDITABLE_STATUSES)[number]);
}

export function isFoodBatchFinalized(status: FoodBatchStatus) {
  return status === "READY";
}
