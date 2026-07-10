"use client";

import Link from "next/link";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AttemptsLoadStatus } from "@/lib/storage-state";

export function AttemptsLoadNotice({
  status,
  hasData,
  onRetry,
}: {
  status: AttemptsLoadStatus;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (status === "ready") return null;
  if (status === "loading" && hasData) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Refreshing your saved answers…
      </p>
    );
  }
  if (status === "error" && hasData) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <CircleAlert className="h-3.5 w-3.5 text-destructive" />
        <span>Couldn’t refresh; showing your last loaded answers.</span>
        <button type="button" className="font-medium text-primary hover:underline" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  const content =
    status === "loading" ? (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your saved answers…
      </p>
    ) : status === "unauthorized" ? (
      <div className="flex flex-col items-center gap-2 text-center">
        <CircleAlert className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Your session has ended. Sign in again to load your private answers.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Sign in
        </Link>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2 text-center">
        <CircleAlert className="h-5 w-5 text-destructive" />
        <p className="text-sm text-muted-foreground">
          We couldn’t refresh your saved answers. Known data has been kept.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  return (
    <Card>
      <CardContent className="flex justify-center py-8">{content}</CardContent>
    </Card>
  );
}
