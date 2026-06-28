export type Subject = "Economics" | "Business" | "Physics";

export const MISTAKE_TYPES = [
  "Lack of evaluation",
  "Weak definitions",
  "Missing diagram explanation",
  "No real-world example",
  "Calculation/setup error",
  "Unclear structure",
] as const;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export interface Feedback {
  score: number; // out of 7
  band: string; // e.g. "Strong 6"
  strengths: string[];
  improvements: string[];
  mistakes: MistakeType[];
  examinerComment: string;
  studyNext: string;
}

export interface Attempt {
  id: string;
  createdAt: string; // ISO date
  subject: Subject;
  topic: string;
  question: string;
  answer: string;
  feedback: Feedback;
}
