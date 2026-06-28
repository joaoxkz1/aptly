import type { Metadata } from "next";
import "../globals.css";
import { geistSans, geistMono } from "../fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Aptly — IB Study Analytics Copilot",
  description:
    "Submit answers, get rubric-style feedback, track mistakes by topic, and know exactly what to study next.",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Route protection is enforced in the proxy; here we only read the
  // verified email to display it in the shell.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <AppShell email={email}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
