export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      <div className="flex justify-between text-sm text-text-muted">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-surface-soft overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}
