import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/types";
import type { AttemptsLoadStatus } from "@/lib/storage-state";
import type { DraftTask, DraftText } from "@/lib/drafts/session-draft";
import { focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import SubmitPage from "./page";

const mocks = vi.hoisted(() => ({
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | null,
  params: new URLSearchParams(),
  attempts: [] as Attempt[],
  status: "ready" as AttemptsLoadStatus,
  draftText: null as DraftText | null,
  retry: vi.fn(),
  notice: vi.fn(),
  draft: vi.fn(),
  fetchPractice: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/draft-account-boundary", () => ({ useDraftAccount: () => mocks.accountId }));
vi.mock("@/lib/storage", () => ({
  useAttempts: () => ({ attempts: mocks.attempts, status: mocks.status, retry: mocks.retry }),
  broadcastAttemptsChanged: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/practice-questions", () => ({ fetchPracticeQuestion: mocks.fetchPractice }));
vi.mock("@/lib/drafts/use-submit-draft", () => ({
  useSubmitDraft: (accountId: string, task: DraftTask, initial: DraftText, ready: boolean, sample: boolean) => {
    mocks.draft(accountId, task, initial, ready, sample);
    return {
      text: mocks.draftText ?? initial,
      restored: false,
      available: true,
      session: {},
      edit: vi.fn(),
      discard: vi.fn(),
      refresh: vi.fn(),
    };
  },
}));
vi.mock("@/components/attempts-load-notice", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/attempts-load-notice")>();
  return {
    AttemptsLoadNotice: (props: React.ComponentProps<typeof actual.AttemptsLoadNotice>) => {
      mocks.notice(props);
      return React.createElement(actual.AttemptsLoadNotice, props);
    },
  };
});

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  mocks.params = new URLSearchParams();
  mocks.attempts = [];
  mocks.status = "ready";
  mocks.draftText = null;
});

const parentId = "55555555-5555-4555-8555-555555555555";
const practiceId = "77777777-7777-4777-8777-777777777777";
function render() {
  return renderToStaticMarkup(React.createElement(SubmitPage));
}
function expectEditorBlocked(html: string) {
  expect(html).not.toContain("<form");
  expect(html).not.toContain('id="answer"');
  expect(html).not.toContain("Grade my answer");
  expect(mocks.draft).toHaveBeenLastCalledWith(
    mocks.accountId, expect.any(String), expect.any(Object), false, false,
  );
}

// These render the real page and notices against dependency boundary states.
// SSR does not run effects or browser clicks: retry fetching, stale responses,
// account switches and storage restoration are exercised in the browser check.
describe("Submit linked-question recovery presentation", () => {
  it("waits for the account before inspecting private task or draft context", () => {
    mocks.accountId = null;
    mocks.params.set("revise", parentId);
    const html = render();
    expect(html).toContain("Checking your account");
    expect(html).not.toContain("<form");
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.fetchPractice).not.toHaveBeenCalled();
  });

  it("shows revision loading without opening an editable substitute question", () => {
    mocks.params.set("revise", parentId);
    mocks.status = "loading";
    const html = render();
    expect(html).toContain("Loading your saved answers");
    expect(html).not.toContain("could not be found");
    expectEditorBlocked(html);
  });

  it.each([false, true])("offers same-context revision retry after a fetch failure (unrelated cached answers: %s)", cached => {
    mocks.params.set("revise", parentId);
    mocks.status = "error";
    mocks.attempts = cached ? [focusAttempt("Economic analysis", "3.5", practiceId)] : [];
    const html = render();
    expect(html).toContain("We couldn’t refresh your saved answers");
    expect(html).toContain("Try again");
    expect(html).not.toContain("could not be found");
    expect(html).not.toContain("Loading your question");
    expectEditorBlocked(html);
    const notice = mocks.notice.mock.lastCall![0];
    expect(notice).toMatchObject({ status: "error", hasData: false, onRetry: mocks.retry });
    notice.onRetry();
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an ended revision session from a missing original", () => {
    mocks.params.set("revise", parentId);
    mocks.status = "unauthorized";
    const html = render();
    expect(html).toContain("Your session has ended");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("could not be found");
    expectEditorBlocked(html);
  });

  it("calls an original missing only after the saved-answer lookup succeeds", () => {
    mocks.params.set("revise", parentId);
    const html = render();
    expect(html).toContain("This question could not be found. Your draft has not been replaced.");
    expect(html).toContain('href="/practice"');
    expect(html).not.toContain("Try again");
    expect(mocks.notice).not.toHaveBeenCalled();
    expectEditorBlocked(html);
  });

  it.each(["ready", "loading", "error"] as const)("keeps an available original usable with saved-answer status %s", status => {
    const parent = focusAttempt();
    mocks.params.set("revise", parent.id);
    mocks.attempts = [parent];
    mocks.status = status;
    const html = render();
    expect(html).toContain("Revise this answer");
    expect(html).toContain(parent.question);
    expect(html).toContain('id="answer"');
    expect(html).toContain("Grade my answer");
    expect(html).not.toContain(parent.answer);
    expect(html).not.toMatch(/<textarea[^>]*id="question"/);
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(mocks.draft).toHaveBeenLastCalledWith(
      mocks.accountId, `revision:${parent.id}`,
      { question: "", answer: "", source: "" }, true, false,
    );
  });

  it("keeps legacy saved originals revisable without requiring a modern assessment", () => {
    const parent = focusAttempt();
    parent.assessment = null;
    mocks.params.set("revise", parent.id);
    mocks.attempts = [parent];
    const html = render();
    expect(html).toContain(parent.question);
    expect(html).toContain("Revise this answer");
    expect(html).toContain("Grade my answer");
    expect(mocks.draft.mock.lastCall?.[3]).toBe(true);
  });

  it("waits for the stored Practice question before offering its editor", () => {
    mocks.params.set("practice", practiceId);
    const html = render();
    expect(html).toContain("Loading your question");
    expect(html).not.toContain("could not be found");
    expectEditorBlocked(html);
  });

  it("waits for a revision's linked Practice context even when its original is loaded", () => {
    const parent = focusAttempt();
    parent.practiceQuestionId = practiceId;
    mocks.params.set("revise", parent.id);
    mocks.attempts = [parent];
    const html = render();
    expect(html).toContain("Loading your question");
    expect(html).not.toContain(parent.question);
    expectEditorBlocked(html);
  });

  it("leaves ordinary Submit and its typed draft usable when history cannot refresh", () => {
    mocks.status = "error";
    mocks.draftText = { question: "Explain why a price ceiling can cause a shortage. [10 marks]", answer: "My unfinished answer", source: "" };
    const html = render();
    expect(html).toContain("Submit an answer");
    expect(html).toContain(mocks.draftText.question);
    expect(html).toContain(mocks.draftText.answer);
    expect(html).toContain("Grade my answer");
    expect(html).toMatch(/<textarea[^>]*id="question"/);
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(mocks.draft).toHaveBeenLastCalledWith(
      mocks.accountId, "manual", expect.any(Object), true, false,
    );
  });
});
