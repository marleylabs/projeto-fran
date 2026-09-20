-- Garante em nível de banco, não só na aplicação, que Training.supplierId
-- nunca possa divergir de TrainingProposal.supplierId da proposta a que o
-- treinamento pertence. supplierId foi mantido em Training (redundante em
-- relação a Training.proposal.supplierId) por servir a consultas/índices
-- diretos por fornecedor sem precisar de JOIN em toda listagem filtrada
-- (ver Training_supplierId_idx e o filtro de fornecedor em /treinamentos);
-- este trigger fecha o risco de inconsistência que essa redundância abre.
CREATE OR REPLACE FUNCTION training_supplier_matches_proposal() RETURNS trigger AS $$
DECLARE
  proposal_supplier_id TEXT;
BEGIN
  SELECT "supplierId" INTO proposal_supplier_id FROM "TrainingProposal" WHERE "id" = NEW."proposalId";
  IF proposal_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Proposta % não encontrada para o treinamento.', NEW."proposalId";
  END IF;
  IF proposal_supplier_id <> NEW."supplierId" THEN
    RAISE EXCEPTION 'Training.supplierId (%) diverge de TrainingProposal.supplierId (%) para a proposta %.',
      NEW."supplierId", proposal_supplier_id, NEW."proposalId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_supplier_guard
  BEFORE INSERT OR UPDATE OF "supplierId", "proposalId" ON "Training"
  FOR EACH ROW
  EXECUTE FUNCTION training_supplier_matches_proposal();
