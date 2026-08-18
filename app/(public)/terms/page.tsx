import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  IB_NON_AFFILIATION,
  MINIMUM_AGE,
  OPERATOR_NAME,
} from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Terms of Use — Aptly",
  description: "The rules for using Aptly, and what Aptly does and does not promise.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro="The short set of rules for using Aptly, and an honest account of what it can and cannot do for you."
    >
      <LegalSection title="About Aptly">
        <p>
          Aptly is a non-commercial study project built and run by {OPERATOR_NAME}. It helps you
          practise IB Economics answers and shows you what to work on next. It is free, there is no
          paid version, and it is not a company.
        </p>
        <p>
          Using Aptly means these terms apply to you. If you do not agree with them, please do not
          create an account.
        </p>
      </LegalSection>

      <LegalSection title="How old you need to be">
        <p>
          You need to be at least {MINIMUM_AGE} to use Aptly. If you are under 18, you should have
          permission from a parent, guardian or teacher.
        </p>
      </LegalSection>

      <LegalSection title="Aptly is a practice tool, not an examiner">
        <p>This is the most important thing on this page, so it is stated plainly:</p>
        <ul>
          <li>Aptly&apos;s marks are practice estimates. They are not official IB grades.</li>
          <li>They are not predictions of what you will get in a real exam.</li>
          <li>
            Aptly is not a substitute for your teacher, your examiner or your official course
            materials — use it alongside them.
          </li>
          <li>Aptly cannot and does not promise any particular grade or academic outcome.</li>
        </ul>
      </LegalSection>

      <LegalSection title="AI writes the feedback">
        <p>
          Aptly&apos;s feedback, marks and generated practice questions are produced by AI. AI makes
          mistakes: a mark can be too high or too low, and feedback can miss something or get
          something wrong.
        </p>
        <p>
          Questions Aptly generates are original Aptly practice. They are not real IB exam questions
          and are not taken from official IB papers.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Use your own account, and keep access to it private — anyone with your sign-in link can
          reach your work. Do not try to get into anyone else&apos;s account or data.
        </p>
      </LegalSection>

      <LegalSection title="Your work">
        <p>
          What you write stays yours. Aptly does not claim ownership of your answers. Aptly only
          uses your work to run the service for you: to grade it, produce feedback, save your
          history, and suggest what to practise next. The{" "}
          <Link href="/privacy">Privacy Notice</Link> explains exactly what that involves.
        </p>
        <p>Two things to avoid uploading:</p>
        <ul>
          <li>
            Other people&apos;s personal information — you do not need it for an Economics answer,
            and it is best kept out of Aptly.
          </li>
          <li>
            Material you do not have the right to use, such as copies of real exam papers or
            markschemes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Fair use">
        <p>
          Aptly pays for every AI request, so reasonable daily limits apply to grading, practice
          generation, scanning and diagram review. They are set to be generous for normal study and
          may change.
        </p>
      </LegalSection>

      <LegalSection title="Things not to do">
        <ul>
          <li>Do not try to get around usage limits or security.</li>
          <li>Do not try to access another person&apos;s account or data.</li>
          <li>Do not deliberately submit harmful or malicious content.</li>
          <li>Do not try to extract Aptly&apos;s internal grading instructions.</li>
          <li>Do not use Aptly for anything unlawful.</li>
        </ul>
        <p>
          Aptly may restrict or remove an account that is being seriously misused, or that puts the
          service or other students at risk.
        </p>
      </LegalSection>

      <LegalSection title="Aptly will change, and sometimes break">
        <p>
          Aptly is actively being built. Features can change or be removed, and the service may be
          unavailable at times — planned or not. There is no uptime promise.
        </p>
      </LegalSection>

      <LegalSection title="Deleting your account">
        <p>
          You can delete your account at any time from <Link href="/settings">Your data</Link>. That
          removes your account and the work, feedback and practice history saved with it, and cannot
          be undone.
        </p>
      </LegalSection>

      <LegalSection title="What Aptly is responsible for">
        <p>
          Aptly is a free study aid provided as it is. Because AI can make mistakes, you should not
          rely on its marks or feedback as if they were official. Aptly is not responsible for
          academic results, revision decisions you make based on its feedback, or work lost through
          a service problem.
        </p>
        <p>
          Nothing here takes away rights you have under UK law that cannot be signed away, and this
          section is not an attempt to do so.
        </p>
      </LegalSection>

      <LegalSection title="Getting in touch">
        <p>
          Email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> with anything at all — questions about
          these terms, problems with the service, or requests about your information.
        </p>
      </LegalSection>

      <LegalSection title="Aptly and the IB">
        <p>{IB_NON_AFFILIATION}</p>
        <p>
          IB and International Baccalaureate are trademarks of the International Baccalaureate
          Organization. Aptly refers to them only to describe the course it helps you study for.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
