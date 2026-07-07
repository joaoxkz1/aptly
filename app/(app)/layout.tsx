import type { Metadata } from "next";
import "../globals.css";
import { geistSans, geistMono } from "../fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { readDisplayName } from "@/lib/auth/display-name";

export const metadata: Metadata = {
  title: "Aptly — Study feedback",
  description:
    "Submit answers, get rubric-style feedback, track mistakes by topic, and know exactly what to study next.",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Route protection is enforced in the proxy; here we only read the
  // verified email and display name to show them in the shell.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  const displayName = readDisplayName(data?.claims?.user_metadata);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <AppShell email={email} displayName={displayName}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
