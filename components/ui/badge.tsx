import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/80 px-2.5 py-1 text-[11px] font-semibold leading-none text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
