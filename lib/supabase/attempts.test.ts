import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAttempt } from "./attempts";

/** Chainable mock for `supabase.from("attempts").delete().eq("id", id)`. */
function mockDeleteClient(result: { error: unknown }) {
  const eq = vi.fn(async () => result);
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));
  return { client: { from } as unknown as SupabaseClient, from, del, eq };
}

describe("deleteAttempt — per-attempt student data control", () => {
  it("targets ONLY the selected attempt row by id", async () => {
    const { client, from, del, eq } = mockDeleteClient({ error: null });
    await deleteAttempt(client, "row-2");

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("attempts");
    expect(del).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "row-2");
  });

  it("throws on failure so callers can never optimistically drop the row", async () => {
    const { client } = mockDeleteClient({ error: { message: "network down" } });
    // The storage hook only broadcasts (and pages only resync) AFTER this
    // resolves — a rejection keeps the attempt visible with a retry.
    await expect(deleteAttempt(client, "row-2")).rejects.toBeTruthy();
  });
});
