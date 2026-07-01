/**
 * Reads and validates the onboarding display name from a Supabase
 * `user_metadata` object (from JWT claims or a session user). Returns the
 * trimmed name when it is a string of 1–40 characters after trimming,
 * otherwise null. Single source of truth for "does this user still need
 * onboarding?" — used by the route guard, the app shell, and the greeting.
 */
export function readDisplayName(userMetadata: unknown): string | null {
  if (userMetadata == null || typeof userMetadata !== "object") return null;
  const raw = (userMetadata as Record<string, unknown>).display_name;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length >= 1 && trimmed.length <= 40 ? trimmed : null;
}
