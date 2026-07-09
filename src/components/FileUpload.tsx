"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

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
        "card w-full max-w-xl border-2 border-dashed p-10 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors",
        dragActive ? "border-primary bg-surface-soft" : "border-border",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <div className="w-14 h-14 rounded-full bg-surface-soft flex items-center justify-center text-primary text-2xl font-bold">
        ↑
      </div>
      <p className="text-base font-semibold text-foreground">Arraste o PDF do Extrato Mensal aqui</p>
      <p className="text-sm text-text-muted">ou clique para selecionar o arquivo (.pdf)</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
