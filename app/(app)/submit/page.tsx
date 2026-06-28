"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, History, Loader2, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { FeedbackResult } from "@/components/feedback-result";
import { SUBJECTS, TOPICS } from "@/lib/subjects";
import type { Attempt, Subject } from "@/lib/types";
import { gradeAnswer } from "@/lib/grading";
import { newId, useAttempts } from "@/lib/storage";

const SAMPLE: Record<Subject, { question: string; answer: string }> = {
  Economics: {
    question:
      "Discuss whether a subsidy is the best policy to correct the under-consumption of vaccines.",
    answer:
      "Vaccines create positive externalities of consumption: the social benefit is higher than the private benefit, so the free market under-provides them. A subsidy shifts the supply curve right on the diagram, lowering price and raising quantity towards the social optimum. For example, many EU countries subsidise flu vaccines for the elderly. However, subsidies have an opportunity cost and their effect depends on the price elasticity of demand — if hesitancy, not price, causes under-consumption, education campaigns may work better. Overall, a subsidy is effective when price is the main barrier, but it should be combined with information provision.",
  },
  Business: {
    question:
      "Explain two ways a business could use the marketing mix to extend the life cycle of a mature product.",
    answer:
      "The marketing mix refers to the combination of product, price, promotion and place. Firstly, the business could modify the product, adding new features to renew interest. Secondly, it could reposition through promotion, targeting a new segment. For example, Lucozade was repositioned from a medicine to a sports drink. However, extension strategies depend on the brand strength and may only delay decline.",
  },
  Physics: {
    question:
      "A 0.5 kg ball is dropped from a height of 20 m. Ignoring air resistance, calculate its speed just before impact.",
    answer:
      "Using conservation of energy, mgh = 1/2 mv^2, so v = sqrt(2gh) = sqrt(2 × 9.8 × 20) = sqrt(392) ≈ 19.8 m/s. The mass cancels, so the answer does not depend on the 0.5 kg. In reality air resistance would make the true speed slightly lower.",
  },
};

export default function SubmitPage() {
  const { addAttempt } = useAttempts();

  const [subject, setSubject] = useState<Subject>("Economics");
  const [topic, setTopic] = useState<string>(TOPICS.Economics[0]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubjectChange(s: Subject) {
    setSubject(s);
    setTopic(TOPICS[s][0]);
  }

  function fillSample() {
    const sample = SAMPLE[subject];
    setQuestion(sample.question);
    setAnswer(sample.answer);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim() === "" || answer.trim() === "") return;
    setGrading(true);
    // Simulate a short grading delay so the flow feels real.
    window.setTimeout(() => {
      const feedback = gradeAnswer(subject, topic, question.trim(), answer.trim());
      setResult({
        id: newId(),
        createdAt: new Date().toISOString(),
        subject,
        topic,
        question: question.trim(),
        answer: answer.trim(),
        feedback,
      });
      setSaved(false);
      setGrading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 900);
  }

  function handleSave() {
    if (result === null || saved) return;
    addAttempt(result);
    setSaved(true);
  }

  function handleTryAnother() {
    setResult(null);
    setSaved(false);
    setQuestion("");
    setAnswer("");
  }

  if (result !== null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rubric-style feedback on your {result.subject} answer.
          </p>
        </div>
        <FeedbackResult
          attempt={result}
          saved={saved}
          onSave={handleSave}
          onTryAnother={handleTryAnother}
        />
        {saved && (
          <Link
            href="/attempts"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <History className="h-4 w-4" />
            View it in your attempts log
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit an answer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a question and your answer — Aptly grades it against IB-style criteria.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Answer details</CardTitle>
          <CardDescription>
            Choose the subject and topic so mistakes are tracked correctly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <div className="relative">
                  <Select
                    id="subject"
                    value={subject}
                    onChange={(e) => handleSubjectChange(e.target.value as Subject)}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label htmlFor="topic">Topic</Label>
                <div className="relative">
                  <Select id="topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                    {TOPICS[subject].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Evaluate the use of indirect taxes to correct market failure."
                className="min-h-20"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="answer">Your answer</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {answer.trim() === "" ? 0 : answer.trim().split(/\s+/).length} words
                </span>
              </div>
              <Textarea
                id="answer"
                required
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your full answer here. Tip: define key terms, use a real-world example, and end with an evaluation."
                className="min-h-52"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={grading}>
                {grading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Grading…
                  </>
                ) : (
                  "Grade my answer"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={fillSample}>
                <Wand2 className="h-4 w-4" />
                Fill with a sample answer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Grading is currently simulated locally — no data leaves your browser.
      </p>
    </div>
  );
}
