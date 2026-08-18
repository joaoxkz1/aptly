import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(20,18,56,0.18),0_7px_18px_-10px_rgba(79,70,229,0.9)] hover:brightness-[1.04] active:translate-y-px",
  outline:
    "border border-border bg-card text-foreground shadow-[0_1px_1px_rgba(22,24,35,0.03)] hover:border-primary/25 hover:bg-accent/35",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  destructive:
    "border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  // Default to "button" so buttons inside a <form> never submit it by accident;
  // form submits set type="submit" explicitly.
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
