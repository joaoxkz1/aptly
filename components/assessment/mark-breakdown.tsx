import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import type { Assessment } from "@/lib/types";

/** Per-category awarded / available list (covers assessable marks only). */
export function MarkBreakdown({ assessment }: { assessment: Assessment }) {
  const items = assessment.markBreakdown;
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Aptly diagnostic breakdown
        </CardTitle>
        <CardDescription>
          Aptly&apos;s diagnostic estimate of where marks were won and lost — not an official IB
          markscheme.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const full = item.awarded === item.available;
          return (
            <div key={item.label} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              </div>
              <span
                className={
                  "shrink-0 text-sm font-semibold tabular-nums " +
                  (full ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")
                }
              >
                {item.awarded}/{item.available}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
