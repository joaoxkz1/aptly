import "server-only";

export const STUDENT_PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export function validMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return false;
  if (!origin) return true; // JSON-only non-browser clients; browsers supply Origin for POST/PUT.
  try {
    const source = new URL(origin), target = new URL(request.url);
    // Next can normalize request.url to an internal hostname behind its proxy.
    // The HTTP Host is the browser-visible authority; never trust forwarded-host.
    return source.origin === origin && source.host === (request.headers.get("host") ?? target.host) &&
      (source.protocol === "https:" || source.protocol === target.protocol && target.protocol === "http:");
  } catch { return false; }
}
/** Bound the bytes actually read, including requests without Content-Length. */
export async function boundedJson(request: Request, maximum = 4096): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("payload too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body required");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new Error("payload too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
