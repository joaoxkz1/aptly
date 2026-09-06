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
type Node = ReactElement<{ children?: ReactNode; onSubmit?: (event: { preventDefault: () => void }) => void }>;
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
afterEach(() => { renderer.unmount(); session.close(); vi.unstubAllGlobals(); });

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
