"use client";


interface CorporateHeaderProps {
  currentUserEmail: string | null;
  showNewUpload?: boolean;
  onNewUpload?: () => void;
  onLogout: () => void;
}

export function CorporateHeader({
  showNewUpload = false,
  onNewUpload,
}: CorporateHeaderProps) {
  return showNewUpload&&onNewUpload?<div className="flex justify-end px-4 pt-4 sm:px-6"><button onClick={onNewUpload} className="text-sm font-semibold text-primary hover:text-primary-hover">+ Novo upload</button></div>:null;
}
