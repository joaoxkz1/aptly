import "server-only";
import { getAdminClient } from "./admin";
import { findAttemptById } from "./server-authority";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import { reservationSnapshot, type AssessmentSnapshot } from "@/lib/assessment/assessment-snapshot";
import type { Attempt } from "@/lib/types";

/** Completed combined requests keep their frozen contract across workflow upgrades.
 * The historical export name is retained for compatibility with route mocks. */
export async function completedEssayReplay(userId: string, key: string, request: Record<string, unknown>, imageHash: string | null): Promise<
  { kind: "none" } | { kind: "conflict" } | { kind: "replay"; attempt: Attempt }
> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("assessment_snapshots").select("snapshot,attempt_id")
    .eq("user_id", userId).eq("operation_key", key).maybeSingle();
  if (error) throw error;
  if (!data) return { kind: "none" };
  const stored = data.snapshot as AssessmentSnapshot;
  if (!["holistic_diagram", "four_mark_diagram", "four_mark_written"].includes(stored.contract.mode)) return { kind: "none" };
  const { data: reservation, error: reservationError } = await admin.from("ai_usage_reservations")
    .select("request_fingerprint").eq("user_id", userId).eq("idempotency_key", key).eq("capability", "grade").maybeSingle();
  if (reservationError) throw reservationError;
  // The fingerprint was captured before observation, but after artifact hashing.
  const incomingHashes = imageHash ? [imageHash] : [];
  const savedHashes = stored.attachments.map(attachment => attachment.contentHash);
  const reserved = reservationSnapshot(stored);
  if (stored.resolutionInputContract) reserved.contractHash = requestFingerprint(reserved.contract);
  if (!reservation || JSON.stringify(incomingHashes) !== JSON.stringify(savedHashes) ||
      requestFingerprint({ request, snapshot: reserved }) !== reservation.request_fingerprint) {
    return { kind: "conflict" };
  }
  const attempt = await findAttemptById(userId, data.attempt_id);
  if (!attempt) throw new Error("completed essay result unavailable");
  return { kind: "replay", attempt };
}
