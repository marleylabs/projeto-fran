import type { PayrollExtractionResult } from "@/lib/parser/router";

interface ApiError {
  error: string;
}

export interface DuplicateExisting {
  id: string;
  fileName: string;
  createdAt: string;
  totalColaboradores: number;
  liquidoGeral: number;
}

export type UploadOutcome =
  | { status: "ok"; data: PayrollExtractionResult }
  | { status: "duplicate"; existing: DuplicateExisting; result: PayrollExtractionResult };

/** Upload via XHR (em vez de fetch) para termos acesso ao evento de progresso de envio. */
export function uploadPdf(
  file: File,
  onUploadProgress: (percent: number) => void,
  duplicateAction?: "replace" | "keep_both"
): Promise<UploadOutcome> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/extract");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      let body: PayrollExtractionResult | ApiError | { duplicate: true; existing: DuplicateExisting; result: PayrollExtractionResult };
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Resposta inválida do servidor."));
        return;
      }

      if (xhr.status === 409 && "duplicate" in body) {
        resolve({ status: "duplicate", existing: body.existing, result: body.result });
      } else if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: "ok", data: body as PayrollExtractionResult });
      } else {
        reject(new Error((body as ApiError).error ?? "Falha ao processar o PDF."));
      }
    };

    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo."));

    const formData = new FormData();
    formData.append("file", file);
    if (duplicateAction) formData.append("duplicateAction", duplicateAction);
    xhr.send(formData);
  });
}
