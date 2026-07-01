"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkPill } from "@/components/assessment/mark-pill";
import { useAttempts } from "@/lib/storage";
import { SUBJECT_BADGE } from "@/lib/subjects";
import { attemptMetaLine, topicDisplayLabel } from "@/lib/assessment/display";
import { cn, formatDateTime } from "@/lib/utils";

// Demo/destructive tooling is for local development only — never shown to
// production students. Export/Clear are preserved here for internal use only.
const IS_DEV = process.env.NODE_ENV === "development";

export default function AttemptsPage() {
  const { attempts, ready, clearAll, resetDemo } = useAttempts();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

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

  function topicOf(a: (typeof attempts)[number]): string {
    if (a.assessment != null && a.assessment.syllabusTopic !== "unknown") {
      return topicDisplayLabel(a.assessment.syllabusTopic);
    }
    return a.assessment?.topicLabel || a.topic;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Learning log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every answer you submit, saved privately to your Aptly account.
          </p>
        </div>
        {/* Developer-only tools — hidden from students. */}
        {IS_DEV && (
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
        )}
      </div>

      <div className="flex flex-col gap-3">
        {attempts.map((a) => {
          const open = expanded === a.id;
          return (
            <Card key={a.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : a.id)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <MarkPill attempt={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{topicOf(a)}</span>
                    <Badge className={SUBJECT_BADGE[a.subject]}>{a.subject}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{attemptMetaLine(a)}</p>
                </div>
                <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {formatDateTime(a.createdAt)}
                </span>
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

        {ready && attempts.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">No answers saved yet.</p>
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
