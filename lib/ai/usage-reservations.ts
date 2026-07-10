import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export type AICapability = "grade" | "scan" | "diagram" | "practice";
export type ReservationOutcome =
  | "reserved"
  | "replay"
  | "in_progress"
  | "failed"
  | "limited"
  | "conflict";
export type FailureCategory =
  | "provider"
  | "validation"
  | "persistence"
  | "stale"
  | "internal";

export interface UsageReservation {
  outcome: ReservationOutcome;
  reservationId: string | null;
  status: "reserved" | "processing" | "succeeded" | "failed" | null;
  relatedAttemptId: string | null;
  relatedPracticeId: string | null;
  resultHash: string | null;
}

interface ReservationRpcRow {
  outcome: string;
  reservation_id: string | null;
  reservation_status: UsageReservation["status"];
  related_attempt_id: string | null;
  related_practice_id: string | null;
  result_hash: string | null;
}

export async function reserveAIUsage(input: {
  userId: string;
  capability: AICapability;
  idempotencyKey: string;
  fingerprint: string;
  operationGroupKey?: string | null;
  dailyLimit: number;
}): Promise<UsageReservation> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("reserve_ai_usage", {
    p_user_id: input.userId,
    p_capability: input.capability,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: input.fingerprint,
    p_operation_group_key: input.operationGroupKey ?? null,
    p_daily_limit: input.dailyLimit,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ReservationRpcRow | null;
  const outcomes: readonly string[] = [
    "reserved",
    "replay",
    "in_progress",
    "failed",
    "limited",
    "conflict",
  ];
  if (row == null || !outcomes.includes(row.outcome)) {
    throw new Error("invalid reservation response");
  }
  return {
    outcome: row.outcome as ReservationOutcome,
    reservationId: row.reservation_id,
    status: row.reservation_status,
    relatedAttemptId: row.related_attempt_id,
    relatedPracticeId: row.related_practice_id,
    resultHash: row.result_hash,
  };
}

async function updateReservation(
  admin: SupabaseClient,
  reservationId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const { data, error } = await admin
    .from("ai_usage_reservations")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", reservationId)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (error || data == null) throw error ?? new Error("reservation update failed");
}

export async function markReservationProcessing(
  reservationId: string,
  userId: string
): Promise<void> {
  const now = new Date().toISOString();
  await updateReservation(getAdminClient(), reservationId, userId, {
    status: "processing",
    processing_started_at: now,
    failure_category: null,
  });
}

export async function markReservationSucceeded(
  reservationId: string,
  userId: string,
  related?: {
    attemptId?: string | null;
    practiceId?: string | null;
    resultHash?: string | null;
  }
): Promise<void> {
  await updateReservation(getAdminClient(), reservationId, userId, {
    status: "succeeded",
    completed_at: new Date().toISOString(),
    failure_category: null,
    related_attempt_id: related?.attemptId ?? null,
    related_practice_id: related?.practiceId ?? null,
    result_hash: related?.resultHash ?? null,
  });
}

export async function markReservationFailed(
  reservationId: string | null,
  userId: string,
  category: FailureCategory
): Promise<void> {
  if (reservationId === null) return;
  try {
    await updateReservation(getAdminClient(), reservationId, userId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      failure_category: category,
    });
  } catch {
    // The original failure remains the route's response. Stale recovery in the
    // atomic RPC closes abandoned reserved/processing rows after 15 minutes;
    // the row still counts either way.
  }
}

export async function fetchReservationForUser(
  userId: string,
  reservationId: string
): Promise<{
  capability: AICapability;
  status: string;
  operationGroupKey: string | null;
  resultHash: string | null;
} | null> {
  const { data, error } = await getAdminClient()
    .from("ai_usage_reservations")
    .select("capability, status, operation_group_key, result_hash")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data == null) return null;
  const row = data as {
    capability: AICapability;
    status: string;
    operation_group_key: string | null;
    result_hash: string | null;
  };
  return {
    capability: row.capability,
    status: row.status,
    operationGroupKey: row.operation_group_key,
    resultHash: row.result_hash,
  };
}
