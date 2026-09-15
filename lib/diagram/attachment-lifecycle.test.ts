import React, { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRenderer } from "@/lib/testing/hook-renderer";
import { DiagramAttachment } from "@/components/submit/diagram-attachment";

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
let renderer: ReturnType<typeof createHookRenderer>;
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useState: <T,>(initial: T | (() => T)) => renderer.hooks.useState(initial),
    useRef: <T,>(initial: T) => renderer.hooks.useRef(initial),
    useEffect: (...args: Parameters<typeof actual.useEffect>) => renderer.hooks.useEffect(...args),
  };
});
vi.mock("@/lib/scan/client-image", () => ({
  SCAN_ACCEPT: "image/jpeg", validateScanFile: () => null,
  processScanImage: mocks.process, ProcessedImageTooLargeError: class extends Error {},
}));
type Node = ReactElement<{ children?: ReactNode; onChange?: (event: unknown) => void }>;
function descendants(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Node;
  return [element, ...descendants(element.props.children)];
}
beforeEach(() => {
  renderer = createHookRenderer(); mocks.process.mockReset();
  vi.stubGlobal("React", React);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { renderer.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function select(onAttachedChange: (image: Blob | null) => void) {
  const view = renderer.render(() => DiagramAttachment({ disabled: false, onAttachedChange }));
  renderer.flushEffects();
  const input = descendants(view).find(node => node.type === "input")!;
  input.props.onChange!({ target: { files: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })], value: "photo.jpg" } });
}
async function settle() { for (let count = 0; count < 6; count += 1) await Promise.resolve(); }
describe("diagram photo preparation lifecycle", () => {
  it("drops a late processed photo after task/account unmount", async () => {
    let release!: (blob: Blob) => void;
    mocks.process.mockReturnValue(new Promise<Blob>(resolve => { release = resolve; }));
    const attached = vi.fn(); select(attached); renderer.unmount();
    release(new Blob(["late"])); await settle();
    expect(attached).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("only applies the latest selected image when preparation completes out of order", async () => {
    let releaseOld!: (blob: Blob) => void;
    mocks.process.mockReturnValueOnce(new Promise<Blob>(resolve => { releaseOld = resolve; }))
      .mockResolvedValueOnce(new Blob(["new"]));
    const attached = vi.fn(); select(attached); select(attached); await settle();
    const current = attached.mock.calls[0][0];
    releaseOld(new Blob(["old"])); await settle();
    expect(attached).toHaveBeenCalledTimes(1);
    expect(await current.text()).toBe("new");
  });
});
