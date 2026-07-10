"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SCAN_ACCEPT,
  ProcessedImageTooLargeError,
  processScanImage,
  validateScanFile,
  type ScanFileError,
} from "@/lib/scan/client-image";
import {
  clientImageTooLargeMessage,
  clientUnreadableImageMessage,
  clientUnsupportedTypeMessage,
} from "@/lib/ai/extract-errors";
import { diagramPrivacyDisclosure } from "@/lib/diagram/evidence";

const FILE_ERROR_COPY: Record<ScanFileError, string> = {
  unsupported_type: clientUnsupportedTypeMessage(),
  too_large: clientImageTooLargeMessage(),
  processed_too_large:
    "That photo is still too large after preparation. Crop it closer or choose a lower-resolution image.",
  unreadable: clientUnreadableImageMessage(),
};

const HELPER_COPY =
  "If you drew a diagram or graph for this answer, attach a close-up photo of just the diagram. If it is on your answer page, take a separate close-up of the diagram.";

type DiagramAttachStatus = "idle" | "preparing" | "attached" | "error";

/**
 * The ONE optional diagram attachment control for the Submit flow (Diagram
 * Evidence V1). A student attaches a single close-up photo of their drawn
 * diagram; NOTHING is uploaded at attach time — the processed image is held
 * as transient local state and reviewed once, at grade time, by the separate
 * diagram-review route. It never fills text fields, never touches the Scan
 * flow, and is never sent to grading. Removing it leaves the whole form
 * exactly as the student left it.
 *
 * Exactly one diagram can be active: selecting another photo replaces the
 * current one (and the parent clears any memoised review for the old photo).
 */
export function DiagramAttachment({
  disabled,
  onAttachedChange,
}: {
  disabled: boolean;
  /** The processed photo to review at grade time, or null when removed. */
  onAttachedChange: (image: Blob | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<{ previewUrl: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<DiagramAttachStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // The preview object URL is local temporary UI state only — revoked when
  // the photo is removed/replaced or the control unmounts.
  useEffect(() => {
    const url = attachment?.previewUrl;
    return () => {
      if (url != null) URL.revokeObjectURL(url);
    };
  }, [attachment]);

  const preparing = status === "preparing";

  async function handleSelected(file: File) {
    const fileError = validateScanFile(file);
    if (fileError !== null) {
      setStatus(attachment !== null ? "attached" : "error");
      setMessage(FILE_ERROR_COPY[fileError]);
      return;
    }

    setStatus("preparing");
    setMessage(null);
    let blob: Blob;
    try {
      // Downscale to ≤2048px, flatten to white, re-encode as JPEG — the fresh
      // bitstream carries none of the original EXIF/GPS metadata.
      blob = await processScanImage(file);
    } catch (error) {
      setStatus(attachment !== null ? "attached" : "error");
      setMessage(
        error instanceof ProcessedImageTooLargeError
          ? FILE_ERROR_COPY.processed_too_large
          : FILE_ERROR_COPY.unreadable
      );
      return;
    }
    setAttachment({ previewUrl: URL.createObjectURL(blob), blob });
    setStatus("attached");
    // Replacing counts as a new photo: the parent drops any memoised review.
    onAttachedChange(blob);
  }

  function handleRemove() {
    setAttachment(null);
    setStatus("idle");
    setMessage(null);
    onAttachedChange(null);
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
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add your diagram (optional)
          </Button>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{HELPER_COPY}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-2.5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never a remote asset */}
          <img
            src={attachment.previewUrl}
            alt="Attached photo of your diagram"
            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Diagram attached</p>
            {/* Conditional privacy + limitation disclosure: rendered only while
                this attachment branch exists, so removing the photo hides it. */}
            <p>{diagramPrivacyDisclosure(attachment !== null)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || preparing}
            aria-label="Remove attached diagram photo"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {preparing && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Preparing your diagram photo…
        </p>
      )}
      {!preparing && message !== null && (
        <p className="inline-flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
}
