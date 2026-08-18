import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-br from-primary via-primary to-violet-700 text-primary-foreground shadow-[0_6px_18px_-8px_rgba(79,70,229,0.9)]",
        className
      )}
    >
      <span className="text-[17px] font-bold leading-none tracking-[-0.08em]">A</span>
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border border-white/70 bg-white/25" />
    </span>
  );
}
