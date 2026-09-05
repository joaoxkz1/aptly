import { isUuid } from "@/lib/auth/verified-user";

export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_PREFIX = "aptly:draft:v1:";
export type DraftTask = "manual" | `practice:${string}` | `revision:${string}`;
export interface DraftText { question: string; answer: string; source: string }
export interface DraftRetry { fingerprint: string; idempotencyKey: string }
export interface DraftRecord {
  version: 1;
  accountId: string;
  task: DraftTask;
  createdAt: number;
  updatedAt: number;
  text: DraftText;
  retry: DraftRetry | null;
  revision: string;
}
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export const EMPTY_DRAFT: DraftText = { question: "", answer: "", source: "" };
export function draftTask(reviseId: string | null, practiceId: string | null): DraftTask {
  return reviseId ? `revision:${reviseId}` : practiceId ? `practice:${practiceId}` : "manual";
}
function validTask(task: unknown): task is DraftTask {
  if (task === "manual") return true;
  if (typeof task !== "string") return false;
  const [kind, id, extra] = task.split(":");
  return (kind === "practice" || kind === "revision") && extra === undefined && isUuid(id);
}
export function draftKey(accountId: string, task: DraftTask): string {
  return `${DRAFT_PREFIX}${accountId}:${task}`;
}
function safeText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100_000 && !/(?:data:(?:[a-z0-9.+-]+\/|;|,)|blob:)/i.test(value);
}
function textOnly(value: DraftText, task: DraftTask): DraftText {
  return { question: task === "manual" ? value.question : "", answer: value.answer,
    source: task.startsWith("practice:") ? "" : value.source };
}

/** Allowlist every field, including on read. Never spread browser data into a request. */
export function parseDraft(raw: string, now: number): DraftRecord | null {
  try {
    const d = JSON.parse(raw);
    if (d.version !== DRAFT_VERSION || !isUuid(d.accountId) || !validTask(d.task) ||
      !Number.isFinite(d.createdAt) || !Number.isFinite(d.updatedAt) ||
      d.createdAt > now || d.updatedAt > now || d.updatedAt < d.createdAt ||
      now - d.createdAt >= DRAFT_TTL_MS || !isUuid(d.revision) ||
      !safeText(d.text?.question) || !safeText(d.text?.answer) || !safeText(d.text?.source)) return null;
    const retry = /^[a-f0-9]{64}$/.test(d.retry?.fingerprint) && isUuid(d.retry?.idempotencyKey)
      ? { fingerprint: d.retry.fingerprint, idempotencyKey: d.retry.idempotencyKey } : null;
    return { version: 1, accountId: d.accountId, task: d.task, createdAt: d.createdAt,
      updatedAt: d.updatedAt, text: textOnly(d.text, d.task), retry, revision: d.revision };
  } catch { return null; }
}

export class SessionDraftStore {
  private pendingAccount: string | undefined;
  private pendingRemovals = new Set<string>();
  constructor(private storage: () => DraftStorage, private now: () => number = Date.now) {}
  private purge(keepAccount?: string) {
    const s = this.storage();
    for (let i = s.length - 1; i >= 0; i--) {
      const key = s.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const draft = parseDraft(s.getItem(key) ?? "", this.now());
      if (!draft || (keepAccount !== undefined && draft.accountId !== keepAccount)) s.removeItem(key);
    }
  }
  /** Auth transitions remove actual draft records, never unrelated preferences. */
  accountChanged(accountId: string | null): boolean {
    try {
      this.flushCleanup(); this.purge(accountId ?? ""); return true;
    } catch { this.pendingAccount ??= accountId ?? ""; return false; }
  }
  private flushCleanup() {
    if (this.pendingAccount !== undefined) {
      this.purge(this.pendingAccount);
      this.pendingAccount = undefined;
    }
    for (const key of this.pendingRemovals) {
      this.storage().removeItem(key);
      this.pendingRemovals.delete(key);
    }
  }
  read(accountId: string, task: DraftTask): { draft: DraftRecord | null; available: boolean } {
    try {
      this.flushCleanup();
      this.purge();
      const raw = this.storage().getItem(draftKey(accountId, task));
      const draft = raw ? parseDraft(raw, this.now()) : null;
      return { draft: draft?.accountId === accountId && draft.task === task ? draft : null, available: true };
    } catch { return { draft: null, available: false }; }
  }
  write(record: DraftRecord): boolean {
    try {
      this.flushCleanup();
      this.purge();
      const safe = parseDraft(JSON.stringify(record), this.now());
      if (!safe) return false;
      this.storage().setItem(draftKey(safe.accountId, safe.task), JSON.stringify(safe));
      return true;
    } catch { return false; }
  }
  remove(accountId: string, task: DraftTask): boolean {
    const key = draftKey(accountId, task);
    try {
      this.storage().removeItem(key);
      this.pendingRemovals.delete(key);
      return true;
    } catch { this.pendingRemovals.add(key); return false; }
  }
}

// No browser access at module initialization (safe during server rendering).
export const browserDraftStore = new SessionDraftStore(() => window.sessionStorage);
let activeDraftAccount: string | null = null;
export function setDraftAccount(accountId: string | null) {
  if ((activeDraftAccount !== null && activeDraftAccount !== accountId) || accountId === null) {
    browserDraftStore.accountChanged(null);
  }
  activeDraftAccount = accountId;
  browserDraftStore.accountChanged(accountId);
}
export function clearBrowserDrafts() { setDraftAccount(null); }
export function isDraftAccount(accountId: string) { return activeDraftAccount === accountId; }

export interface SubmissionDraftTicket { revision: string; idempotencyKey: string }
interface DraftSnapshot { text: DraftText; restored: boolean; available: boolean }

/** Synchronous edits protect even an immediate reload; no debounce/unload race. */
export class DraftSession {
  text: DraftText;
  restored = false;
  available = true;
  private touched = false;
  private initialized = false;
  private active = false;
  private record: DraftRecord;
  private listeners = new Set<() => void>();
  private snapshot: DraftSnapshot;
  private initialSnapshot: DraftSnapshot;
  constructor(readonly accountId: string, readonly task: DraftTask,
    private store: SessionDraftStore, initial = EMPTY_DRAFT,
    private now: () => number = Date.now, private uuid: () => string = () => crypto.randomUUID(),
    private accountCurrent: () => boolean = () => true) {
    this.text = { ...initial };
    this.record = this.freshRecord();
    this.snapshot = this.initialSnapshot = { text: this.text, restored: false, available: true };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.initialSnapshot;
  refresh = () => {
    this.snapshot = { text: this.text, restored: this.restored, available: this.available };
    this.listeners.forEach(listener => listener());
  };
  private freshRecord(): DraftRecord {
    return { version: 1, accountId: this.accountId, task: this.task, createdAt: this.now(), updatedAt: this.now(),
      text: textOnly(this.text, this.task), retry: null, revision: this.uuid() };
  }
  isCurrent() { return this.active && this.accountCurrent(); }
  open(restore = true) {
    this.active = true;
    if (this.initialized || !this.accountCurrent()) return;
    this.initialized = true;
    const read = this.store.read(this.accountId, this.task);
    this.available = read.available;
    if (restore && !this.touched && read.draft) {
      this.record = read.draft;
      this.text = { ...read.draft.text };
      this.restored = true;
    }
    if (this.touched) this.persist();
    this.refresh();
  }
  close() { this.active = false; }
  edit(patch: Partial<DraftText>, persist = true) {
    this.touched = true;
    this.text = { ...this.text, ...patch };
    this.record = { ...this.record, revision: this.uuid() };
    if (persist) this.persist();
    this.refresh();
  }
  private persist() {
    if (!this.isCurrent()) return;
    if (this.now() - this.record.createdAt >= DRAFT_TTL_MS) this.record = this.freshRecord();
    this.record = { ...this.record, text: textOnly(this.text, this.task), updatedAt: this.now() };
    this.available = this.store.write(this.record);
  }
  discard() {
    this.touched = true;
    this.restored = false;
    this.text = { ...EMPTY_DRAFT };
    this.record = this.freshRecord();
    this.available = this.store.remove(this.accountId, this.task);
    this.refresh();
  }
  async beginSubmission(signature: string): Promise<SubmissionDraftTicket> {
    this.persist(); // expire old retry metadata before capturing the request
    const revision = this.record.revision;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature));
    const fingerprint = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const idempotencyKey = this.record.retry?.fingerprint === fingerprint ? this.record.retry.idempotencyKey : this.uuid();
    // An edit/auth change while hashing must not attach an older retry to new text.
    if (this.isCurrent() && this.record.revision === revision) {
      this.record.retry = { fingerprint, idempotencyKey };
      this.persist();
      this.refresh();
    }
    return { revision, idempotencyKey };
  }
  matches(ticket: SubmissionDraftTicket) { return this.isCurrent() && ticket.revision === this.record.revision; }
  /** Confirmed persistence only. Failures/unknown completion never call this. */
  saved(ticket: SubmissionDraftTicket): boolean {
    if (!this.matches(ticket)) return false;
    const stored = this.store.read(this.accountId, this.task).draft;
    if (stored && stored.revision !== ticket.revision) return false;
    this.available = this.store.remove(this.accountId, this.task);
    this.record.retry = null;
    this.restored = false;
    this.refresh();
    return true;
  }
}
