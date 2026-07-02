"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Loader2, PenLine, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkPill } from "@/components/assessment/mark-pill";
import { useAttempts } from "@/lib/storage";
import { SUBJECT_BADGE } from "@/lib/subjects";
import {
  APTLY_PRACTICE_LABEL,
  REVISION_ATTEMPT_LABEL,
  attemptMetaLine,
  topicDisplayLabel,
} from "@/lib/assessment/display";
import {
  SOURCE_MATERIAL_MISSING_NOTICE,
  isSourceMaterialMissing,
  presentedFeedback,
} from "@/lib/assessment/status";
import { cn, formatDateTime } from "@/lib/utils";

export default function AttemptsPage() {
  const { attempts, ready, removeAttempt } = useAttempts();
  const [expanded, setExpanded] = useState<string | null>(null);
  // Per-attempt delete flow: which row is asking for confirmation, which is
  // mid-delete, and which failed (kept visible — never optimistic).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);

  async function confirmDelete(id: string) {
    if (deletingId !== null) return;
    setDeletingId(id);
    setDeleteErrorId(null);
    try {
      // Deletes ONLY this one attempt (RLS-scoped to this user). The row
      // leaves the log, Dashboard, and Analytics via the storage resync only
      // after the delete actually succeeds.
      await removeAttempt(id);
      setPendingDeleteId(null);
      setExpanded((cur) => (cur === id ? null : cur));
    } catch {
      // Honest failure: the attempt stays visible with a retryable message.
      setDeleteErrorId(id);
    } finally {
      setDeletingId(null);
    }
  }

  function topicOf(a: (typeof attempts)[number]): string {
    if (a.assessment != null && a.assessment.syllabusTopic !== "unknown") {
      return topicDisplayLabel(a.assessment.syllabusTopic);
    }
    return a.assessment?.topicLabel || a.topic;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every answer you submit, saved privately to your Aptly account.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {attempts.map((a) => {
          const open = expanded === a.id;
          const detailsId = `attempt-details-${a.id}`;
          // Canonical presentation (shared with the feedback screen): a
          // source-less Paper 2(g)/3(b) attempt never shows source-data
          // criticism here either.
          const f = presentedFeedback(a);
          const sourceMissing = a.assessment != null && isSourceMaterialMissing(a.assessment);
          return (
            <Card key={a.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : a.id)}
                aria-expanded={open}
                aria-controls={open ? detailsId : undefined}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <MarkPill attempt={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{topicOf(a)}</span>
                    <Badge className={SUBJECT_BADGE[a.subject]}>{a.subject}</Badge>
                    {/* Practice Loop provenance — concise, never hidden. */}
                    {a.parentAttemptId != null && <Badge>{REVISION_ATTEMPT_LABEL}</Badge>}
                    {a.practiceQuestionId != null && <Badge>{APTLY_PRACTICE_LABEL}</Badge>}
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
                <CardContent id={detailsId} className="border-t border-border bg-muted/40 p-5">
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
                        {f.mistakes.length > 0 ? (
                          f.mistakes.map((m) => (
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
                      {sourceMissing && (
                        <div className="mt-4 flex items-start gap-2">
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {SOURCE_MATERIAL_MISSING_NOTICE.title}.
                            </span>{" "}
                            {SOURCE_MATERIAL_MISSING_NOTICE.body}
                          </p>
                        </div>
                      )}
                      {f.examinerComment !== "" && (
                        <>
                          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Examiner comment
                          </p>
                          <p className="mt-1.5 text-sm italic leading-relaxed text-muted-foreground">
                            {f.examinerComment}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Act on this answer: revise it after feedback (Practice Loop). */}
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <Link
                      href={`/submit?revise=${a.id}`}
                      className="inline-flex h-8 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Revise this answer
                    </Link>
                  </div>

                  {/* Per-attempt deletion — student data control, deliberately quiet. */}
                  <div className="mt-4 border-t border-border pt-4">
                    {pendingDeleteId === a.id ? (
                      <div
                        role="group"
                        aria-label="Confirm deleting this attempt"
                        className="flex flex-col gap-2"
                      >
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Delete this attempt permanently? It will also be removed from your
                          Dashboard and Analytics.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletingId !== null}
                            onClick={() => void confirmDelete(a.id)}
                          >
                            {deletingId === a.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Deleting…
                              </>
                            ) : deleteErrorId === a.id ? (
                              "Retry delete"
                            ) : (
                              "Delete"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deletingId === a.id}
                            onClick={() => {
                              setPendingDeleteId(null);
                              setDeleteErrorId(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        {deleteErrorId === a.id && (
                          <p role="alert" className="text-xs text-destructive">
                            Couldn&apos;t delete this attempt — it is still saved. Please try
                            again.
                          </p>
                        )}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setPendingDeleteId(a.id);
                          setDeleteErrorId(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete this attempt
                      </Button>
                    )}
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
