import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { LEGAL_LAST_UPDATED } from "@/lib/legal/operator";

/**
 * Shared shell for /privacy and /terms.
 *
 * These read like Aptly pages, not imported legal templates: the normal app
 * width, the normal type scale, muted body text, and no warning colours or
 * oversized cards. Element-level typography is applied with Tailwind arbitrary
 * variants so each page body stays plain, readable JSX.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandMark />
          <span className="text-lg font-bold tracking-[-0.035em]">Aptly</span>
        </Link>
        <ThemeToggle />
      </div>

      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Last updated {LEGAL_LAST_UPDATED}
        </p>
      </header>

      <article
        className={[
          "flex flex-col gap-9",
          "[&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
          "[&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-muted-foreground",
          "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5",
          "[&_li]:list-disc [&_li]:marker:text-border",
          "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
        ].join(" ")}
      >
        {children}
      </article>
    </div>
  );
}

/** One titled section of a legal page. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {children}
    </section>
  );
}
