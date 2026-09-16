import { isUuid } from "@/lib/auth/verified-user";

export const EVENT_NAMES = [
  "feedback_viewed", "next_step_clicked", "current_focus_viewed", "targeted_practice_started",
  "practice_started", "revision_started", "history_viewed", "onboarding_completed",
  "diagram_upload_started", "diagram_removed_before_submit",
] as const;
export type EventName = typeof EVENT_NAMES[number];
export type EventInput = {
  event: EventName;
  attemptId?: string;
  practiceQuestionId?: string;
  properties?: { source?: "general" | "current_focus" | "answer_feedback" | "history" | "result"; action?: "revise" | "practice" };
};
const SOURCES = ["general", "current_focus", "answer_feedback", "history", "result"];

export function parseEvent(value: unknown): EventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["event", "attemptId", "practiceQuestionId", "properties"].includes(k)) ||
    !EVENT_NAMES.includes(v.event as EventName)) return null;
  if (v.attemptId !== undefined && !isUuid(v.attemptId) || v.practiceQuestionId !== undefined && !isUuid(v.practiceQuestionId)) return null;
  if (["feedback_viewed", "next_step_clicked", "revision_started"].includes(String(v.event)) && !isUuid(v.attemptId)) return null;
  const props = v.properties ?? {};
  if (typeof props !== "object" || Array.isArray(props) || JSON.stringify(props).length > 256) return null;
  for (const [key, val] of Object.entries(props)) {
    if (key === "source" && typeof val === "string" && SOURCES.includes(val)) continue;
    if (key === "action" && v.event === "next_step_clicked" && (val === "revise" || val === "practice")) continue;
    return null;
  }
  return { event: v.event as EventName, attemptId: v.attemptId as string | undefined,
    practiceQuestionId: v.practiceQuestionId as string | undefined, properties: props };
}
