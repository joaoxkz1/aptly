"use client";
import { useEffect } from "react";
import type { EventInput, EventName } from "./events";

/** No durable browser queue: never replay another account's interactions after sign-out. */
export function trackInteraction(input: EventInput): void {
  void fetch("/api/analytics/events", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input), credentials: "same-origin", keepalive: true,
  }).catch(() => { /* Optional signal; never interrupt learning or retry across accounts. */ });
}

export function useInteractionView(event: EventName, enabled = true, attemptId?: string) {
  useEffect(() => {
    if (!enabled) return;
    // Delay eliminates StrictMode duplicate effects and fleeting/aborted page loads.
    const timer = setTimeout(() => trackInteraction({ event, attemptId }), 1000);
    return () => clearTimeout(timer);
  }, [event, enabled, attemptId]);
}
