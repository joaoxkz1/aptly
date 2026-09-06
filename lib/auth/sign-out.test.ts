import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "@/components/app-shell";
import {
  browserDraftStore, clearBrowserDrafts, DraftSession, draftKey, isDraftAccount,
  setDraftAccount, type DraftStorage,
} from "@/lib/drafts/session-draft";
import { createHookRenderer } from "@/lib/testing/hook-renderer";

const mocks = vi.hoisted(() => ({
  renderer: null as ReturnType<typeof createHookRenderer> | null,
  signOut: vi.fn<() => Promise<{ error: Error | null }>>(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)) => mocks.renderer!.hooks.useState(initial),
    useRef: <T>(initial: T) => mocks.renderer!.hooks.useRef(initial),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

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
let storage: MemoryStorage;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.renderer = createHookRenderer();
  storage = new MemoryStorage();
  vi.stubGlobal("window", { sessionStorage: storage });
  vi.stubGlobal("React", React);
  setDraftAccount(A);
});
afterEach(() => {
  mocks.renderer?.unmount();
  clearBrowserDrafts();
  vi.unstubAllGlobals();
});

function session(accountId = A) {
  const value = new DraftSession(accountId, "manual", browserDraftStore, undefined,
    Date.now, () => crypto.randomUUID(), () => isDraftAccount(accountId));
  value.open();
  return value;
}
type ElementProps = { children?: React.ReactNode; onClick?: () => Promise<void>; disabled?: boolean; role?: string };
function find(node: React.ReactNode, predicate: (element: React.ReactElement<ElementProps>) => boolean): React.ReactElement<ElementProps> | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<ElementProps>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children, predicate);
    if (nested) return nested;
  }
}
function render() {
  const tree = mocks.renderer!.render(() => SignOutButton());
  const button = find(tree, element => element.type === "button");
  if (!button?.props.onClick) throw new Error("Missing Sign out button callback");
  return { click: button.props.onClick, disabled: button.props.disabled,
    alert: find(tree, element => element.props.role === "alert")?.props.children };
}
function deferred() {
  let resolve!: (value: { error: Error | null }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ error: Error | null }>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("Sign out callback and real draft-account persistence", () => {
  it.each(["returned auth error", "thrown error"])("retains A's draft and restores editing after a %s", async failure => {
    const draft = session();
    draft.edit({ question: "Explain fiscal policy. [10 marks]", answer: "Before sign out", source: "Private source" });
    const pending = deferred();
    mocks.signOut.mockReturnValueOnce(pending.promise);
    const request = render().click();
    expect(render().disabled).toBe(true);
    expect(isDraftAccount(A)).toBe(true);
    expect(browserDraftStore.read(A, "manual").draft?.text).toEqual(draft.text);
    if (failure === "returned auth error") pending.resolve({ error: new Error("Auth unavailable") });
    else pending.reject(new Error("Network unavailable"));
    await request;
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(render()).toMatchObject({ disabled: false, alert: expect.stringMatching(/try again/i) });
    expect(isDraftAccount(A)).toBe(true);
    draft.edit({ answer: "Edited after the failed sign out" });
    const updated = { ...draft.text };
    draft.close();
    const restored = session();
    expect(restored.restored).toBe(true);
    expect(restored.text).toEqual(updated);
  });

  it("keeps pending sign-out single-flight and clears A only after success, before navigation or B's session", async () => {
    const draft = session();
    draft.edit({ answer: "A's private answer" });
    storage.setItem("theme", "dark");
    const pending = deferred();
    mocks.signOut.mockReturnValueOnce(pending.promise);
    const button = render();
    const request = button.click();
    await button.click(); // Same closure, before React has committed busy state.
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(isDraftAccount(A)).toBe(true);
    mocks.replace.mockImplementation(() => {
      expect(isDraftAccount(A)).toBe(false);
      expect(storage.getItem(draftKey(A, "manual"))).toBeNull();
    });
    pending.resolve({ error: null });
    await request;
    expect(mocks.replace).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(storage.getItem("theme")).toBe("dark");
    setDraftAccount(B);
    draft.edit({ answer: "Late A callback" });
    expect(browserDraftStore.read(A, "manual").draft).toBeNull();
    const other = session(B);
    expect(other.restored).toBe(false);
    expect(other.text.answer).toBe("");
  });

  it("allows another explicit sign-out attempt after failure and clears the old alert", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error("Retry later") });
    await render().click();
    const pending = deferred();
    mocks.signOut.mockReturnValueOnce(pending.promise);
    const request = render().click();
    expect(render()).toMatchObject({ disabled: true, alert: undefined });
    pending.resolve({ error: null });
    await request;
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});
