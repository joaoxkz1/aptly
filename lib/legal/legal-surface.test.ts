import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AI_USAGE_RETENTION_DAYS,
  CONTACT_EMAIL,
  IB_NON_AFFILIATION,
  MINIMUM_AGE,
  OPERATOR_ADDRESS,
  OPERATOR_NAME,
} from "./operator";

/**
 * Durable pins for the compliance surface, in the same style as the existing
 * copy audits: read the real sources so a required disclosure, link, or honest
 * qualification cannot silently disappear — and so the deliberately SMALL
 * shape of this release cannot silently grow.
 */

const read = (...p: string[]) => readFileSync(join(...p), "utf8");

const LOGIN = read("app", "(public)", "login", "page.tsx");
const ONBOARDING = read("app", "(public)", "onboarding", "page.tsx");
const PRIVACY = read("app", "(public)", "privacy", "page.tsx");
const TERMS = read("app", "(public)", "terms", "page.tsx");
const FOOTER = read("components", "legal", "legal-footer.tsx");
const PUBLIC_LAYOUT = read("app", "(public)", "layout.tsx");
const APP_SHELL = read("components", "app-shell.tsx");
const SETTINGS = read("app", "(app)", "settings", "page.tsx");
const PROXY = read("lib", "supabase", "proxy.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const ALL_SOURCES = [...walk("app"), ...walk("components")].map((file) => ({
  file,
  text: read(file),
}));

describe("operator facts are centralised and publish no address", () => {
  it("exposes one operator name and one contact route", () => {
    expect(OPERATOR_NAME.trim().length).toBeGreaterThan(0);
    expect(CONTACT_EMAIL).toBe("contactaptly@gmail.com");
  });

  it("publishes no postal address in this release", () => {
    expect(OPERATOR_ADDRESS).toBeNull();
  });

  it("no legal surface hard-codes the contact address instead of the constant", () => {
    for (const source of [FOOTER, PRIVACY, TERMS, SETTINGS]) {
      expect(source).toContain("@/lib/legal/operator");
    }
  });
});

describe("public legal routes", () => {
  it("/privacy and /terms exist as public route-group pages", () => {
    expect(existsSync(join("app", "(public)", "privacy", "page.tsx"))).toBe(true);
    expect(existsSync(join("app", "(public)", "terms", "page.tsx"))).toBe(true);
  });

  it("are reachable while signed out and before onboarding is finished", () => {
    const at = PROXY.indexOf("const PUBLIC_PATHS");
    expect(at).toBeGreaterThan(-1);
    const decl = PROXY.slice(at, PROXY.indexOf("]", at));
    expect(decl).toContain('"/privacy"');
    expect(decl).toContain('"/terms"');
    expect(decl).toContain('"/login"');
  });
});

describe("login carries exactly one legal line and no consent UI", () => {
  it("links Terms and Privacy and states the minimum age", () => {
    expect(LOGIN).toContain('href="/terms"');
    expect(LOGIN).toContain('href="/privacy"');
    expect(LOGIN).toContain("By continuing, you agree to the");
    expect(LOGIN).toContain("Terms of Use");
    expect(LOGIN).toContain("Privacy Notice");
    expect(LOGIN).toContain("or over to use Aptly");
    expect(LOGIN).toContain("MINIMUM_AGE");
  });

  it("introduces no consent checkbox, modal, or extra confirmation step", () => {
    expect(LOGIN).not.toContain('type="checkbox"');
    expect(LOGIN.toLowerCase()).not.toContain("i agree");
    expect(LOGIN.toLowerCase()).not.toContain("<dialog");
  });

  it("keeps the concrete value proposition, qualified as practice estimates", () => {
    // The existing trust pin (trust-copy.test.ts) requires this exact phrase,
    // so the honest qualifier is added rather than the claim reworded.
    expect(LOGIN).toContain("grades your IB Economics practice answers");
    expect(LOGIN).toContain("Marks are practice estimates, not official IB grades.");
  });

  it("confirms deletion when arriving from the delete-account redirect", () => {
    expect(LOGIN).toContain('searchParams.get("deleted") === "1"');
    expect(LOGIN).toContain("Your account and its saved data have been deleted.");
  });
});

describe("onboarding gains one contextual note and nothing else", () => {
  it("explains why the two fields exist and links the Privacy Notice", () => {
    expect(ONBOARDING).toContain("A nickname is enough.");
    expect(ONBOARDING).toContain("Your course level helps Aptly tailor your practice.");
    expect(ONBOARDING).toContain("Aptly uses AI to give feedback");
    expect(ONBOARDING).toContain("Learn how your data is used");
    expect(ONBOARDING).toContain('href="/privacy"');
  });

  it("does not repeat the age, Terms, or IB copy already handled at sign-in", () => {
    expect(ONBOARDING).not.toContain("or over to use Aptly");
    expect(ONBOARDING).not.toContain("Terms of Use");
    expect(ONBOARDING).not.toContain("International Baccalaureate");
    expect(ONBOARDING).not.toContain('type="checkbox"');
  });

  it("adds no extra step: still one form with one submit control", () => {
    expect(ONBOARDING.split("<form").length - 1).toBe(1);
    expect(ONBOARDING.split('type="submit"').length - 1).toBe(1);
  });

  it("invites a nickname rather than a real first name", () => {
    expect(ONBOARDING).toContain("Your name or nickname");
    expect(ONBOARDING).toContain('autoComplete="nickname"');
    expect(ONBOARDING).not.toContain('autoComplete="given-name"');
  });
});

describe("the legal footer is tiny, complete, and on both layouts", () => {
  it("carries the links and the IB independence line", () => {
    expect(FOOTER).toContain('href: "/privacy"');
    expect(FOOTER).toContain('href: "/terms"');
    expect(FOOTER).toContain('href: "/settings"');
    expect(FOOTER).toContain("CONTACT_MAILTO");
    for (const label of ["Privacy", "Terms", "Your data", "Contact"]) {
      expect(FOOTER, `footer is missing the "${label}" link`).toContain(`"${label}"`);
    }
    expect(FOOTER).toContain("IB_NON_AFFILIATION");
    expect(IB_NON_AFFILIATION).toContain("not endorsed by the International Baccalaureate");
  });

  it("renders on the signed-out layout and the signed-in shell", () => {
    expect(PUBLIC_LAYOUT).toContain("<LegalFooter");
    expect(APP_SHELL).toContain("<LegalFooter");
  });

  /**
   * Signed out: Privacy · Terms · Contact.
   * Signed in:  Privacy · Terms · Your data · Contact.
   * "Your data" needs a session, so offering it signed out would link to a
   * page that only bounces to /login.
   */
  it("shows Your data only to signed-in users", () => {
    expect(FOOTER).toContain("includeYourData = false");
    const at = FOOTER.indexOf("includeYourData");
    expect(FOOTER.slice(at)).toContain('label: "Your data"');
    // Signed-out layout takes the default; the app shell opts in.
    expect(PUBLIC_LAYOUT).not.toContain("includeYourData");
    expect(APP_SHELL).toContain("includeYourData");
  });

  it("stays visually secondary — small muted text, no columns or headings", () => {
    expect(FOOTER).toContain("text-muted-foreground");
    expect(FOOTER).toMatch(/text-\[1[01]px\]/);
    expect(FOOTER).not.toContain("grid-cols");
    expect(FOOTER).not.toMatch(/<h[1-6]/);
  });

  it("preserves total page tail space so study content keeps its spacing", () => {
    // main lost the mobile bottom padding the fixed nav needs; the footer
    // now carries it.
    expect(APP_SHELL).toContain('<LegalFooter className="pb-24 md:pb-8" includeYourData />');
    expect(APP_SHELL).not.toContain("py-6 pb-24");
  });
});

describe("Privacy Notice is accurate about how Aptly actually works", () => {
  it("opens with a short plain-English summary", () => {
    expect(PRIVACY).toContain("The short version");
  });

  it("names the real providers and no speculative ones", () => {
    expect(PRIVACY).toContain("Supabase");
    expect(PRIVACY).toContain("OpenAI");
    expect(PRIVACY).toContain("hosting provider");
    for (const absent of [
      "Google Analytics",
      "Stripe",
      "Mixpanel",
      "Sentry",
      "Meta Pixel",
      "Hotjar",
    ]) {
      expect(PRIVACY).not.toContain(absent);
    }
  });

  it("is honest that provider-side retention still exists", () => {
    expect(PRIVACY).toContain("security and abuse-monitoring");
    // The notice must actively say the opposite of the reassuring overclaim.
    expect(PRIVACY).toContain("that does not mean OpenAI keeps nothing");
    for (const overclaim of [
      "OpenAI stores nothing",
      "stores absolutely nothing",
      "no data is retained anywhere",
      "OpenAI retains nothing",
    ]) {
      expect(PRIVACY).not.toContain(overclaim);
    }
  });

  it("states the store:false control and that identifiers are not sent", () => {
    expect(PRIVACY).toContain("<code");
    expect(PRIVACY).toContain("option to false on every");
    expect(PRIVACY).toContain("send your name, your email address or your account ID");
    expect(PRIVACY).toContain("not used to train its models by default");
  });

  it("covers photos, profiling, rights, complaints, children, storage and security", () => {
    for (const heading of [
      "Who runs Aptly",
      "What Aptly saves",
      "Why Aptly uses it",
      "AI, and what OpenAI receives",
      "Photos",
      "How Aptly personalises your practice",
      "Who else is involved",
      "Processing outside the UK",
      "How long things are kept",
      "Your rights",
      "Complaints",
      "Cookies and what Aptly stores on your device",
      "Keeping your information safe",
      "Changes to this notice",
    ]) {
      expect(PRIVACY, `Privacy Notice is missing "${heading}"`).toContain(heading);
    }
    expect(PRIVACY).toContain("under 18");
  });

  it("does not claim consent is the lawful basis for the core service", () => {
    expect(PRIVACY).toContain("necessary to provide the service you asked for");
    expect(PRIVACY).toContain("legitimate interests");
    expect(PRIVACY).toContain("does not rely on consent");
  });

  it("routes rights and complaints to the contact address and the ICO", () => {
    expect(PRIVACY).toContain("CONTACT_MAILTO");
    expect(PRIVACY).toContain("ICO_COMPLAINT_URL");
    expect(PRIVACY).toContain("Information Commissioner");
    expect(PRIVACY).toContain("COMPLAINT_ACKNOWLEDGEMENT_DAYS");
  });

  it("states the quota retention window actually implemented", () => {
    expect(AI_USAGE_RETENTION_DAYS).toBe(30);
    expect(PRIVACY).toContain(`removed automatically after ${AI_USAGE_RETENTION_DAYS} days`);
  });

  it("explains device storage without promising a cookie banner", () => {
    expect(PRIVACY).toContain("Sign-in cookies");
    expect(PRIVACY).toContain("theme choice");
    expect(PRIVACY).toContain("require a cookie banner");
    expect(PRIVACY).toContain("no advertising cookies");
  });
});

describe("Terms of Use cover the material points, briefly", () => {
  it("carries every required section", () => {
    for (const heading of [
      "About Aptly",
      "How old you need to be",
      "Aptly is a practice tool, not an examiner",
      "AI writes the feedback",
      "Your account",
      "Your work",
      "Fair use",
      "Things not to do",
      "Aptly will change, and sometimes break",
      "Deleting your account",
      "What Aptly is responsible for",
      "Getting in touch",
      "Aptly and the IB",
    ]) {
      expect(TERMS, `Terms is missing "${heading}"`).toContain(heading);
    }
  });

  it("states the honest positioning and the minimum age", () => {
    expect(TERMS).toContain("not official IB grades");
    expect(TERMS).toContain("not predictions");
    expect(TERMS).toContain("MINIMUM_AGE");
    expect(MINIMUM_AGE).toBe(13);
  });

  it("carries the IB independence statement and preserves statutory rights", () => {
    expect(TERMS).toContain("IB_NON_AFFILIATION");
    expect(TERMS).toContain("cannot be signed away");
  });

  it("does not hard-code operational quota numbers", () => {
    expect(TERMS).not.toMatch(/\b(30|10)\s+(grades|practice|scans|reviews)\b/);
  });

  it("describes no payment, subscription, refund, or cancellation terms", () => {
    for (const absent of ["refund", "subscription", "billing", "cancellation period"]) {
      expect(TERMS.toLowerCase()).not.toContain(absent);
    }
  });
});

describe("Your data page stays minimal", () => {
  it("offers exactly the four things it should", () => {
    expect(SETTINGS).toContain("Your data");
    expect(SETTINGS).toContain('href="/privacy"');
    expect(SETTINGS).toContain('href="/terms"');
    expect(SETTINGS).toContain("CONTACT_MAILTO");
    expect(SETTINGS).toContain("Delete my account");
  });

  it("requires a deliberate second confirmation before deleting", () => {
    expect(SETTINGS).toContain(
      "Delete your account and all saved Aptly data? This cannot be undone."
    );
    expect(SETTINGS).toContain("Delete permanently");
    expect(SETTINGS).toContain("Cancel");
    expect(SETTINGS).toContain("confirming");
  });

  it("clears the local session and hard-navigates so no account state survives", () => {
    expect(SETTINGS).toContain('signOut({ scope: "local" })');
    expect(SETTINGS).toContain('window.location.assign("/login?deleted=1")');
  });

  it("builds no GDPR dashboard, consent centre, or export system", () => {
    for (const absent of [
      "marketing preferences",
      "cookie preferences",
      "consent history",
      "Download my data",
      "Export",
    ]) {
      expect(SETTINGS).not.toContain(absent);
    }
  });
});

describe("the release adds no compliance theatre", () => {
  /**
   * Banned tokens are IMPLEMENTATION mechanisms, not prose: the Privacy Notice
   * legitimately explains that Aptly does not ask for a date of birth, and
   * that sentence must stay sayable.
   */
  it("ships no cookie banner, consent manager, age gate, or DOB input anywhere", () => {
    for (const { file, text } of ALL_SOURCES) {
      for (const banned of [
        "CookieBanner",
        "cookie-banner",
        "CookieConsent",
        "ConsentManager",
        "AgeGate",
        "dateOfBirth",
        'type="date"',
        'type="checkbox"',
      ]) {
        expect(text.includes(banned), `${file} contains "${banned}"`).toBe(false);
      }
    }
  });

  it("keeps the legal surface out of the primary navigation", () => {
    const at = APP_SHELL.indexOf("const NAV");
    const nav = APP_SHELL.slice(at, APP_SHELL.indexOf("];", at));
    expect(nav).not.toContain("/settings");
    expect(nav).not.toContain("/privacy");
    expect(nav).not.toContain("/terms");
  });

  it("does not repeat the sign-in legal sentence on any product screen", () => {
    const repeated = ALL_SOURCES.filter(({ text }) =>
      text.includes("By continuing, you agree to the")
    );
    expect(repeated.map((r) => r.file)).toEqual([join("app", "(public)", "login", "page.tsx")]);
  });

  it("keeps the IB independence line to the footer and the Terms only", () => {
    const carriers = ALL_SOURCES.filter(({ text }) =>
      text.includes("IB_NON_AFFILIATION")
    ).map((r) => r.file);
    expect(carriers.sort()).toEqual(
      [
        join("app", "(public)", "terms", "page.tsx"),
        join("components", "legal", "legal-footer.tsx"),
      ].sort()
    );
  });
});
