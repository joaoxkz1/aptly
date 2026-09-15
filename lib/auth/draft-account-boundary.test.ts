import React, { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftAccountBoundary } from "@/components/draft-account-boundary";
import { createHookRenderer } from "@/lib/testing/hook-renderer";
import { browserDraftStore, clearBrowserDrafts, DraftSession, isDraftAccount, type DraftStorage } from "@/lib/drafts/session-draft";

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
type ClaimsResult = { data: { claims: { sub: string } } | null };
const mocks = vi.hoisted(() => ({ getClaims: vi.fn<() => Promise<ClaimsResult>>(), subscribe: vi.fn() }));
let renderer: ReturnType<typeof createHookRenderer>;
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useState: <T,>(initial: T | (() => T)) => renderer.hooks.useState(initial),
    useEffect: (...args: Parameters<typeof actual.useEffect>) => renderer.hooks.useEffect(...args),
  };
});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  auth: { onAuthStateChange: mocks.subscribe, getClaims: mocks.getClaims },
}) }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
const subscriptions: { callback: AuthCallback; unsubscribe: ReturnType<typeof vi.fn> }[] = [];
const claims = (id: string): ClaimsResult => ({ data: { claims: { sub: id } } });
function deferred() {
  let resolve!: (value: ClaimsResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ClaimsResult>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
type Node = ReactElement<{ children?: ReactNode; value?: string | null; role?: string; onClick?: () => void }>;
function descendants(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Node;
  return [element, ...descendants(element.props.children)];
}
function render() { return renderer.render(() => DraftAccountBoundary({ children: "editor" })); }
function mount() { const view = render(); renderer.flushEffects(); return view; }
function emit(id: string | null, event = "SIGNED_IN") {
  subscriptions.at(-1)!.callback(event, id ? { user: { id } } : null);
}
function alert() { return descendants(render()).find(node => node.props.role === "alert"); }
function retry() {
  const button = descendants(render()).find(node => node.props.onClick);
  expect(button?.props.children).toBe("Retry account check");
  button!.props.onClick!();
  render(); renderer.flushEffects();
}
function draft(id: string) {
  const session = new DraftSession(id, "manual", browserDraftStore, undefined,
    Date.now, () => crypto.randomUUID(), () => isDraftAccount(id));
  session.open(); return session;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  renderer = createHookRenderer(); subscriptions.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
  clearBrowserDrafts();
  mocks.subscribe.mockImplementation((callback: AuthCallback) => {
    const unsubscribe = vi.fn(); subscriptions.push({ callback, unsubscribe });
    return { data: { subscription: { unsubscribe } } };
  });
  mocks.getClaims.mockResolvedValue(claims(A));
});
afterEach(() => {
  renderer.unmount(); clearBrowserDrafts(); vi.clearAllTimers();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("actual draft account boundary verification and recovery", () => {
  it("keeps the editor unverified until claims match and verifies outside the auth callback", async () => {
    const pending = deferred(); mocks.getClaims.mockReturnValueOnce(pending.promise);
    expect(mount().props.value).toBeNull();
    emit(A, "INITIAL_SESSION");
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(render().props.value).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(isDraftAccount(A)).toBe(false);
    pending.resolve(claims(A)); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBe(A);
    expect(render().key).toBe(A);
    expect(isDraftAccount(A)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    emit(A, "TOKEN_REFRESHED");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(render().props.value).toBe(A);
  });

  it("closes A immediately on account switch, ignores late A, and only activates verified B", async () => {
    mount(); emit(A); await vi.advanceTimersByTimeAsync(0);
    const oldDraft = draft(A); oldDraft.edit({ answer: "A's private answer" });
    const pendingA = deferred(), pendingB = deferred();
    // A new verification can still be pending when the account changes.
    renderer.unmount(); renderer = createHookRenderer();
    mocks.getClaims.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    mount(); emit(A); await vi.advanceTimersByTimeAsync(0);
    emit(B); expect(render().props.value).toBeNull();
    expect(render().key).toBe("pending");
    expect(isDraftAccount(A)).toBe(false);
    expect(browserDraftStore.read(A, "manual").draft).toBeNull();
    oldDraft.edit({ answer: "Late A edit" });
    expect(browserDraftStore.read(A, "manual").draft).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    pendingA.resolve(claims(A)); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBeNull();
    pendingB.resolve(claims(B)); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBe(B);
    expect(render().key).toBe(B);
    expect(draft(B).text.answer).toBe("");
    oldDraft.close();
  });

  it.each(["rejected", "missing", "mismatched"])("offers explicit retry after %s verification without trusting the event identity", async failure => {
    if (failure === "rejected") mocks.getClaims.mockRejectedValueOnce(new Error("Temporary auth failure"));
    else mocks.getClaims.mockResolvedValueOnce(failure === "missing" ? { data: null } : claims(A));
    mount(); emit(B); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBeNull(); expect(alert()).toBeDefined();
    expect(isDraftAccount(B)).toBe(false); expect(isDraftAccount(A)).toBe(false);
    expect(render().props.children).not.toBe("editor");
    mocks.getClaims.mockResolvedValueOnce(claims(B));
    retry();
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
    expect(alert()).toBeUndefined(); expect(render().props.value).toBeNull();
    emit(B, "INITIAL_SESSION"); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBe(B); expect(render().props.children).toBe("editor");
    expect(isDraftAccount(B)).toBe(true);
  });

  it("bounds a stalled check, ignores its late result, and accepts only the retry's verification", async () => {
    const stale = deferred(), fresh = deferred();
    mocks.getClaims.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    mount(); emit(A); await vi.advanceTimersByTimeAsync(10_000);
    expect(alert()).toBeDefined(); expect(render().props.value).toBeNull();
    retry(); emit(B); await vi.advanceTimersByTimeAsync(0);
    stale.resolve(claims(A)); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBeNull(); expect(isDraftAccount(A)).toBe(false);
    fresh.resolve(claims(B)); await vi.advanceTimersByTimeAsync(0);
    expect(render().props.value).toBe(B); expect(alert()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a missing INITIAL_SESSION event and treats a missing session as unverified", async () => {
    mount(); await vi.advanceTimersByTimeAsync(10_000);
    expect(alert()).toBeDefined(); expect(mocks.getClaims).not.toHaveBeenCalled();
    retry(); emit(null, "INITIAL_SESSION");
    expect(alert()).toBeDefined(); expect(render().props.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores old subscription events and pending verification after unmount, and cancels timers", async () => {
    const pending = deferred(); mocks.getClaims.mockReturnValueOnce(pending.promise);
    mount(); emit(A); await vi.advanceTimersByTimeAsync(0);
    const previous = subscriptions[0]; renderer.unmount();
    expect(previous.unsubscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    previous.callback("SIGNED_IN", { user: { id: B } });
    pending.resolve(claims(A)); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(isDraftAccount(A)).toBe(false); expect(isDraftAccount(B)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
