"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  History,
  LayoutDashboard,
  LogOut,
  PenLine,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { LegalFooter } from "./legal/legal-footer";
import { DraftAccountBoundary } from "./draft-account-boundary";
import { clearBrowserDrafts } from "@/lib/drafts/session-draft";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/practice", label: "Practice", icon: Sparkles },
  { href: "/submit", label: "Submit", icon: PenLine },
  { href: "/attempts", label: "History", icon: History },
  { href: "/analytics", label: "Progress", icon: BarChart3 },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <BrandMark />
      <span className="text-lg font-bold tracking-[-0.035em]">Aptly</span>
    </Link>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      pending.current = false;
      setBusy(false);
      setError("Couldn't sign out. Please try again.");
      return;
    }
    // Keep the authenticated editor's draft boundary intact until sign-out
    // succeeds. A failed request must not disable later draft persistence.
    clearBrowserDrafts();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={signOut}
        disabled={busy}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
      {error && (
        <span role="alert" className="absolute right-0 top-full z-30 mt-2 w-52 rounded-lg border border-border bg-card p-2 text-xs text-foreground shadow-md md:bottom-full md:top-auto md:mb-2 md:mt-0 md:w-48">
          {error}
        </span>
      )}
    </div>
  );
}

export function AppShell({
  children,
  email,
  displayName,
}: {
  children: React.ReactNode;
  email?: string | null;
  displayName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border/80 bg-card/72 px-3.5 py-5 backdrop-blur-xl md:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all",
                  active
                    ? "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_rgba(85,72,231,0.08)]"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold uppercase text-accent-foreground">
            {(displayName ?? email ?? "A").trim().charAt(0)}
          </span>
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {displayName ? (
              <p className="truncate font-medium text-foreground" title={displayName}>
                {displayName}
              </p>
            ) : null}
            <p className="truncate text-[11px]" title={email ?? undefined}>
              {displayName ? "Student account" : (email ?? "Signed in")}
            </p>
          </div>
          <SignOutButton />
        </div>
        <div className="mt-2 flex justify-end px-1"><ThemeToggle /></div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        {/* Modest widening on large desktops for Dashboard / Learning log /
            Analytics. The Submit and feedback flows self-constrain to max-w-3xl,
            so they are unaffected. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-8 md:px-8 md:py-9 md:pb-10 lg:px-10">
          <DraftAccountBoundary>{children}</DraftAccountBoundary>
        </main>

        {/* Tiny legal footer. It carries the bottom clearance the mobile nav
            needs (previously main's pb-24), so total page tail space is
            unchanged and study content keeps its spacing. */}
        <LegalFooter className="pb-24 md:pb-8" includeYourData />

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card/95 backdrop-blur md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
