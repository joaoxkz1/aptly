import { Fragment } from "react";
import Link from "next/link";
import { CONTACT_MAILTO, IB_NON_AFFILIATION } from "@/lib/legal/operator";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The permanent legal footer: a few small links and one independence line.
 *
 * Deliberately tiny. It carries the routes a student needs to read what Aptly
 * does with their work, get in touch, or delete their account — and nothing
 * else. No columns, no logo, no marketing.
 *
 * "Your data" is only rendered for signed-in users (`includeYourData`): the
 * page behind it requires a session, so showing it signed out would offer a
 * link that only bounces to /login.
 */
export function LegalFooter({
  className,
  includeYourData = false,
}: {
  className?: string;
  includeYourData?: boolean;
}) {
  const items = [
    { key: "privacy", label: "Privacy", href: "/privacy", external: false },
    { key: "terms", label: "Terms", href: "/terms", external: false },
    ...(includeYourData
      ? [{ key: "your-data", label: "Your data", href: "/settings", external: false }]
      : []),
    { key: "contact", label: "Contact", href: CONTACT_MAILTO, external: true },
  ];

  return (
    <footer
      className={cn(
        "flex flex-col items-center gap-1 px-4 py-3 text-center text-[11px] leading-relaxed text-muted-foreground",
        className
      )}
    >
      <nav
        aria-label="Legal and account"
        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
      >
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 && <span aria-hidden="true">·</span>}
            {item.external ? (
              <a href={item.href} className={linkClass}>
                {item.label}
              </a>
            ) : (
              <Link href={item.href} className={linkClass}>
                {item.label}
              </Link>
            )}
          </Fragment>
        ))}
      </nav>
      <p className="max-w-prose text-[10px] text-muted-foreground/80">{IB_NON_AFFILIATION}</p>
    </footer>
  );
}
