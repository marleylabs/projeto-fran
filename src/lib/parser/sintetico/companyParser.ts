import type { PdfRow } from "@/lib/pdf/extractRows";
import { rowText } from "@/lib/pdf/extractRows";
import type { SinteticoEmpresa } from "@/lib/types/sintetico";

const DATE_REGEX = /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/g;
const TIME_REGEX = /\d{2}:\d{2}:\d{2}/;

/**
 * Extrai os dados da empresa/período a partir das linhas que não são cabeçalho de
 * tabela nem dado de colaborador. Usa regex tolerante a acentuação corrompida, já
 * que não temos um PDF real para confirmar a codificação exata dos rótulos.
 */
export function parseSinteticoCompanyInfo(otherRows: PdfRow[]): SinteticoEmpresa {
  const empresa: SinteticoEmpresa = {
    codigo: "",
    nome: "",
    departamento: "",
    periodoInicio: "",
    periodoFim: "",
    tipoProcesso: "",
    emissao: "",
    hora: "",
  };

  for (const row of otherRows) {
    const text = rowText(row);

    if (!empresa.nome && /Empresa/i.test(text)) {
      const afterLabel = text.replace(/^.*Empresa\s*:?\s*/i, "");
      const codeMatch = afterLabel.match(/^(\d+)\s*(.*)$/);
      if (codeMatch) {
        empresa.codigo = codeMatch[1];
        empresa.nome = codeMatch[2].trim();
      } else if (afterLabel.trim()) {
        empresa.nome = afterLabel.trim();
      }
    }

    if (!empresa.departamento && /Departamento/i.test(text)) {
      empresa.departamento = text.replace(/^.*Departamento\s*:?\s*/i, "").trim();
    }

    if (!empresa.periodoInicio && /P[eé3]r[ií1]odo/i.test(text)) {
      const dates = text.match(DATE_REGEX);
      if (dates && dates.length >= 2) {
        empresa.periodoInicio = dates[0];
        empresa.periodoFim = dates[1];
      }
    }

    if (!empresa.tipoProcesso && /Tipo\s+Processo/i.test(text)) {
      empresa.tipoProcesso = text.replace(/^.*Tipo\s+Processo\s*:?\s*/i, "").trim();
    }

    if (!empresa.emissao && /Emiss[aã3]o/i.test(text)) {
      const date = text.match(DATE_REGEX);
      const time = text.match(TIME_REGEX);
      if (date) empresa.emissao = date[0];
      if (time) empresa.hora = time[0];
    }
  }

  return empresa;
}
