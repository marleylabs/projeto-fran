-- CPF do colaborador (cadastro-base FoodEmployee). Migration ADITIVA: coluna nullable, então todos
-- os colaboradores existentes ficam com cpf = NULL. Persistido só com os 11 dígitos.
-- UNIQUE: um CPF identifica uma única pessoa; no PostgreSQL vários NULL não conflitam entre si.
ALTER TABLE "FoodEmployee" ADD COLUMN "cpf" TEXT;

CREATE UNIQUE INDEX "FoodEmployee_cpf_key" ON "FoodEmployee"("cpf");
