import type { DependencyList, Dispatch, EffectCallback, SetStateAction } from "react";

/**
 * Test-only callback harness for the Node suite. It retains hook state while
 * callers explicitly render the real component and flush its effects. It does
 * not simulate the DOM, React scheduling, child components, or Strict Mode;
 * browser checks cover those boundaries.
 */
export function createHookRenderer() {
  const slots: unknown[] = [];
  const cleanups = new Set<() => void>();
  let cursor = 0;
  let effects: (() => void)[] = [];
  const sameDeps = (left: DependencyList | undefined, right: DependencyList | undefined) =>
    left !== undefined && right !== undefined && left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));

  const hooks = {
    useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [slots[index] as T, value => {
        slots[index] = typeof value === "function" ? (value as (previous: T) => T)(slots[index] as T) : value;
      }];
    },
    useRef<T>(initial: T): { current: T } {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useMemo<T>(factory: () => T, deps: DependencyList | undefined): T {
      const index = cursor++;
      const previous = slots[index] as { value: T; deps: DependencyList | undefined } | undefined;
      if (!previous || !sameDeps(previous.deps, deps)) slots[index] = { value: factory(), deps };
      return (slots[index] as { value: T }).value;
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: DependencyList | undefined): T {
      return hooks.useMemo(() => callback, deps);
    },
    useEffect(effect: EffectCallback, deps?: DependencyList) {
      const index = cursor++;
      const previous = slots[index] as { deps: DependencyList | undefined; cleanup?: () => void } | undefined;
      if (previous && sameDeps(previous.deps, deps)) return;
      const next: { deps: DependencyList | undefined; cleanup?: () => void } = { deps };
      slots[index] = next;
      effects.push(() => {
        if (previous?.cleanup) {
          previous.cleanup();
          cleanups.delete(previous.cleanup);
        }
        const cleanup = effect();
        if (cleanup) {
          next.cleanup = cleanup;
          cleanups.add(cleanup);
        }
      });
    },
  };

  return {
    hooks,
    render<T>(component: () => T): T { cursor = 0; return component(); },
    flushEffects() {
      const pending = effects;
      effects = [];
      pending.forEach(effect => effect());
    },
    unmount() { cleanups.forEach(cleanup => cleanup()); cleanups.clear(); effects = []; },
  };
}
