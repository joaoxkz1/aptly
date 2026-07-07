"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtractedFields } from "@/lib/ai/extraction-schema";
import { clientMessageForExtractionFailure } from "@/lib/ai/extract-errors";
import { EXTRACTION_REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import {
  applyExtractionToFields,
  canFillFromScan,
  fillsAnything,
  type ExtractionFill,
  type SubmitFieldState,
} from "@/lib/scan/apply-extraction";
import {
  SCAN_ACCEPT,
  processScanImage,
  validateScanFile,
  type ScanFileError,
} from "@/lib/scan/client-image";
import { createSingleFlight } from "@/lib/scan/single-flight";
import { scanPrivacyDisclosure } from "@/lib/scan/privacy-disclosure";

const FILE_ERROR_COPY: Record<ScanFileError, string> = {
  unsupported_type: "That file type is not supported. Use JPG, PNG, or WebP.",
  too_large: "That image is too large. Choose an image under 8 MB.",
  unreadable: "Aptly could not read that image clearly. Try a closer, brighter photo.",
};

const NOTHING_EMPTY_COPY =
  "Your question and answer already have text. Clear a field to fill it from a photo.";
const REVIEW_COPY = "Check the extracted text. You can edit anything before grading.";
const KEPT_COPY = "Your typed text was kept — nothing was empty to fill.";

// What Scan is FOR, stated up front — so it is never confused with the
// separate close-up diagram review next to it (Upload Clarity audit).
const SCAN_HELPER_COPY =
  "Reads the written text from a photo of your answer page into the empty fields. It doesn't review diagrams — use “Add your diagram” for that.";

type ScanStatus = "idle" | "preparing" | "reading" | "done" | "error";

/**
 * The ONE understated attachment control for the manual Submit flow (Aptly
 * Scan). A student attaches a single photo; the processed image is read once
 * by the extraction route and the candidate text fills only genuinely empty
 * fields (via the page's fill callback). The photo itself is transient local
 * state: never stored, never attached to the attempt, never sent to grading.
 * Removing it leaves every text field exactly as the student left it.
 */
export function ScanAttachment({
  disabled,
  getFields,
  onFill,
  onRemoved,
  onReadingChange,
}: {
  disabled: boolean;
  /** Reads the CURRENT field values at fill time (typing during extraction wins). */
  getFields: () => SubmitFieldState;
  /** Apply a computed fill-only-empty-fields result. */
  onFill: (fill: ExtractionFill) => void;
  /** The photo was removed — clear any staged (not-yet-reviewed) source. */
  onRemoved: () => void;
  /** True while an extraction request is in flight (page pauses grading). */
  onReadingChange?: (reading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // One extraction request at a time per tab: duplicate triggers join the
  // in-flight call instead of paying for a second one.
  const flightRef = useRef(createSingleFlight<void>());
  const [attachment, setAttachment] = useState<{ previewUrl: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // The preview object URL is local temporary UI state only — revoked when
  // the photo is removed/replaced or the control unmounts.
  useEffect(() => {
    const url = attachment?.previewUrl;
    return () => {
      if (url != null) URL.revokeObjectURL(url);
    };
  }, [attachment]);

  const reading = status === "reading" || status === "preparing";
  useEffect(() => {
    onReadingChange?.(reading);
  }, [reading, onReadingChange]);

  async function extract(blob: Blob) {
    setStatus("reading");
    setMessage(null);
    await flightRef.current.run(async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(
        () => controller.abort(),
        EXTRACTION_REQUEST_TIMEOUT_MS + 5000
      );
      try {
        const form = new FormData();
        // Generic name: the original file name never leaves the device.
        form.append("image", blob, "scan.jpg");
        const res = await fetch("/api/extract", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });

        if (!res.ok) {
          let code = "extraction_failed";
          let reference: string | null = null;
          try {
            const body = (await res.json()) as { error?: string; reference?: string };
            if (typeof body.error === "string") code = body.error;
            if (typeof body.reference === "string") reference = body.reference;
          } catch {
            // ignore parse failure; use the generic code
          }
          setStatus("error");
          setMessage(clientMessageForExtractionFailure(res.status, code, reference));
          return;
        }

        const { extracted } = (await res.json()) as { extracted: ExtractedFields };
        // Fill-only-empty against the CURRENT values — anything the student
        // typed (before or during the scan) is never overwritten.
        const fill = applyExtractionToFields(getFields(), extracted);
        onFill(fill);
        setStatus("done");
        setMessage(fillsAnything(fill) ? REVIEW_COPY : KEPT_COPY);
      } catch {
        setStatus("error");
        setMessage(clientMessageForExtractionFailure(502, "extraction_failed"));
      } finally {
        window.clearTimeout(timer);
      }
    });
  }

  async function handleSelected(file: File) {
    const fileError = validateScanFile(file);
    if (fileError !== null) {
      setStatus("error");
      setMessage(FILE_ERROR_COPY[fileError]);
      return;
    }
    // Nothing honestly fillable → no upload and no paid extraction at all.
    if (!canFillFromScan(getFields())) {
      setStatus("error");
      setMessage(NOTHING_EMPTY_COPY);
      return;
    }

    setStatus("preparing");
    setMessage(null);
    let blob: Blob;
    try {
      // Downscale to ≤2048px, flatten to white, re-encode as JPEG — the fresh
      // bitstream carries none of the original EXIF/GPS metadata.
      blob = await processScanImage(file);
    } catch {
      setStatus("error");
      setMessage(FILE_ERROR_COPY.unreadable);
      return;
    }
    if (attachment !== null) onRemoved(); // replacing: staged source resets
    setAttachment({ previewUrl: URL.createObjectURL(blob), blob });
    await extract(blob);
  }

  function handleRemove() {
    setAttachment(null);
    setStatus("idle");
    setMessage(null);
    onRemoved();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={SCAN_ACCEPT}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so re-selecting the same file fires change again.
          e.target.value = "";
          if (file != null) void handleSelected(file);
        }}
      />

      {attachment === null ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || reading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Scan your answer page (optional)
          </Button>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{SCAN_HELPER_COPY}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-2.5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never a remote asset */}
          <img
            src={attachment.previewUrl}
            alt="Attached photo of your work"
            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Photo attached</p>
            {/* Conditional privacy disclosure: rendered only while this
                attachment branch exists, so removing the photo hides it. */}
            <p>{scanPrivacyDisclosure(attachment !== null)}</p>
          </div>
          {status === "error" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || reading}
              onClick={() => void extract(attachment.blob)}
            >
              Try again
            </Button>
          )}
          <button
            type="button"
            onClick={handleRemove}
            disabled={reading}
            aria-label="Remove attached photo"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {reading && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reading your image…
        </p>
      )}
      {!reading && message !== null && (
        <p
          className={
            status === "error"
              ? "inline-flex items-start gap-1.5 text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {status === "error" && <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}
