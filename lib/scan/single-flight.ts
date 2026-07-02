/**
 * Single-flight guard (Aptly Scan) — pure, unit-tested.
 *
 * One selected image must produce at most ONE in-flight extraction request per
 * browser tab: while a call is running, duplicate triggers (double clicks,
 * rerenders, effect re-runs) share the SAME promise instead of starting a new
 * paid request. After the promise settles — success or failure — the guard
 * resets, so an explicit retry after a genuine failure makes exactly one new
 * request.
 */

export interface SingleFlight<T> {
  /** Run `fn`, or join the already in-flight run. */
  run(fn: () => Promise<T>): Promise<T>;
  /** True while a run is in flight. */
  inFlight(): boolean;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  let current: Promise<T> | null = null;
  return {
    run(fn: () => Promise<T>): Promise<T> {
      if (current !== null) return current;
      const p = fn().finally(() => {
        if (current === p) current = null;
      });
      current = p;
      return p;
    },
    inFlight() {
      return current !== null;
    },
  };
}
