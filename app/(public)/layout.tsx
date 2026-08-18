import type { Metadata } from "next";
import "../globals.css";
import { geistSans, geistMono } from "../fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { LegalFooter } from "@/components/legal/legal-footer";

export const metadata: Metadata = {
  title: "Sign in — Aptly",
  description: "Sign in to Aptly — practice feedback and study insights for IB Economics.",
};

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Column layout so the tiny legal footer sits below the page content
          instead of being pushed off-screen by a full-height child. */}
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <div className="flex flex-1 flex-col">{children}</div>
          <LegalFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
