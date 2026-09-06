import React, { type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRenderer } from "@/lib/testing/hook-renderer";
import PracticePage from "./page";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  request: vi.fn(),
}));
let renderer: ReturnType<typeof createHookRenderer>;

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
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/lib/ai/practice-request", () => ({
  createPracticeGenerationClient: () => ({ request: mocks.request }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({
    data: { session: { user: { user_metadata: { economics_level: "sl" } } } },
  }) } }),
}));

type Node = ReactElement<{ children?: ReactNode; onClick?: () => void; role?: string }>;
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
    const route = PracticePage().props.children as ReactElement;
    const generator = (route.type as () => ReactElement)();
    return (generator.type as () => ReactElement)();
  });
}
function button(label: string) {
  const found = descendants(render()).find(node => node.props.onClick && textOf(node) === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function settle() {
  // Resolve the known getSession/request promise continuations; no timers or DOM.
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
async function click(label: string) {
  button(label).props.onClick!();
  await settle();
}
const saved = {
  status: 200, code: "", reference: null, reused: false,
  practiceQuestion: { id: "saved-question", question: "Explain scarcity. [10 marks]",
    markTotal: 10, framework: "paper1a_10_mark", skill: "economic_analysis",
    topicCode: "1.1", topicLabel: "Introduction", why: "Chosen topic." },
};
const uncertain = { status: 502, code: "practice_generation_failed", reference: null,
  reused: false, practiceQuestion: null };

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams("marks=10&topic=1.1");
  renderer = createHookRenderer();
  render();
  renderer.flushEffects();
  await settle();
});

describe("Practice recovery keeps the submitted generation intent", () => {
  it.each(["Try again", "Generate question"])("%s retries a failed Another question with regenerate:true", async retryLabel => {
    mocks.request.mockResolvedValueOnce(saved).mockResolvedValueOnce(uncertain).mockResolvedValueOnce(saved);
    await click("Generate question");
    await click("Another question");
    await click(retryLabel);
    expect(mocks.request.mock.calls.map(([request]) => request.regenerate)).toEqual([false, true, true]);
  });

  it("a changed topic starts a different intent instead of adopting the old retry", async () => {
    mocks.request.mockResolvedValueOnce(saved).mockResolvedValueOnce(uncertain).mockResolvedValueOnce(saved);
    await click("Generate question");
    await click("Another question");
    const nextTopic = descendants(render()).find(node => node.props.role === "option" && textOf(node).startsWith("1.2"));
    expect(nextTopic).toBeDefined();
    nextTopic!.props.onClick!();
    await click("Generate question");
    expect(mocks.request.mock.lastCall![0]).toMatchObject({ topicCode: "1.2", regenerate: false });
  });

  it("does not show an old result after the student changes the selection", async () => {
    let finish!: (value: typeof saved) => void;
    mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    button("Generate question").props.onClick!();
    const nextTopic = descendants(render()).find(node => node.props.role === "option" && textOf(node).startsWith("1.2"));
    nextTopic!.props.onClick!();
    finish(saved);
    await settle();
    expect(textOf(render())).not.toContain(saved.practiceQuestion.question);
    mocks.request.mockResolvedValueOnce(saved);
    await click("Generate question");
    expect(mocks.request.mock.lastCall![0]).toMatchObject({ courseLevel: "sl", topicCode: "1.2", regenerate: false });
  });
});
