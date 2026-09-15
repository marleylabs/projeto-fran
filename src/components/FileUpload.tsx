"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { UploadCloud } from "lucide-react";

interface Props {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function FileUpload({ onFileSelected, disabled }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <div className="card w-full max-w-xl overflow-hidden">
      <div className="px-6 pt-5 pb-1">
        <h2 className="text-base font-semibold text-foreground">Importar folha de pagamento</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Envie o PDF do &quot;Extrato Mensal&quot; ou do &quot;Relatório Sintético&quot; para extrair os dados automaticamente.
        </p>
      </div>

      <div className="px-6 pb-6 pt-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          className={clsx(
            "rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors",
            dragActive ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-soft",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-primary">
            <UploadCloud className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium text-foreground">Arraste o PDF aqui ou clique para selecionar</p>
          <button type="button" className="btn btn-primary btn-sm mt-1" disabled={disabled}>
            Selecionar arquivo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={disabled}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        <p className="text-xs text-text-subtle mt-3 text-center">Formato PDF · tamanho máximo de 30MB</p>
      </div>
    </div>
  );
}
