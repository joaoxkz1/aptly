import { cn } from "@/lib/utils";

export interface BarDatum {
  label: string;
  value: number;
  sublabel?: string;
  colorClass?: string; // tailwind bg-* class
}

export function BarList({
  data,
  unit,
  className,
}: {
  data: BarDatum[];
  unit?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{d.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {d.value}
              {unit !== undefined ? ` ${unit}` : ""}
              {d.sublabel !== undefined ? ` · ${d.sublabel}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-700", d.colorClass ?? "bg-primary")}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      )}
    </div>
  );
}
