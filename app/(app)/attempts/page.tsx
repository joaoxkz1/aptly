"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/score-ring";
import { useAttempts } from "@/lib/storage";
import { SUBJECTS, SUBJECT_BADGE } from "@/lib/subjects";
import type { Subject } from "@/lib/types";
import { attemptMetaLine } from "@/lib/assessment/display";
import { cn, formatDateTime } from "@/lib/utils";

export default function AttemptsPage() {
  const { attempts, ready, clearAll, resetDemo } = useAttempts();
  const [filter, setFilter] = useState<Subject | "All">("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = filter === "All" ? attempts : attempts.filter((a) => a.subject === filter);

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearAll();
    setConfirmClear(false);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aptly-attempts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attempts log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every graded answer, stored locally in your browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={attempts.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={resetDemo}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset demo data
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={attempts.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmClear ? "Click again to confirm" : "Clear all"}
          </Button>
        </div>
      </div>

      {/* Subject filter */}
      <div className="flex flex-wrap gap-2">
        {(["All", ...SUBJECTS] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((a) => {
          const open = expanded === a.id;
          return (
            <Card key={a.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : a.id)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <ScoreRing score={a.feedback.score} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{a.topic}</span>
                    <Badge className={SUBJECT_BADGE[a.subject]}>{a.subject}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.assessment != null
                      ? attemptMetaLine(a.assessment)
                      : `${a.feedback.mistakes[0] ?? "No mistakes detected"} · ${a.feedback.examinerComment.split(".")[0]}.`}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  <span className="text-xs font-medium">{a.feedback.band}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180"
                  )}
                />
              </button>
              {open && (
                <CardContent className="border-t border-border bg-muted/40 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Question
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{a.question}</p>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Your answer
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {a.answer}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Mistakes detected
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {a.feedback.mistakes.length > 0 ? (
                          a.feedback.mistakes.map((m) => (
                            <Badge
                              key={m}
                              className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
                            >
                              {m}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Examiner comment
                      </p>
                      <p className="mt-1.5 text-sm italic leading-relaxed text-muted-foreground">
                        {a.feedback.examinerComment}
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {ready && visible.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {attempts.length === 0
                  ? "No attempts saved yet."
                  : `No ${filter} attempts yet.`}
              </p>
              <Link
                href="/submit"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <PenLine className="h-4 w-4" />
                Submit an answer
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
