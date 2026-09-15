import "server-only";
import type { TrustedAssessmentContract } from "./trusted-contract";
import type { AssessedVisualEvidence } from "@/lib/ai/assessed-visual-schema";

/** Immutable private binding; answer/question text remains in the associated attempt. */
export interface AssessmentSnapshot {
  version: 1;
  id: string;
  userId: string;
  operationIdentity: string;
  questionHash: string;
  contextHash: string;
  answerHash: string;
  contract: TrustedAssessmentContract;
  contractHash: string;
  attachments: { identity: string; contentHash: string; role: "student_diagram"; retained: false }[];
  reviewerVersion: string | null;
  reviewerModel: string | null;
  reviewerEffort: string | null;
  graderModel: string;
  graderEffort: string;
  observations: AssessedVisualEvidence | null;
}
