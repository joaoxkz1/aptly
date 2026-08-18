/**
 * Single source of truth for Aptly's operator and legal-contact facts.
 *
 * Every legal surface (Privacy Notice, Terms, footer, Your data) reads these
 * constants, so a change is made in exactly one place.
 *
 * NO POSTAL ADDRESS IS PUBLISHED in this release. Two separate questions sit
 * behind that, and only the first is settled:
 *
 *  - UK GDPR Article 13(1)(a) requires "the identity and the contact details
 *    of the controller" — a name and a working contact route. It does not
 *    require a postal address. OPERATOR_NAME + CONTACT_EMAIL satisfy it.
 *  - The Electronic Commerce (EC Directive) Regulations 2002 reg. 6 separately
 *    requires a geographic address from an "information society service"
 *    provider. Whether that bites here is FACT-SENSITIVE and is NOT treated as
 *    settled: ICO guidance notes that some free and not-for-profit apps and
 *    educational sites can still be information society services where the
 *    activity amounts to economic activity in a broader sense — including
 *    services of a type typically provided commercially.
 *
 * Position taken: no geographic address is published for the current
 * non-commercial student-project version. Reassess if Aptly becomes
 * commercial, monetised, incorporated, or materially expands beyond that
 * context. If an address is needed, set OPERATOR_ADDRESS below and render it
 * in the Privacy and Terms "who runs Aptly" sections — never a home address.
 * See docs/compliance/operations.md §9.
 */

/** The individual who operates Aptly and is the data controller. */
export const OPERATOR_NAME = "Joao Perracini";

/**
 * Deliberately null. Not required while Aptly is non-commercial (see above),
 * and a personal home address must never be published. Supply a service
 * address here if Aptly ever monetises.
 */
export const OPERATOR_ADDRESS: string | null = null;

/** The single public contact route: privacy questions, rights requests, complaints. */
export const CONTACT_EMAIL = "contactaptly@gmail.com";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/** Minimum age to hold an Aptly account. */
export const MINIMUM_AGE = 13;

/** Shown on the legal pages so a reader can see how current they are. */
export const LEGAL_LAST_UPDATED = "18 August 2026";

/** The one IB independence sentence, rendered in the footer and the Terms. */
export const IB_NON_AFFILIATION =
  "Aptly has been developed independently from and is not endorsed by the International Baccalaureate Organization.";

/** Official ICO complaint route, linked from the Privacy Notice. */
export const ICO_COMPLAINT_URL = "https://ico.org.uk/make-a-complaint/";

/**
 * Statutory acknowledgement window for a formal data-protection complaint
 * (Data Protection Act 2018 s164A, inserted by the Data (Use and Access)
 * Act 2025 s103, in force 19 June 2026).
 */
export const COMPLAINT_ACKNOWLEDGEMENT_DAYS = 30;

/**
 * How long a no-content AI quota/idempotency reservation row is kept.
 *
 * Enforced in SQL inside reserve_ai_usage (migration 0011), scoped to the same
 * user and capability the call already holds an advisory lock for. Rationale
 * and review notes live in docs/compliance/operations.md.
 */
export const AI_USAGE_RETENTION_DAYS = 30;
