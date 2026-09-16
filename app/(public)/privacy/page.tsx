import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import {
  COMPLAINT_ACKNOWLEDGEMENT_DAYS,
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  ICO_COMPLAINT_URL,
  MINIMUM_AGE,
  OPERATOR_NAME,
} from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Privacy Notice — Aptly",
  description: "What Aptly does with your account, your answers, and the feedback it produces.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      lastUpdated="16 September 2026"
      intro="What Aptly saves, why it saves it, and what you can do about it. Written to be read, not skimmed past."
    >
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
          The short version
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Aptly saves your account, the work you submit, and the feedback it produces — that
            history is what makes your Learning log and progress work.
          </li>
          <li>
            Aptly sends your questions, answers and photos to OpenAI so it can mark work, read
            handwriting and comment on diagrams. Your name, email and account ID are not sent.
          </li>
          <li>Photos you upload are used and discarded. Aptly never stores them.</li>
          <li>
            Your marks and learning insights are practice estimates, not official IB grades, and
            they are never shared with your school, your teachers or other students.
          </li>
          <li>No advertising, no tracking for advertising, and nothing is ever sold.</li>
          <li>
            You can email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> with any question, or delete
            your account and its data at any time from{" "}
            <Link href="/settings">Your data</Link>.
          </li>
        </ul>
      </section>

      <LegalSection title="Who runs Aptly">
        <p>
          Aptly is a non-commercial study project built and run by {OPERATOR_NAME}. It is not a
          company. There is no paid version, no advertising and nothing for sale.
        </p>
        <p>
          For anything in this notice — questions, requests about your information, or a complaint —
          email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>. That address is the way to reach
          Aptly.
        </p>
        <p>
          For data protection law, {OPERATOR_NAME} is the &ldquo;controller&rdquo; for the
          information described here — the person responsible for deciding how it is used.
        </p>
      </LegalSection>

      <LegalSection title="What Aptly saves">
        <p>
          <strong>Your account.</strong> Your email address, an account ID Aptly generates for you,
          the name or nickname you chose, and whether you study Economics at SL or HL.
        </p>
        <p>
          <strong>Your work.</strong> The questions you add, the answers you write, any source text
          or data you paste, your revisions of earlier answers, and the practice questions Aptly
          generates for you.
        </p>
        <p>
          <strong>Feedback and marks.</strong> The estimated mark for each answer, the written
          feedback, strengths and improvements, the mistakes identified, the syllabus topic, and the
          per-criterion diagnostic breakdown.
          For diagram-aware assessments, this includes image content hashes, visible observations,
          component decisions where applicable, and the assessment and model versions used.
          The private assessment snapshot is deleted with its answer.
        </p>
        <p>
          <strong>Technical records.</strong> When things happened, your sign-in session, and small
          no-content records used to enforce daily usage limits and to stop the same request being
          processed twice. Aptly&apos;s own error logs record which step failed and nothing else —
          never your work, your email or your account ID.
        </p>
        <p>
          <strong>Some of this is worked out, not typed by you.</strong> Your strongest and weakest
          topics, your repeated mistakes, your Current focus, what to study next, and your estimated
          performance are all produced by Aptly from the work you have saved. You never enter them —
          Aptly infers them.
        </p>
      </LegalSection>

      <LegalSection title="Why Aptly uses it">
        <p>
          <strong>Internal product analytics.</strong> Aptly uses counts from saved work and records
          a small set of learning interactions, such as opening feedback, starting Practice or a
          revision, and adding or removing a diagram. These records contain your account ID,
          relevant attempt or question ID, the interaction type and time, and a limited source label.
          They do not contain answers, photos, prompts or a recording of your session, and are not
          sent to a third-party analytics service. They help Aptly understand use and investigate failures.
        </p>
        <p>
          <strong>Optional feedback and original marks.</strong> You can rate Aptly feedback, leave a
          short private comment, and record a mark received before using Aptly. Original marks are
          student-reported and unverified. You can edit or remove these entries. Aptly&apos;s authorized
          internal team can review them to understand feedback quality; other students cannot.
          These entries and interaction records are retained while your account exists and deleted
          with your account; records linked to a deleted attempt or Practice question are also deleted.
        </p>
        <p>
          Most of it is simply what the service is. Aptly needs your email to sign you in, your
          saved work to show a history, and your feedback and topics to tell you what to practise
          next. In data protection terms this is processing that is{" "}
          <strong>necessary to provide the service you asked for</strong> (a contract between you
          and Aptly).
        </p>
        <p>
          A smaller part is about keeping Aptly working and safe: enforcing reasonable daily usage
          limits, preventing abuse, and recording enough to diagnose failures. Aptly relies on its{" "}
          <strong>legitimate interests</strong> for that. These records contain no schoolwork.
        </p>
        <p>
          Aptly does not rely on consent for any of this, so there is no consent box to tick and
          nothing to withdraw. If that ever changes, this notice will say so first.
        </p>
      </LegalSection>

      <LegalSection title="AI, and what OpenAI receives">
        <p>
          Aptly uses OpenAI&apos;s models to assess answers and diagrams, read handwriting from photos,
          and occasionally write a new practice question.
        </p>
        <p>
          When you grade an answer, Aptly sends OpenAI the question, your answer, and any source
          text you pasted. Scan sends its photo when you choose Read; an assessed diagram photo is
          sent when you choose Grade. Legacy diagram review sends its photo when you request review. It does{" "}
          <strong>not</strong> send your name, your email address or your account ID — OpenAI
          receives the work, not who wrote it.
        </p>
        <p>
          Aptly sets OpenAI&apos;s <code className="text-xs">store</code> option to false on every
          request, which tells OpenAI not to retain the response. Under OpenAI&apos;s current API
          terms, content sent through the API is not used to train its models by default.
        </p>
        <p>
          To be straight with you: that does not mean OpenAI keeps nothing. OpenAI runs its own
          security and abuse-monitoring processes and may hold limited records for a short period
          under its own policies. Aptly controls what it sends and asks OpenAI not to store it;
          Aptly cannot control OpenAI&apos;s internal security logging.
        </p>
        <p>
          Because AI writes the feedback, it can be wrong. Treat it as practice, and use your
          teacher and your official course materials as well.
        </p>
      </LegalSection>

      <LegalSection title="Photos">
        <p>
          <strong>Scanning handwriting.</strong> Your device shrinks and re-saves the photo before
          it is uploaded, which strips the original file&apos;s metadata — including any location,
          timestamp and device details. Aptly sends the photo to OpenAI to turn the handwriting into
          text you can then check and edit. Aptly does not save the photo.
        </p>
        <p>
          <strong>Diagram assessment and feedback.</strong> A diagram photo is sent to OpenAI,
          which returns observations about the visible student work. In diagram-aware assessments,
          those observations contribute to the estimated overall mark according to the question.
          Aptly saves the observations, a content hash and the assessment decision, but not the image.
          Historical feedback-only diagram reviews retain their original marks and notices.
        </p>
        <p>
          The server discards photos after the request. Your current browser page can retain a
          photo in memory so you can choose to reuse it in a revision; reloading or switching accounts
          removes that copy. Photos are never put in draft session storage. There is no server photo
          library or storage bucket. After reopening an answer, attach the photo again to assess it.
        </p>
      </LegalSection>

      <LegalSection title="How Aptly personalises your practice">
        <p>
          Aptly reads the answers you have saved and works out patterns automatically: which topics
          you score well on, which you do not, which mistakes keep coming back, what your Current
          focus should be, and which question to give you next.
        </p>
        <p>
          This is an automated estimate built from your own work, and it exists for one reason — to
          help you decide what to revise. It is not an official grade, and it does not affect your
          school grades, your predicted grades, your university applications, or your access to
          education in any way.
        </p>
        <p>
          Aptly does not send these insights to your school, your teachers, your parents or other
          students. Nothing you write in Aptly is visible to anyone else.
        </p>
        <p>
          In legal terms this is &ldquo;profiling&rdquo;. If you think Aptly has judged something
          about your work wrongly, email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> — and you can
          always delete an individual answer from your Learning log, which removes it from every
          insight Aptly calculates.
        </p>
      </LegalSection>

      <LegalSection title="Who else is involved">
        <p>
          Aptly is built on a small number of providers. They process information on Aptly&apos;s
          instructions and are not allowed to use it for their own purposes.
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — stores your account and everything you save, and sends the
            sign-in link to your email address.
          </li>
          <li>
            <strong>OpenAI</strong> — provides the AI that marks answers, reads handwriting and
            reviews diagrams, as described above.
          </li>
          <li>
            <strong>Aptly&apos;s hosting provider</strong> — runs the website and handles requests
            as you use it.
          </li>
        </ul>
        <p>
          That is the complete list. There is no analytics service, no advertising network, no
          tracking pixel and no third party that receives your information for its own reasons.
          Nothing is sold or shared for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Processing outside the UK">
        <p>
          Some of these providers process information outside the UK — OpenAI in particular is based
          in the United States, so your work is processed there when it is marked.
        </p>
        <p>
          Aptly uses these providers under their published data protection terms, which apply the
          UK&apos;s approved safeguards for sending personal information abroad (the UK Addendum to
          the standard contractual clauses).
        </p>
      </LegalSection>

      <LegalSection title="How long things are kept">
        <p>
          <strong>Your account and your work</strong> are kept while your account exists. That is
          deliberate: your Learning log, your progress and your Current focus are all built from
          your history, so Aptly would stop working as a study tool without it.
        </p>
        <p>
          <strong>When you delete your account</strong>, Aptly deletes your account and the work,
          feedback and practice history attached to it.
        </p>
        <p>
          <strong>Photo bytes</strong> are not saved on Aptly&apos;s server. An attached diagram can
          stay temporarily in your browser&apos;s memory for a revision. Its saved hash, observations
          and assessment snapshot are deleted with the associated attempt or account.
        </p>
        <p>
          <strong>Usage-limit and duplicate-request records</strong> hold no schoolwork and are
          removed automatically after 30 days.
        </p>
        <p>
          Aptly&apos;s providers keep their own backups and security logs on their own schedules,
          so a copy can persist there for a short period after deletion before it ages out.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask Aptly to give you a copy of your information, correct something that is wrong,
          delete your information, or limit or object to how it is used. Some of these rights apply
          differently depending on the situation, and Aptly will explain if one does not apply to
          your request.
        </p>
        <p>
          You can do two of these yourself right now: delete a single answer from your Learning log,
          or delete your whole account from <Link href="/settings">Your data</Link>.
        </p>
        <p>
          For anything else, email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> from the address
          your account uses. Aptly will normally respond within one month.
        </p>
      </LegalSection>

      <LegalSection title="Complaints">
        <p>
          If you are unhappy with how Aptly has handled your information, email{" "}
          <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>. Aptly will acknowledge a formal data
          protection complaint within {COMPLAINT_ACKNOWLEDGEMENT_DAYS} days, look into it, and tell
          you the outcome.
        </p>
        <p>
          You also have the right to complain to the UK&apos;s data protection regulator, the
          Information Commissioner&apos;s Office, at{" "}
          <a href={ICO_COMPLAINT_URL} target="_blank" rel="noreferrer noopener">
            ico.org.uk/make-a-complaint
          </a>
          . You do not have to contact Aptly first, though it is usually quicker if you do.
        </p>
      </LegalSection>

      <LegalSection title={`Your privacy if you're under 18`}>
        <p>
          Most people using Aptly are school students, so it is built that way by default rather
          than as an afterthought.
        </p>
        <ul>
          <li>Your account is private. No other student can see your work, your marks or anything else.</li>
          <li>There are no public profiles, no sharing and no way to make anything visible to others.</li>
          <li>Aptly has no advertising and does not profile you for advertising.</li>
          <li>Your information is never sold.</li>
          <li>Your marks and insights are never sent to your school or your teachers.</li>
          <li>
            You can email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> to ask anything about your
            information, and you can delete your account yourself at any time.
          </li>
        </ul>
        <p>
          You need to be at least {MINIMUM_AGE} to use Aptly. Aptly does not ask for your date of
          birth and does not try to verify your age — asking students for identity documents would
          collect far more personal information than a study tool needs. Instead, the protections
          above apply to everyone who uses Aptly, whatever their age.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and what Aptly stores on your device">
        <p>Aptly stores the following on your device, and none of it is for advertising:</p>
        <ul>
          <li>
            <strong>Sign-in cookies</strong>, set by Supabase, that keep you logged in as you move
            between pages.
          </li>
          <li>
            <strong>Your theme choice</strong>, saved only when you use the light/dark toggle.
          </li>
          <li>
            <strong>The mark total you last picked on Practice</strong>, kept for the current
            browser session so the page remembers it.
          </li>
          <li>
            <strong>Temporary typed drafts</strong>, kept separately for your account and question in
            the current browser tab&apos;s session storage. They can help recover your question,
            answer and typed source text after a reload or navigation in that tab. Drafts expire
            after 24 hours; Aptly checks this cutoff when it next accesses draft storage, without
            a background deletion timer. When storage is accessible, Aptly clears the matching
            draft after a confirmed save or discard, and account drafts when you sign out, switch
            accounts or delete your account. If the browser blocks storage access, removal of
            stored drafts cannot be guaranteed. Pending cleanup is retried before the next draft
            access or account event in the same loaded page; these pending retries do not survive
            reloading or closing it. Photos are not included; you may need to attach them again.
            This is not cloud saving or cross-device sync, and recovery after closing the browser
            is not guaranteed. If browser storage is unavailable, draft recovery cannot work.
          </li>
        </ul>
        <p>
          This storage supports sign-in, your preferences and recovering unfinished work. Aptly
          uses no advertising cookies, no tracking pixels and no analytics service. You can clear
          this site data through your browser settings at any time.
        </p>
      </LegalSection>

      <LegalSection title="Keeping your information safe">
        <p>
          Aptly&apos;s database enforces at the database level that you can only ever read your own
          rows. Connections to Aptly and its providers are encrypted. Photo bytes are not saved on Aptly&apos;s server.
          Anything that writes to your record runs on Aptly&apos;s server after checking your
          sign-in, never in your browser. Error logs are written so they cannot contain your work.
        </p>
        <p>
          No service can promise perfect security, but Aptly is built so that the smallest useful
          amount of information exists in the first place.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this notice">
        <p>
          If Aptly changes how it uses your information in a way that matters, this page will be
          updated and the date at the top will change. If the change is significant — a new
          provider, a new purpose, or anything that would surprise you — Aptly will tell you in the
          app or by email before it starts.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
