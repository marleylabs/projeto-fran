ALTER TABLE "FoodMealOccurrence"
  ALTER COLUMN "occurredOn" DROP NOT NULL,
  ADD COLUMN "mealQuantity" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FoodMealOccurrence"
  ADD CONSTRAINT "FoodMealOccurrence_mealQuantity_check" CHECK ("mealQuantity" >= 1);
