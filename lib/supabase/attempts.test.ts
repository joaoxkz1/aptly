import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attempt, Feedback } from "@/lib/types";
import { deleteAttempt, insertAttempt, rowToAttempt, type AttemptRow } from "./attempts";

function feedback(): Feedback {
  return {
    score: 5,
    band: "internal",
    strengths: ["s"],
    improvements: ["i"],
    mistakes: [],
    examinerComment: "c",
    studyNext: "n",
  };
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "local-1",
    createdAt: "2026-07-01T10:00:00.000Z",
    subject: "Economics",
    topic: "Economics",
    question: "Explain X. [10 marks]",
    answer: "An answer.",
    feedback: feedback(),
    assessment: null,
    ...overrides,
  };
}

/**
 * Chainable per-table mock. Records every call so tests can assert the exact
 * delete/select targets. Behaviour is configured per test via `config`.
 */
function mockClient(config: {
  linkedPracticeQuestionId?: string | null;
  deleteError?: unknown;
  remainingRefs?: number;
  countError?: unknown;
  insertedId?: string;
  /** Number of leading insert calls that fail (transient-failure simulation). */
  insertFailures?: number;
}) {
  const calls: string[] = [];
  const attemptDeleteEq = vi.fn(async (_col: string, id: string) => {
    calls.push(`attempts.delete.eq:${id}`);
    return { error: config.deleteError ?? null };
  });
  const practiceDeleteEq = vi.fn(async (_col: string, id: string) => {
    calls.push(`practice_questions.delete.eq:${id}`);
    return { error: null };
  });
  const insertPayloads: unknown[] = [];

  const client = {
    from: (table: string) => {
      if (table === "practice_questions") {
        return {
          delete: () => ({ eq: practiceDeleteEq }),
        };
      }
      return {
        select: (columns: string, opts?: { count?: string }) => {
          if (opts?.count === "exact") {
            return {
              eq: async (_col: string, id: string) => {
                calls.push(`attempts.countRefs:${id}`);
                return {
                  count: config.countError != null ? null : config.remainingRefs ?? 0,
                  error: config.countError ?? null,
                };
              },
            };
          }
          if (columns === "practice_question_id") {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: { practice_question_id: config.linkedPracticeQuestionId ?? null },
                  error: null,
                }),
              }),
            };
          }
          return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        },
        delete: () => ({ eq: attemptDeleteEq }),
        insert: (payload: unknown) => {
          insertPayloads.push(payload);
          const failing = insertPayloads.length <= (config.insertFailures ?? 0);
          return {
            select: () => ({
              single: async () =>
                failing
                  ? { data: null, error: { message: "transient failure" } }
                  : {
                      data: {
                        id: config.insertedId ?? "db-uuid-1",
                        created_at: "2026-07-02T09:00:00.000Z",
                      },
                      error: null,
                    },
            }),
          };
        },
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    attemptDeleteEq,
    practiceDeleteEq,
    insertPayloads,
  };
}

describe("insertAttempt — durable Practice Loop links + database identity", () => {
  it("persists parent_attempt_id and practice_question_id and returns the DB id", async () => {
    const { client, insertPayloads } = mockClient({ insertedId: "db-uuid-9" });
    const saved = await insertAttempt(
      client,
      attempt({ parentAttemptId: "parent-uuid", practiceQuestionId: "pq-uuid" })
    );

    const payload = insertPayloads[0] as Record<string, unknown>;
    expect(payload.parent_attempt_id).toBe("parent-uuid");
    expect(payload.practice_question_id).toBe("pq-uuid");
    // The caller gets the DATABASE identity, so a follow-up revision links
    // to the real row (and the link survives refresh).
    expect(saved.id).toBe("db-uuid-9");
    expect(saved.createdAt).toBe("2026-07-02T09:00:00.000Z");
  });

  it("writes NULL links for an ordinary attempt", async () => {
    const { client, insertPayloads } = mockClient({});
    await insertAttempt(client, attempt());
    const payload = insertPayloads[0] as Record<string, unknown>;
    expect(payload.parent_attempt_id).toBeNull();
    expect(payload.practice_question_id).toBeNull();
    expect(payload.source_material).toBeNull();
  });

  it("a revision insert payload is valid under the persistence/RLS design", async () => {
    const { client, insertPayloads } = mockClient({});
    const saved = await insertAttempt(
      client,
      attempt({ parentAttemptId: "3f9b2c44-0000-4000-8000-000000000001" })
    );
    const payload = insertPayloads[0] as Record<string, unknown>;
    // The DATABASE stamps identity and ownership — the payload must never
    // carry a client id or user_id (a local temp id in a uuid column would
    // reject the whole insert).
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("created_at");
    // Every linked column is a uuid string or null — nothing else.
    for (const col of ["parent_attempt_id", "practice_question_id"]) {
      const v = payload[col];
      expect(v === null || typeof v === "string").toBe(true);
    }
    expect(payload.parent_attempt_id).toBe("3f9b2c44-0000-4000-8000-000000000001");
    expect(saved.id).toBe("db-uuid-1"); // DB identity returned for follow-ups
  });

  it("persists the attempt's own private source copy (manual source retention)", async () => {
    const source = "In 2024 Norvia raised fuel taxes by 12% and consumption fell 5%.";
    const { client, insertPayloads } = mockClient({});
    await insertAttempt(client, attempt({ sourceMaterial: source }));
    expect((insertPayloads[0] as Record<string, unknown>).source_material).toBe(source);
  });

  it("persists structured diagram evidence when present and NULL when absent", async () => {
    const evidence = {
      version: 1 as const,
      status: "partially_readable" as const,
      graphTypeObserved: null,
      relevanceToQuestion: "unclear" as const,
      elements: [{ element: "axes_labels" as const, observed: "unclear" as const }],
      consistencyWithAnswer: "not_checked" as const,
      improvements: [],
    };
    const { client, insertPayloads } = mockClient({});
    await insertAttempt(client, attempt({ diagramEvidence: evidence }));
    await insertAttempt(client, attempt());
    expect((insertPayloads[0] as Record<string, unknown>).diagram_evidence).toEqual(evidence);
    expect((insertPayloads[1] as Record<string, unknown>).diagram_evidence).toBeNull();
  });

  it("retry-save works after a transient failure (no duplicate on success)", async () => {
    const { client, insertPayloads } = mockClient({ insertFailures: 1 });
    const revision = attempt({ parentAttemptId: "parent-uuid" });
    // First save fails honestly…
    await expect(insertAttempt(client, revision)).rejects.toBeTruthy();
    // …and the page-level retry re-issues the SAME insert, which now lands.
    const saved = await insertAttempt(client, revision);
    expect(saved.id).toBe("db-uuid-1");
    expect(insertPayloads.length).toBe(2);
    expect(insertPayloads[0]).toEqual(insertPayloads[1]);
  });
});

describe("rowToAttempt — retained source round-trips privately to its owner", () => {
  it("maps source_material and defaults it to null on legacy rows", () => {
    const base = {
      id: "db-uuid-1",
      subject: "Economics",
      topic: "Economics",
      question: "Q",
      answer: "A",
      score: 5,
      max_score: 7,
      feedback: feedback(),
      mistake_type: null,
      next_step: null,
      created_at: "2026-07-01T10:00:00.000Z",
      assessment: null,
    };
    expect(rowToAttempt({ ...base, source_material: "Extract text." } as AttemptRow).sourceMaterial).toBe(
      "Extract text."
    );
    expect(rowToAttempt(base as AttemptRow).sourceMaterial).toBeNull();
  });
});

describe("rowToAttempt — diagram evidence round-trips per-attempt (legacy rows carry none)", () => {
  const base = {
    id: "db-uuid-1",
    subject: "Economics",
    topic: "Economics",
    question: "Q",
    answer: "A",
    score: 5,
    max_score: 7,
    feedback: feedback(),
    mistake_type: null,
    next_step: null,
    created_at: "2026-07-01T10:00:00.000Z",
    assessment: null,
  };

  it("maps diagram_evidence and defaults it to null on rows without one", () => {
    const evidence = {
      version: 1 as const,
      status: "reviewed_clearly" as const,
      graphTypeObserved: "demand and supply",
      relevanceToQuestion: "appears_relevant" as const,
      elements: [],
      consistencyWithAnswer: "supports" as const,
      improvements: [],
    };
    expect(
      rowToAttempt({ ...base, diagram_evidence: evidence } as AttemptRow).diagramEvidence
    ).toEqual(evidence);
    expect(rowToAttempt(base as AttemptRow).diagramEvidence).toBeNull();
  });
});

describe("rowToAttempt — revision links survive refresh (round-trip)", () => {
  it("maps parent_attempt_id and practice_question_id back onto the attempt", () => {
    const row: AttemptRow = {
      id: "db-uuid-1",
      subject: "Economics",
      topic: "Economics",
      question: "Q",
      answer: "A",
      score: 5,
      max_score: 7,
      feedback: feedback(),
      mistake_type: null,
      next_step: null,
      created_at: "2026-07-01T10:00:00.000Z",
      assessment: null,
      parent_attempt_id: "parent-uuid",
      practice_question_id: "pq-uuid",
    };
    const a = rowToAttempt(row);
    expect(a.parentAttemptId).toBe("parent-uuid");
    expect(a.practiceQuestionId).toBe("pq-uuid");
  });

  it("treats missing link columns as null (legacy rows)", () => {
    const row = {
      id: "db-uuid-1",
      subject: "Economics",
      topic: "Economics",
      question: "Q",
      answer: "A",
      score: 5,
      max_score: 7,
      feedback: feedback(),
      mistake_type: null,
      next_step: null,
      created_at: "2026-07-01T10:00:00.000Z",
      assessment: null,
    } as AttemptRow;
    const a = rowToAttempt(row);
    expect(a.parentAttemptId).toBeNull();
    expect(a.practiceQuestionId).toBeNull();
  });
});

describe("deleteAttempt — per-attempt student data control", () => {
  it("targets ONLY the selected attempt row by id", async () => {
    const { client, attemptDeleteEq } = mockClient({});
    await deleteAttempt(client, "row-2");
    expect(attemptDeleteEq).toHaveBeenCalledTimes(1);
    expect(attemptDeleteEq).toHaveBeenCalledWith("id", "row-2");
  });

  it("throws on failure so callers can never optimistically drop the row", async () => {
    const { client } = mockClient({ deleteError: { message: "network down" } });
    // The storage hook only broadcasts (and pages only resync) AFTER this
    // resolves — a rejection keeps the attempt visible with a retry.
    await expect(deleteAttempt(client, "row-2")).rejects.toBeTruthy();
  });

  it("deleting an ORIGINAL never issues a delete against its revisions", async () => {
    const { client, attemptDeleteEq, practiceDeleteEq } = mockClient({});
    await deleteAttempt(client, "original-id");
    // Exactly one attempts delete, scoped to the original's id. The DB nulls
    // revision links via `on delete set null` — no other row is touched.
    expect(attemptDeleteEq).toHaveBeenCalledTimes(1);
    expect(attemptDeleteEq).toHaveBeenCalledWith("id", "original-id");
    expect(practiceDeleteEq).not.toHaveBeenCalled();
  });

  it("removes the private practice question once no attempt references it", async () => {
    const { client, practiceDeleteEq } = mockClient({
      linkedPracticeQuestionId: "pq-uuid",
      remainingRefs: 0,
    });
    await deleteAttempt(client, "row-2");
    expect(practiceDeleteEq).toHaveBeenCalledWith("id", "pq-uuid");
  });

  it("keeps the practice question while a revision still references it", async () => {
    const { client, practiceDeleteEq } = mockClient({
      linkedPracticeQuestionId: "pq-uuid",
      remainingRefs: 1,
    });
    await deleteAttempt(client, "row-2");
    expect(practiceDeleteEq).not.toHaveBeenCalled();
  });

  it("deleting an ORIGINAL generated-practice attempt keeps the question its revision depends on", async () => {
    // The original is deleted; its revision (same practice_question_id) still
    // exists, so the reference count is 1 and the stored question + generated
    // source survive for the revision's grading and reference panel.
    const { client, attemptDeleteEq, practiceDeleteEq } = mockClient({
      linkedPracticeQuestionId: "pq-uuid",
      remainingRefs: 1, // the revision
    });
    await deleteAttempt(client, "original-id");
    expect(attemptDeleteEq).toHaveBeenCalledWith("id", "original-id");
    expect(practiceDeleteEq).not.toHaveBeenCalled();
  });

  it("deleting one of MULTIPLE attempts on a question never deletes it", async () => {
    const { client, practiceDeleteEq } = mockClient({
      linkedPracticeQuestionId: "pq-uuid",
      remainingRefs: 2,
    });
    await deleteAttempt(client, "row-1");
    expect(practiceDeleteEq).not.toHaveBeenCalled();
  });

  it("cleanup is best-effort: a failed reference count keeps the question and still resolves", async () => {
    // Fail-safe direction: when the dependency check cannot be verified, the
    // question is KEPT (never destroyed under uncertainty) and the completed
    // attempt deletion is still reported honestly as success.
    const { client, practiceDeleteEq } = mockClient({
      linkedPracticeQuestionId: "pq-uuid",
      countError: new Error("db unavailable"),
    });
    await expect(deleteAttempt(client, "row-2")).resolves.toBeUndefined();
    expect(practiceDeleteEq).not.toHaveBeenCalled();
  });
});
