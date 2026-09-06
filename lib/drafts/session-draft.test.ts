import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftSession, SessionDraftStore, DRAFT_PREFIX, DRAFT_TTL_MS, draftKey, draftTask, parseDraft, type DraftStorage, type DraftTask } from "./session-draft";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const R = "44444444-4444-4444-8444-444444444444";
class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
let storage: MemoryStorage;
let store: SessionDraftStore;
let now: number;
beforeEach(() => {
  now = Date.parse("2026-09-05T12:00:00Z");
  storage = new MemoryStorage();
  store = new SessionDraftStore(() => storage, () => now);
});
function session(task: DraftTask = "manual", account = A, current = () => true) {
  return new DraftSession(account, task, store, undefined, () => now, () => crypto.randomUUID(), current);
}
function filled(task: DraftTask = "manual", account = A) {
  const s = session(task, account); s.open();
  s.edit({ question: "Explain fiscal policy. [10 marks]", answer: "Government spending increases demand. ".repeat(40), source: "Typed source data." });
  return s;
}

describe("temporary typed drafts", () => {
  it("typing is durable synchronously, before an immediate reload or any timer", () => {
    const s = filled();
    expect(store.read(A, "manual").draft?.text).toEqual(s.text);
    s.close();
    const reload = session(); reload.open();
    expect(reload.text).toEqual(s.text);
    expect(reload.restored).toBe(true);
  });
  it("navigation away/back restores only the account and exact task", () => {
    const a = filled(`practice:${Q}`); a.close();
    filled("manual").close();
    const b = filled(`practice:${R}`); b.edit({ answer: "Different question answer" }); b.close();
    const revision = filled(`revision:${Q}`); revision.edit({ answer: "Fresh revision" }); revision.close();
    const back = session(`practice:${Q}`); back.open();
    expect(back.text.answer).toBe(a.text.answer);
    expect(back.text.question).toBe(""); expect(back.text.source).toBe("");
    expect(draftTask(Q, R)).toBe(`revision:${Q}`);
    expect(draftTask(null, Q)).toBe(`practice:${Q}`);
    expect(draftTask(null, null)).toBe("manual");
    expect(store.read(A, `revision:${Q}`).draft?.text.answer).toBe("Fresh revision");
    expect(store.read(B, `practice:${Q}`).draft).toBeNull();
  });
  it("a separately opened pristine sample neither restores nor replaces unfinished writing", () => {
    const own = filled(); own.close();
    const sample = session(); sample.open(false);
    sample.edit({ question: "Sample question", answer: "Sample answer" }, false);
    sample.close();
    const back = session(); back.open();
    expect(back.text).toEqual(own.text);
    expect(back.restored).toBe(true);
  });
  it("does not restore before confirmed account/task activation or overwrite intervening typing", () => {
    filled();
    let confirmed = false;
    const late = session("manual", A, () => confirmed);
    late.open(); expect(late.text.answer).toBe("");
    confirmed = true;
    late.edit({ answer: "New typing before a late restore" });
    late.open();
    expect(late.text.answer).toBe("New typing before a late restore");
    expect(late.restored).toBe(false);
  });
  it.each([null, B])("sign-out/deletion or switching to %s removes actual old keys, not preferences", account => {
    const a = filled();
    storage.setItem("theme", "dark"); storage.setItem("aptly:practice:last-marks", "15");
    a.close(); store.accountChanged(account);
    expect([...storage.values.keys()]).not.toContain(draftKey(A, "manual"));
    expect(storage.getItem("theme")).toBe("dark"); expect(storage.getItem("aptly:practice:last-marks")).toBe("15");
    const back = session(); back.open(); expect(back.text.answer).toBe("");
  });
  it("an old account cannot write or clear after an auth change", async () => {
    let current = true;
    const a = session("manual", A, () => current); a.open(); a.edit({ answer: "Old account text" });
    const ticket = await a.beginSubmission("old request");
    current = false; store.accountChanged(B);
    a.edit({ answer: "Late old-account write" });
    expect(a.saved(ticket)).toBe(false);
    expect(store.read(A, "manual").draft).toBeNull();
  });
  it("uses an absolute 24-hour cutoff on restore/read/write", async () => {
    const a = filled(); const key = (await a.beginSubmission("same")).idempotencyKey;
    const raw = storage.getItem(draftKey(A, "manual"))!;
    now += DRAFT_TTL_MS;
    expect(parseDraft(raw, now)).toBeNull();
    expect(store.read(A, "manual").draft).toBeNull();
    expect(storage.getItem(draftKey(A, "manual"))).toBeNull();
    const reload = session(); reload.open(); expect(reload.restored).toBe(false);
    a.edit({ answer: "New active writing after expiry" });
    expect(store.read(A, "manual").draft?.createdAt).toBe(now);
    expect((await a.beginSubmission("same")).idempotencyKey).not.toBe(key);
  });
  it("removes corrupt/version-mismatched/future records without affecting typing", () => {
    filled(); const raw = JSON.parse(storage.getItem(draftKey(A, "manual"))!);
    for (const value of ["{broken", "null", JSON.stringify({ ...raw, version: 99 }), JSON.stringify({ ...raw, updatedAt: now + 1 }), JSON.stringify({ ...raw, task: `practice:${Q}:extra` })]) {
      storage.setItem(draftKey(A, "manual"), value);
      const reload = session(); reload.open();
      expect(reload.restored).toBe(false); expect(store.read(A, "manual").draft).toBeNull();
      reload.edit({ answer: "Still works" }); expect(reload.text.answer).toBe("Still works");
    }
  });
  it("unavailable and full storage never break editing or in-memory retry identity", async () => {
    store = new SessionDraftStore(() => { throw new Error("blocked"); }, () => now);
    const a = filled(); expect(a.available).toBe(false); expect(a.text.answer.length).toBeGreaterThan(500);
    const first = await a.beginSubmission("same"); expect((await a.beginSubmission("same")).idempotencyKey).toBe(first.idempotencyKey);
    store = new SessionDraftStore(() => storage, () => now);
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("full"); });
    const b = filled(); expect(b.available).toBe(false); expect(b.text.answer.length).toBeGreaterThan(500);
  });
  it("retries blocked sign-out cleanup before any later restore, even to the same account", () => {
    let blocked = false;
    store = new SessionDraftStore(() => { if (blocked) throw new Error("blocked"); return storage; }, () => now);
    filled(); blocked = true; expect(store.accountChanged(null)).toBe(false);
    blocked = false; store.accountChanged(A);
    const back = session(); back.open(); expect(back.text.answer).toBe("");
  });
  it.each(["save", "discard"])("retries blocked %s cleanup before the storage becomes readable again", async action => {
    let blocked = false;
    store = new SessionDraftStore(() => { if (blocked) throw new Error("blocked"); return storage; }, () => now);
    const a = filled(); const ticket = await a.beginSubmission("same");
    blocked = true;
    if (action === "save") expect(a.saved(ticket)).toBe(true); else a.discard();
    expect(a.available).toBe(false);
    blocked = false;
    const back = session(); back.open(); expect(back.text.answer).toBe("");
  });
  it("clears only after confirmed persistence; failure/unknown completion survives reload", async () => {
    const a = filled(); const ticket = await a.beginSubmission("unchanged request"); a.close();
    const retry = session(); retry.open();
    const again = await retry.beginSubmission("unchanged request");
    expect(again.idempotencyKey).toBe(ticket.idempotencyKey);
    expect(retry.saved(again)).toBe(true); expect(store.read(A, "manual").draft).toBeNull();
  });
  it("materially edited answers get a different request and old completion preserves new writing", async () => {
    const a = filled(); const first = await a.beginSubmission("original request");
    a.edit({ answer: "Newer text while request is in flight" });
    expect(a.saved(first)).toBe(false);
    expect(store.read(A, "manual").draft?.text.answer).toBe(a.text.answer);
    const edited = await a.beginSubmission("edited request"); expect(edited.idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it("a late result after navigation cannot remove a newer session's draft", async () => {
    const a = filled(); const first = await a.beginSubmission("original request"); a.close();
    const newer = session(); newer.open(); newer.edit({ answer: "New page text" });
    expect(a.saved(first)).toBe(false); expect(store.read(A, "manual").draft?.text.answer).toBe("New page text");
  });
  it("explicit discard invalidates old tickets and removes text", async () => {
    const a = filled(); const ticket = await a.beginSubmission("one"); a.discard();
    expect(a.text.answer).toBe(""); expect(a.saved(ticket)).toBe(false);
    expect(store.read(A, "manual").draft).toBeNull();
  });
  it("records terminal failure without changing text or rotating until an explicit submission", async () => {
    const a = filled();
    const text = { ...a.text };
    const ticket = await a.beginSubmission("unchanged request");
    expect(a.markTerminalFailure(ticket)).toBe(true);
    expect(a.text).toEqual(text);
    expect(a.getSnapshot().terminalFailed).toBe(true);
    expect(store.read(A, "manual").draft?.retry).toMatchObject({ idempotencyKey: ticket.idempotencyKey, terminal: true });
    const next = await a.beginSubmission("unchanged request");
    expect(next.idempotencyKey).not.toBe(ticket.idempotencyKey);
    expect(a.getSnapshot().terminalFailed).toBe(false);
    expect(a.text).toEqual(text);
    expect((await a.beginSubmission("unchanged request")).idempotencyKey).toBe(next.idempotencyKey);
  });
  it("restores terminal retry metadata without manufacturing a new operation on reload", async () => {
    const a = filled();
    const ticket = await a.beginSubmission("unchanged request");
    a.markTerminalFailure(ticket); a.close();
    const back = session(); back.open();
    expect(back.text).toEqual(a.text);
    expect(back.getSnapshot().terminalFailed).toBe(true);
    expect(store.read(A, "manual").draft?.retry?.idempotencyKey).toBe(ticket.idempotencyKey);
    const retry = await back.beginSubmission("unchanged request");
    expect(retry.idempotencyKey).not.toBe(ticket.idempotencyKey);
    expect(store.read(A, "manual").draft?.retry).not.toHaveProperty("terminal");
  });
  it("does not let a terminal response retire newer edits or a newer operation on unchanged text", async () => {
    const a = filled();
    const ticket = await a.beginSubmission("first request");
    a.edit({ answer: "Newer writing" });
    expect(a.markTerminalFailure(ticket)).toBe(false);
    expect(a.getSnapshot().terminalFailed).toBe(false);
    const newer = await a.beginSubmission("newer request");
    const latest = await a.beginSubmission("different marking decision");
    expect(a.markTerminalFailure(newer)).toBe(false);
    expect(store.read(A, "manual").draft?.retry?.idempotencyKey).toBe(latest.idempotencyKey);
    expect(a.text.answer).toBe("Newer writing");
  });
  it("does not mark failure after discard, navigation, or account change", async () => {
    const a = filled(); const ticket = await a.beginSubmission("request");
    a.discard(); expect(a.markTerminalFailure(ticket)).toBe(false);
    const b = filled(); const pending = await b.beginSubmission("request");
    b.close(); expect(b.markTerminalFailure(pending)).toBe(false);
    let current = true;
    const c = session("manual", A, () => current); c.open();
    const oldAccount = await c.beginSubmission("request");
    current = false;
    expect(c.markTerminalFailure(oldAccount)).toBe(false);
  });
  it("coalesces explicit terminal retries onto the one fresh key and preserves it with unavailable storage", async () => {
    store = new SessionDraftStore(() => { throw new Error("blocked"); }, () => now);
    const a = filled(); const ticket = await a.beginSubmission("request");
    a.markTerminalFailure(ticket);
    const [first, second] = await Promise.all([a.beginSubmission("request"), a.beginSubmission("request")]);
    expect(first.idempotencyKey).not.toBe(ticket.idempotencyKey);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(a.getSnapshot().terminalFailed).toBe(false);
    expect(a.text.answer).not.toBe("");
  });
  it("allowlists text and opaque replay metadata; no images, secrets or private guidance", async () => {
    const a = filled(`practice:${Q}`); await a.beginSubmission("question and answer only used transiently for hashing");
    const d = store.read(A, `practice:${Q}`).draft!;
    store.write({ ...d, blueprint: "private", apiKey: "secret", image: "data:image/png;base64,abc", token: "auth" } as typeof d);
    const raw = storage.getItem(draftKey(A, `practice:${Q}`))!;
    expect(raw).not.toMatch(/blueprint|private|apiKey|secret|image|token|auth|base64|blob:|transiently/);
    expect(JSON.parse(raw).text).toEqual({ question: "", source: "", answer: a.text.answer });
    expect(Object.keys(JSON.parse(raw).retry).sort()).toEqual(["fingerprint", "idempotencyKey"]);
    a.edit({ answer: "data:image/png;base64,abc" }); expect(a.available).toBe(false);
    const revision = filled(`revision:${Q}`);
    expect(store.read(A, revision.task).draft?.text).toMatchObject({ question: "", source: "Typed source data." });
    expect([...storage.values.keys()].every(key => key.startsWith(DRAFT_PREFIX))).toBe(true);
  });
  it("preserves an ordinary Data: source label without mistaking it for an image URL", () => {
    const a = filled();
    a.edit({ source: "Data: household spending increased while interest rates fell." });
    expect(a.available).toBe(true);
    expect(store.read(A, "manual").draft?.text.source).toBe(a.text.source);
  });
});
