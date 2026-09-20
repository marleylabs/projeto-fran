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
