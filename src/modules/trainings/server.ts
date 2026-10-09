import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { TrainingValidationError, type ManualTrainingInput, type TrainingUpdateInput } from "./schema";
import type { TrainingProposalSeed } from "./seed-data";

export class TrainingImportError extends Error {}

export type TrainingImportSummary = {
  supplierId: string;
  supplierName: string;
  proposalId: string;
  proposalNumber: string;
  proposalsCreated: number;
  trainingsCreated: number;
  alreadyExisting: number;
  errors: number;
};

// Idempotente por CRIAÇÃO, não por upsert: um registro que já existe (proposta ou
// item) nunca é sobrescrito, mesmo que seus valores tenham sido alterados
// manualmente depois da primeira importação. Rodar de novo só cria o que
// ainda não existe e contabiliza o resto como "já existente" — nunca reverte
// uma edição posterior do usuário. A chave lógica de duplicidade continua
// sendo a constraint única [supplierId, proposalId, sourceItemId] do banco.
export async function importTrainingProposal(seed: TrainingProposalSeed): Promise<TrainingImportSummary> {
  const digits = seed.supplierCnpj.replace(/\D/g, "");
  const supplier = await prisma.administrativeEntity.findFirst({ where: { cnpj: digits } });
  if (!supplier) {
    throw new TrainingImportError(
      `Fornecedor com CNPJ ${seed.supplierCnpj} não encontrado. Cadastre-o em /cadastros antes de importar a proposta.`
    );
  }

  return prisma.$transaction(
    async (tx) => {
      let proposal = await tx.trainingProposal.findUnique({
        where: { supplierId_proposalNumber: { supplierId: supplier.id, proposalNumber: seed.proposalNumber } },
      });
      let proposalsCreated = 0;

      if (!proposal) {
        proposal = await tx.trainingProposal.create({
          data: {
            supplierId: supplier.id,
            proposalNumber: seed.proposalNumber,
            proposalDate: new Date(seed.proposalDate),
            validityDays: seed.validityDays,
            clientName: seed.clientName,
          },
        });
        proposalsCreated = 1;
      }
      // Proposta já existente: reutilizada como está — nem os campos da
      // proposta (data, validade, cliente) nem os treinamentos dela são
      // sobrescritos por uma reimportação.

      let trainingsCreated = 0;
      let alreadyExisting = 0;

      for (const item of seed.items) {
        const key = {
          supplierId_proposalId_sourceItemId: {
            supplierId: proposal.supplierId,
            proposalId: proposal.id,
            sourceItemId: item.sourceItemId,
          },
        };
        const existing = await tx.training.findUnique({ where: key });
        if (existing) {
          alreadyExisting += 1;
          continue;
        }
        await tx.training.create({
          data: {
            // supplierId é sempre derivado da proposta, nunca do item de
            // origem — garante que Training.supplierId e
            // Training.proposal.supplierId nunca possam divergir.
            supplierId: proposal.supplierId,
            proposalId: proposal.id,
            sourceItemId: item.sourceItemId,
            description: item.description,
            trainingType: item.trainingType,
            duration: item.duration,
            modality: item.modality,
            attendanceType: item.attendanceType,
            additionalStudentPrice: new Prisma.Decimal(item.additionalStudentPrice),
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            totalPrice: new Prisma.Decimal(item.totalPrice),
          },
        });
        trainingsCreated += 1;
      }

      return {
        supplierId: supplier.id,
        supplierName: supplier.tradeName,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        proposalsCreated,
        trainingsCreated,
        alreadyExisting,
        errors: 0,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

// Cadastro manual do catálogo (origin=MANUAL). Fornecedor é sempre validado
// contra AdministrativeEntity real; proposta é opcional e, se informada,
// precisa pertencer ao mesmo fornecedor.
export async function createManualTraining(input: ManualTrainingInput) {
  const supplier = await prisma.administrativeEntity.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new TrainingValidationError("Fornecedor não encontrado.");

  if (input.proposalId) {
    const proposal = await prisma.trainingProposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) throw new TrainingValidationError("Proposta não encontrada.");
    if (proposal.supplierId !== supplier.id) throw new TrainingValidationError("A proposta selecionada não pertence a este fornecedor.");
  }

  return prisma.training.create({
    data: {
      supplierId: supplier.id,
      proposalId: input.proposalId,
      sourceItemId: null,
      origin: "MANUAL",
      description: input.description,
      trainingType: input.trainingType,
      duration: input.duration,
      modality: input.modality,
      attendanceType: input.attendanceType,
      additionalStudentPrice: new Prisma.Decimal(input.additionalStudentPrice),
      quantity: input.quantity,
      unitPrice: new Prisma.Decimal(input.unitPrice),
      totalPrice: new Prisma.Decimal(input.totalPrice),
    },
    include: { supplier: true, proposal: true },
  });
}

export async function listTrainingProposalsBySupplier(supplierId: string) {
  return prisma.trainingProposal.findMany({ where: { supplierId }, orderBy: { proposalDate: "desc" } });
}

export type TrainingListFilters = {
  query?: string;
  supplierId?: string;
  modality?: string;
  attendanceType?: string;
  active?: boolean;
};

export async function listTrainings(filters: TrainingListFilters) {
  const items = await prisma.training.findMany({
    where: {
      supplierId: filters.supplierId,
      modality: filters.modality,
      attendanceType: filters.attendanceType,
      active: filters.active,
      ...(filters.query
        ? { description: { contains: filters.query, mode: "insensitive" } }
        : {}),
    },
    include: { supplier: { select: { id: true, legalName: true, tradeName: true } }, proposal: { select: { id: true, proposalNumber: true, proposalDate: true } } },
    orderBy: [{ supplierId: "asc" }, { sourceItemId: "asc" }],
  });

  const facets = await prisma.training.findMany({ select: { modality: true, attendanceType: true } });
  return {
    items,
    filters: {
      modalities: [...new Set(facets.map((item) => item.modality))].sort(),
      attendanceTypes: [...new Set(facets.map((item) => item.attendanceType))].sort(),
    },
  };
}

export async function getTraining(id: string) {
  return prisma.training.findUnique({
    where: { id },
    include: { supplier: true, proposal: true },
  });
}

// supplierId nunca é aceito em TrainingUpdateInput (ver schema.ts) — o
// fornecedor de um treinamento só pode mudar indiretamente, movendo-o para
// outra proposta, o que também não é permitido por esta função. Isso
// mantém a invariante Training.supplierId === Training.proposal.supplierId
// sempre verdadeira para qualquer edição feita pela aplicação.
export async function updateTraining(id: string, input: TrainingUpdateInput) {
  const existing = await prisma.training.findUnique({ where: { id } });
  if (!existing) throw new TrainingValidationError("Treinamento não encontrado.");

  return prisma.training.update({
    where: { id },
    data: {
      description: input.description,
      trainingType: input.trainingType,
      duration: input.duration,
      modality: input.modality,
      attendanceType: input.attendanceType,
      quantity: input.quantity,
      additionalStudentPrice: input.additionalStudentPrice !== undefined ? new Prisma.Decimal(input.additionalStudentPrice) : undefined,
      unitPrice: input.unitPrice !== undefined ? new Prisma.Decimal(input.unitPrice) : undefined,
      totalPrice: input.totalPrice !== undefined ? new Prisma.Decimal(input.totalPrice) : undefined,
    },
    include: { supplier: true, proposal: true },
  });
}

export async function setTrainingActive(id: string, active: boolean) {
  const existing = await prisma.training.findUnique({ where: { id } });
  if (!existing) throw new TrainingValidationError("Treinamento não encontrado.");
  return prisma.training.update({ where: { id }, data: { active } });
}
