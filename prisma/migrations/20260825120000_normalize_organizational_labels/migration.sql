-- Padronização exclusivamente textual. IDs, ocorrências e valores financeiros não são alterados.
UPDATE "FoodEmployee"
SET department = upper(regexp_replace(trim(department), '\s+', ' ', 'g')),
    "costCenter" = upper(regexp_replace(trim("costCenter"), '\s+', ' ', 'g'));

UPDATE "FoodMealOccurrence"
SET "receivedDepartment" = upper(regexp_replace(trim("receivedDepartment"), '\s+', ' ', 'g')),
    "confirmedDepartment" = CASE WHEN "confirmedDepartment" IS NULL THEN NULL ELSE upper(regexp_replace(trim("confirmedDepartment"), '\s+', ' ', 'g')) END;

UPDATE "FoodAllocation"
SET department = upper(regexp_replace(trim(department), '\s+', ' ', 'g'));

UPDATE "TransitVoucherAllocation"
SET department = CASE WHEN department IS NULL THEN NULL ELSE upper(regexp_replace(trim(department), '\s+', ' ', 'g')) END,
    "costCenter" = CASE WHEN "costCenter" IS NULL THEN NULL ELSE upper(regexp_replace(trim("costCenter"), '\s+', ' ', 'g')) END;
