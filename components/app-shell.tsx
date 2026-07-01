"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/submit", label: "Submit Answer", icon: PenLine },
  { href: "/attempts", label: "Attempts Log", icon: History },
  { href: "/analytics", label: "Mistake Analytics", icon: BarChart3 },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="h-5 w-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Aptly</span>
    </Link>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
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
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/60 px-4 py-6 backdrop-blur md:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-1">
          <div className="min-w-0 text-xs text-muted-foreground">
            {displayName ? (
              <p className="truncate font-medium text-foreground" title={displayName}>
                {displayName}
              </p>
            ) : null}
            <p className="truncate" title={email ?? undefined}>
              {email ?? "Signed in"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
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

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>

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
