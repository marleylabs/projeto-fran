-- Data de Admissão do colaborador (cadastro-base FoodEmployee). Migration ADITIVA: coluna DATE
-- nullable (sem hora/timezone); colaboradores existentes ficam com NULL — nenhuma data fictícia.
-- Sem UNIQUE: várias pessoas podem ter a mesma data, e ela não identifica o colaborador.
ALTER TABLE "FoodEmployee" ADD COLUMN "admissionDate" DATE;
