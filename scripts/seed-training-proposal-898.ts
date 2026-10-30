// Seed pontual: importa a proposta 898 do fornecedor Massariol (dados fixos em src/modules/trainings/seed-data.ts)
// via importTrainingProposal. Uso: npx tsx scripts/seed-training-proposal-898.ts.
// O fornecedor precisa existir no cadastro; registros já importados são contados em "Já existentes" (não duplica).
// TrainingImportError indica erro de negócio (ex.: fornecedor ausente) e é exibido sem stack.
import "dotenv/config";
import { importTrainingProposal, TrainingImportError } from "../src/modules/trainings/server";
import { MASSARIOL_PROPOSAL_898 } from "../src/modules/trainings/seed-data";

async function main() {
  const summary = await importTrainingProposal(MASSARIOL_PROPOSAL_898);
  console.log(`Fornecedor encontrado: 1 (${summary.supplierName}, id=${summary.supplierId})`);
  console.log("Propostas criadas:", summary.proposalsCreated);
  console.log("Treinamentos criados:", summary.trainingsCreated);
  console.log("Já existentes:", summary.alreadyExisting);
  console.log("Erros:", summary.errors);
}

main().catch((err) => {
  if (err instanceof TrainingImportError) {
    console.error("Falha na importação:", err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
