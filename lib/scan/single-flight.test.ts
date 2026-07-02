import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight — one extraction request per image per tab", () => {
  it("duplicate triggers while in flight share ONE call", async () => {
    const flight = createSingleFlight<string>();
    let release!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

    const first = flight.run(fn);
    const second = flight.run(fn); // double click / rerender
    const third = flight.run(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(flight.inFlight()).toBe(true);

    release("done");
    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
    await expect(third).resolves.toBe("done");
    expect(flight.inFlight()).toBe(false);
  });

  it("an explicit retry AFTER a genuine failure makes exactly one new call", async () => {
    const flight = createSingleFlight<string>();
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("recovered");

    await expect(flight.run(fn)).rejects.toThrow("network");
    expect(flight.inFlight()).toBe(false);

    await expect(flight.run(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a new run after success is a genuine new call (replace image)", async () => {
    const flight = createSingleFlight<number>();
    const fn = vi.fn(async () => 1);
    await flight.run(fn);
    await flight.run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
