import { cn } from "@/lib/utils";

export function scoreColor(score: number) {
  if (score >= 6) return "text-emerald-500";
  if (score >= 5) return "text-sky-500";
  if (score >= 4) return "text-amber-500";
  return "text-rose-500";
}

export function ScoreRing({
  score,
  max = 7,
  size = 88,
  className,
}: {
  score: number;
  max?: number;
  size?: number;
  className?: string;
}) {
  const stroke = size > 60 ? 7 : 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / max) * circ;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          className={cn("transition-all duration-700", scoreColor(score))}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-semibold leading-none", size > 60 ? "text-2xl" : "text-sm")}>
          {score}
        </span>
        {size > 60 && <span className="mt-0.5 text-[10px] text-muted-foreground">/ {max}</span>}
      </div>
    </div>
  );
}
