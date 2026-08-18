"use client";

import { useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { EconomicsCourseLevel } from "@/lib/assessment/course-level";
import { cn } from "@/lib/utils";

export function EconomicsCourseSelector({
  initialLevel = null,
  onSaved,
  compact = false,
}: {
  initialLevel?: EconomicsCourseLevel | null;
  onSaved?: (level: EconomicsCourseLevel) => void;
  compact?: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [selected, setSelected] = useState<EconomicsCourseLevel | null>(initialLevel);
  const [saving, setSaving] = useState<EconomicsCourseLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(level: EconomicsCourseLevel) {
    if (saving !== null) return;
    setSaving(level);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { economics_level: level },
    });
    if (updateError === null) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError === null) {
        setSelected(level);
        setSaving(null);
        onSaved?.(level);
        return;
      }
    }
    setSaving(null);
    setError("We couldn't save your course. Please try again.");
  }

  return (
    <div className={cn("flex flex-col gap-2", compact ? "items-start" : "w-full")}>
      <div className="flex gap-2" role="group" aria-label="IB Economics course level">
        {(["sl", "hl"] as const).map((level) => {
          const active = selected === level;
          return (
            <Button
              key={level}
              type="button"
              variant={active ? "primary" : "outline"}
              size={compact ? "sm" : "lg"}
              aria-pressed={active}
              disabled={saving !== null}
              onClick={() => void save(level)}
              className={cn(!compact && "min-w-24")}
            >
              {saving === level && <Loader2 className="h-4 w-4 animate-spin" />}
              {level.toUpperCase()}
            </Button>
          );
        })}
      </div>
      {error !== null && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <CircleAlert className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
