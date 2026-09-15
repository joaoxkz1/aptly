import React, { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRenderer } from "@/lib/testing/hook-renderer";
import { DraftSession, SessionDraftStore, type DraftStorage } from "@/lib/drafts/session-draft";
import { focusAttempt } from "@/lib/testing/focused-practice-fixtures";
import SubmitPage from "./page";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let renderer: ReturnType<typeof createHookRenderer>;
let session: DraftSession;
let store: SessionDraftStore;
let fetchMock: ReturnType<typeof vi.fn>;

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => renderer.hooks.useState(initial),
    useRef: <T,>(initial: T) => renderer.hooks.useRef(initial),
    useMemo: (...args: Parameters<typeof actual.useMemo>) => renderer.hooks.useMemo(...args),
    useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: React.DependencyList) => renderer.hooks.useCallback(callback, deps),
    useEffect: (...args: Parameters<typeof actual.useEffect>) => renderer.hooks.useEffect(...args),
  };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/draft-account-boundary", () => ({ useDraftAccount: () => accountId }));
vi.mock("@/lib/storage", () => ({ useAttempts: () => ({ attempts: [], status: "ready", retry: vi.fn() }), broadcastAttemptsChanged: vi.fn() }));
vi.mock("@/lib/drafts/use-submit-draft", () => ({
  useSubmitDraft: () => ({ ...session.getSnapshot(), session,
    edit: session.edit.bind(session), discard: session.discard.bind(session), refresh: session.refresh }),
}));

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
type Node = ReactElement<{ children?: ReactNode; onSubmit?: (event: { preventDefault: () => void }) => void; onAttachedChange?: (image: Blob | null) => void; onStatusChange?: (status: string) => void; onClick?: () => void }>;
function descendants(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Node;
  return [element, ...descendants(element.props.children)];
}
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node as Node).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  return renderer.render(() => {
    const route = SubmitPage().props.children as ReactElement;
    const editor = (route.type as () => ReactElement)();
    return (editor.type as (props: unknown) => ReactElement)(editor.props);
  });
}
function submit() {
  const form = descendants(render()).find(node => node.type === "form");
  if (!form?.props.onSubmit) throw new Error("Missing Submit form");
  form.props.onSubmit({ preventDefault: vi.fn() });
}
async function responseSettled() {
  await vi.waitFor(() => expect(textOf(render())).not.toContain("Checking your answer…"));
}
function requestKeys() {
  return fetchMock.mock.calls.map(([, request]) => JSON.parse(request.body as string).idempotencyKey);
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }

beforeEach(() => {
  renderer = createHookRenderer();
  const memory = new MemoryStorage();
  store = new SessionDraftStore(() => memory);
  session = new DraftSession(accountId, "manual", store);
  session.open();
  session.edit({ question: "Explain how a subsidy affects supply. [4 marks]", answer: "A subsidy lowers production costs, increasing supply.", source: "Retained source text." });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { setTimeout, clearTimeout, scrollTo: vi.fn() });
  vi.stubGlobal("React", React);
});
afterEach(() => { renderer.unmount(); session.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Submit callback retry lifecycle with the real draft session", () => {
  it.each([null, [], { attempt: null }, { attempt: { id: 123 } }, { attempt: { id: "not-a-saved-id" } }])("keeps a malformed successful response uncertain: %j", async body => {
    fetchMock.mockResolvedValue(json(body));
    const saved = vi.spyOn(session, "saved");
    const original = { ...session.text };
    submit(); await responseSettled();
    expect(saved).not.toHaveBeenCalled();
    expect(session.text).toEqual(original);
    expect(store.read(accountId, "manual").draft?.text).toEqual(original);
    expect(textOf(render())).toContain("couldn't confirm completion");
    submit(); await responseSettled();
    expect(requestKeys()).toHaveLength(2);
    expect(requestKeys()[1]).toBe(requestKeys()[0]);
  });

  it("marks an authoritative terminal response without dispatch, then rotates on the next explicit submit", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "request_failed" }, 409))
      .mockResolvedValueOnce(json({ error: "grading_failed" }, 502));
    const original = { ...session.text };
    submit(); await responseSettled();
    expect(session.getSnapshot().terminalFailed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.text).toEqual(original);
    expect(textOf(render())).toContain("Try again as a fresh attempt");
    const oldKey = store.read(accountId, "manual").draft?.retry?.idempotencyKey;
    expect(oldKey).toBe(requestKeys()[0]);
    submit(); await responseSettled();
    expect(requestKeys()[1]).not.toBe(oldKey);
    expect(session.getSnapshot().terminalFailed).toBe(false);
    expect(session.text).toEqual(original);
  });

  it("completes a valid saved response and removes only its unchanged draft", async () => {
    const attempt = { ...focusAttempt(), question: session.text.question, answer: session.text.answer };
    fetchMock.mockResolvedValueOnce(json({ attempt, replayed: true }));
    const saved = vi.spyOn(session, "saved");
    submit(); await responseSettled();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(store.read(accountId, "manual").draft).toBeNull();
    expect(textOf(render())).toContain("Your feedback");
  });

  it("blocks duplicate submits while the request is pending", async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    const form = descendants(render()).find(node => node.type === "form")!;
    form.props.onSubmit!({ preventDefault: vi.fn() });
    form.props.onSubmit!({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(json({ error: "grading_failed" }, 502));
    await responseSettled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not apply a late terminal response to newer writing", async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValueOnce(json({ error: "grading_failed" }, 502));
    submit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    session.edit({ answer: "Newer answer written while the request was pending." });
    release(json({ error: "request_failed" }, 409));
    await responseSettled();
    expect(session.getSnapshot().terminalFailed).toBe(false);
    expect(textOf(render())).not.toContain("failed without saving");
    expect(store.read(accountId, "manual").draft?.text.answer).toBe(session.text.answer);
    submit(); await responseSettled();
    expect(requestKeys()[1]).not.toBe(requestKeys()[0]);
  });
});

describe("Combined diagram submission callbacks", () => {
  function attach(image: Blob | null) {
    descendants(render()).find(node => node.props.onAttachedChange)?.props.onAttachedChange?.(image);
  }
  function payload(index = 0) {
    const form = fetchMock.mock.calls[index][1].body as FormData;
    return JSON.parse(String(form.get("payload")));
  }
  it("submits an image-only attempt through one authoritative multipart grade request", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    session.edit({ question: "Using a demand and supply diagram, explain how a drought affects wheat price and quantity. [4 marks]", answer: "" });
    attach(new Blob(["synthetic-image"], { type: "image/jpeg" }));
    fetchMock.mockResolvedValue(json({ error: "grading_failed" }, 502));
    submit(); await responseSettled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/grade");
    expect(payload().answer).toBe("");
    expect((fetchMock.mock.calls[0][1].body as FormData).get("image")).toBeInstanceOf(Blob);
  });
  it("requires explicit omission confirmation before sending a required-diagram answer", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    session.edit({ question: "Using a demand and supply diagram, explain how a drought affects wheat price and quantity. [4 marks]" });
    fetchMock.mockResolvedValue(json({ error: "grading_failed" }, 502));
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    const confirmation = descendants(render()).find(node => node.props.onClick && textOf(node) === "Grade without a diagram");
    expect(confirmation).toBeTruthy();
    confirmation!.props.onClick!(); await responseSettled();
    expect(payload().diagramOmitted).toBe(true);
    expect((fetchMock.mock.calls[0][1].body as FormData).get("image")).toBeNull();
  });
  it("retains retry identity for unchanged evidence and creates a new identity after replacement or removal", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    fetchMock.mockImplementation(() => Promise.resolve(json({ error: "grading_failed" }, 502)));
    attach(new Blob(["one"], { type: "image/jpeg" }));
    submit(); await responseSettled();
    submit(); await responseSettled();
    expect(payload(1).idempotencyKey).toBe(payload().idempotencyKey);
    attach(new Blob(["two"], { type: "image/jpeg" }));
    submit(); await responseSettled();
    expect(payload(2).idempotencyKey).not.toBe(payload(1).idempotencyKey);
    attach(null);
    submit(); await responseSettled();
    expect(payload(3).idempotencyKey).not.toBe(payload(2).idempotencyKey);
  });
  it("blocks grading while a selected image is still preparing", () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    descendants(render()).find(node => node.props.onStatusChange)?.props.onStatusChange?.("preparing");
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not save an apparently complete result for unreadable evidence", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED", "true");
    attach(new Blob(["unclear-photo"], { type: "image/jpeg" }));
    fetchMock.mockResolvedValue(json({ error: "diagram_evidence_unassessable" }, 422));
    const saved = vi.spyOn(session, "saved");
    submit(); await responseSettled();
    expect(saved).not.toHaveBeenCalled();
    expect(textOf(render())).toContain("No completed mark was saved");
  });
});
