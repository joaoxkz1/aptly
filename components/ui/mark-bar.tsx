"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A single horizontal progress bar that fills once when it first mounts.
 *
 * Display-only: `percent` is the already-computed value from canonical
 * insights — this component never recomputes, rounds, or stores it. The fill
 * is transform-based (origin-left scaleX) so growing it causes no layout
 * shift, and it animates a single time on mount (entering the page), not on
 * hover, rerenders, or in-page tab clicks. `prefers-reduced-motion` shows the
 * final value instantly with no animation.
 */
export function MarkBar({
  percent,
  colorClass = "bg-primary",
  delayMs = 0,
  className,
}: {
  percent: number;
  colorClass?: string;
  delayMs?: number;
  className?: string;
}) {
  const target = Math.max(0, Math.min(100, percent)) / 100;
  // Both flags flip together on the first frame after mount (never synchronously
  // in the effect body), so the bar paints empty once, then either animates or —
  // under reduced motion — snaps straight to its final value.
  const [state, setState] = useState({ grown: false, reduce: false });

  useEffect(() => {
    const prefersReduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() => setState({ grown: true, reduce: prefersReduce }));
    return () => cancelAnimationFrame(id);
  }, []);

  const { grown, reduce } = state;

  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full origin-left rounded-full", colorClass)}
        style={{
          width: "100%",
          transform: `scaleX(${grown ? target : 0})`,
          transition: reduce ? "none" : "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDelay: reduce ? "0ms" : `${delayMs}ms`,
        }}
      />
    </div>
  );
}
