// Dados de origem comercial — não é lógica de importação. Cada nova proposta
// (deste ou de outro fornecedor) deve ganhar seu próprio arquivo de dados,
// nunca ser misturada aqui, para manter o motor de importação independente
// da Massariol.
//
// Valores preservados literalmente do documento de origem, sem normalização:
// "additionalStudentPrice" (valor para incluir aluno adicional) e "unitPrice"
// (valor unitário do treinamento) são colunas distintas do orçamento e
// divergem intencionalmente nos itens 17, 25 e 26 — não "corrigir".
export type TrainingSeedItem = {
  sourceItemId: number;
  description: string;
  trainingType: string;
  duration: string;
  modality: string;
  attendanceType: string;
  additionalStudentPrice: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
};

export type TrainingProposalSeed = {
  supplierCnpj: string;
  proposalNumber: string;
  proposalDate: string;
  validityDays: number;
  clientName: string;
  items: TrainingSeedItem[];
};

export const MASSARIOL_PROPOSAL_898: TrainingProposalSeed = {
  supplierCnpj: "65082906000148",
  proposalNumber: "898",
  proposalDate: "2026-08-28",
  validityDays: 30,
  clientName: "PROJETA",
  items: [
    { sourceItemId: 1, description: "PRO RAC 01 - 026780 - TRABALHO EM ALTURA_METAIS BASICOS - REV. 30.06.2023", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 2, description: "NOCOES DE PRIMEIROS SOCORROS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 3, description: "NR 06_EQUIPAMENTO DE PROTECAO INDIVIDUAL - EPI", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 4, description: "NR 10 - SEGURANCA NO SISTEMA ELETRICO DE POTENCIA - SEP", trainingType: "PERIODICO", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "239.96", quantity: 1, unitPrice: "239.96", totalPrice: "239.96" },
    { sourceItemId: 5, description: "NR 10_SEGURANCA EM INSTALACOES E SERVICOS COM ELETRICIDADE - BASICO", trainingType: "PERIODICO", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "239.96", quantity: 1, unitPrice: "239.96", totalPrice: "239.96" },
    { sourceItemId: 6, description: "NR 11 - TRANSPORTE, MOVIMENTACAO, ARMAZENAGEM E MANUSEIO DE MATERIAIS", trainingType: "INICIAL", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "99.96", quantity: 1, unitPrice: "99.96", totalPrice: "99.96" },
    { sourceItemId: 7, description: "NR 12 - SEGURANCA NO TRABALHO EM MAQUINAS E EQUIPAMENTOS", trainingType: "INICIAL", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "99.96", quantity: 1, unitPrice: "99.96", totalPrice: "99.96" },
    { sourceItemId: 8, description: "NR 18 - SEGURANCA E SAUDE NO TRABALHO NA INDUSTRIA DA CONSTRUCAO", trainingType: "INICIAL", duration: "04 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "79.98", quantity: 1, unitPrice: "79.98", totalPrice: "79.98" },
    { sourceItemId: 9, description: "NR 22 - SEGURANCA E SAUDE OCUPACIONAL NA MINERACAO", trainingType: "INICIAL", duration: "16 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "199.92", quantity: 1, unitPrice: "199.92", totalPrice: "199.92" },
    { sourceItemId: 10, description: "NR 22 INTRODUTORIO - TREINAMENTOS PARA FORNECEDORES DO CORREDOR NORTE", trainingType: "INICIAL", duration: "24 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "215.88", quantity: 1, unitPrice: "215.88", totalPrice: "215.88" },
    { sourceItemId: 11, description: "NR 33 - SEGURANCA E SAUDE NOS TRABALHOS EM ESPACOS CONFINADOS PARA VIGIA E TRABALHADOR AUTORIZADO", trainingType: "PERIODICO", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "151.96", quantity: 1, unitPrice: "151.96", totalPrice: "151.96" },
    { sourceItemId: 12, description: "NR 33 - SEGURANÇA E SAUDE NOS TRABALHOS EM ESPACOS CONFINADOS PARA SUPERVISOR DE ENTRADA", trainingType: "PERIODICO", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "151.96", quantity: 1, unitPrice: "151.96", totalPrice: "151.96" },
    { sourceItemId: 13, description: "NR 35_SEGURANCA E SAUDE NO TRABALHO EM ALTURA", trainingType: "INICIAL", duration: "08 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "99.96", quantity: 1, unitPrice: "99.96", totalPrice: "99.96" },
    { sourceItemId: 14, description: "PRO 040866 - REV. 05 - PROCEDIMENTO UNIFICADO VALE BRASIL PARA TRABALHO EM ALTURA", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 15, description: "PRO RAC 02 - 025917 - PLANO DE TRANSITO - METAIS BASICOS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 16, description: "PRO RAC 02 039864 - REV. 05 - PLANO DE TRANSITO UNIFICADO VALE BRASIL (MÓDULO I)", trainingType: "INICIAL", duration: "01:30", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.99", quantity: 1, unitPrice: "49.99", totalPrice: "49.99" },
    { sourceItemId: 17, description: "PRO RAC 02_028017 - PROGRAMA DE PREVENCAO DE FADIGA_METAIS BASICOS", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "50.00", quantity: 1, unitPrice: "49.99", totalPrice: "49.99" },
    { sourceItemId: 18, description: "PRO RAC 03 040169 - PROCEDIMENTO UNIFICADO VALE BRASIL PARA OPERACAO DE EQUIPAMENTOS MOVEIS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 19, description: "PRO RAC 04 040948 - REV.: 07 - PROCEDIMENTO UNIFICADO PARA BLOQUEIO, IDENTIFICAÇÃO, ETIQUETAGEM E ZERO ENERGIA", trainingType: "INICIAL", duration: "04 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "79.98", quantity: 1, unitPrice: "79.98", totalPrice: "79.98" },
    { sourceItemId: 20, description: "PRO RAC 05 039979 - PROCEDIMENTO UNIFICADO VALE BRASIL PARA ICAMENTO DE CARGA", trainingType: "INICIAL", duration: "04 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "79.98", quantity: 1, unitPrice: "79.98", totalPrice: "79.98" },
    { sourceItemId: 21, description: "PRO RAC 05_026709_DIRETRIZES DE ICAMENTO DE CARGAS_METAIS BASICOS_REV.04_25.06.2024", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 22, description: "PRO RAC 06 041278 - PROCEDIMENTO UNIFICADO VALE BRASIL PARA ESPACOS CONFINADOS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 23, description: "PRO RAC 06_026120_TRABALHO EM ESPACO CONFINADO_REV.03_27/03/2025", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 24, description: "PRO RAC 07 041860 - PROCEDIMENTO UNIFICADO PARA PROTECAO DE MAQUINAS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 25, description: "PRO RAC 10 041951 REV.: 03 PROCEDIMENTO INTEGRADO DE FERROSOS PARA TRABALHOS EM ELETRICIDADE", trainingType: "INICIAL", duration: "03:30", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "74.99", quantity: 1, unitPrice: "74.98", totalPrice: "74.98" },
    { sourceItemId: 26, description: "PSA - PRIMEIROS SOCORROS AVANCADO", trainingType: "INICIAL", duration: "24 HORAS", modality: "PRESENCIAL", attendanceType: "INDIVIDUAL", additionalStudentPrice: "479.88", quantity: 1, unitPrice: "1679.88", totalPrice: "1679.88" },
    { sourceItemId: 27, description: "RAC 01 GLOBAL - TRABALHO EM ALTURA", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.95", quantity: 1, unitPrice: "49.95", totalPrice: "49.95" },
    { sourceItemId: 28, description: "RAC 02 GLOBAL VEICULOS AUTOMOTORES", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.95", quantity: 1, unitPrice: "49.95", totalPrice: "49.95" },
    { sourceItemId: 29, description: "RAC 03 - GLOBAL EQUIPAMENTOS MOVEIS", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.95", quantity: 1, unitPrice: "49.95", totalPrice: "49.95" },
    { sourceItemId: 30, description: "RAC 04 - GLOBAL BLOQUEIO E ETIQUETAGEM E ZERO", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.95", quantity: 1, unitPrice: "49.95", totalPrice: "49.95" },
    { sourceItemId: 31, description: "RAC 05 GLOBAL - ICAMENTO DE CARGA", trainingType: "INICIAL", duration: "01 HORA", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "49.95", quantity: 1, unitPrice: "49.95", totalPrice: "49.95" },
    { sourceItemId: 32, description: "RAC 06 GLOBAL ESPACOS CONFINADOS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 33, description: "RAC 07 - GLOBAL PROTECAO DE MAQUINAS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 34, description: "RAC 08 GLOBAL ATIVIDADES NO TERRENO", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 35, description: "RAC 09 GLOBAL EXPLOSIVOS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 36, description: "RAC 10 GLOBAL TRABALHOS EM ELETRICIDADE", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 37, description: "RAC 11 GLOBAL METAIS LIQUIDOS", trainingType: "INICIAL", duration: "02 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "59.99", quantity: 1, unitPrice: "59.99", totalPrice: "59.99" },
    { sourceItemId: 38, description: "TREINAMENTO BASICO DE SAUDE, SEGURANCA E MEIO AMBIENTE - TBSSMA", trainingType: "INICIAL", duration: "04 HORAS", modality: "PRESENCIAL", attendanceType: "EM TURMA", additionalStudentPrice: "79.99", quantity: 1, unitPrice: "79.99", totalPrice: "79.99" },
  ],
};
