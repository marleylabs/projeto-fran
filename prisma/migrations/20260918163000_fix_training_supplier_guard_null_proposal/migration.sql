-- Corrige training_supplier_matches_proposal(): a versão original (migration
-- 20260918150000_training_supplier_guard) assumia que Training.proposalId
-- sempre existe. Desde 20260918160000_training_expense_module, proposalId é
-- opcional (cadastro manual, origin=MANUAL) — a versão antiga bloqueava
-- indevidamente qualquer INSERT com proposalId NULL, mesmo válido. Quando não
-- há proposta, não há o que validar contra ela: a integridade nesse caso já é
-- garantida pelo CHECK training_origin_consistency (MANUAL não exige proposta).
CREATE OR REPLACE FUNCTION training_supplier_matches_proposal() RETURNS trigger AS $$
DECLARE
  proposal_supplier_id TEXT;
BEGIN
  IF NEW."proposalId" IS NULL THEN
    RETURN NEW;
  END IF;
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
