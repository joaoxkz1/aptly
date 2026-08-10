import "server-only";
import type { GradingProvenance } from "@/lib/types";
import { ECONOMICS_TAXONOMY_VERSION } from "@/lib/assessment/taxonomy";
import { ECONOMICS_RUBRIC_VERSION } from "@/lib/ai/rubric.economics";
import {
  WRITTEN_GRADING_MODEL,
  WRITTEN_GRADING_REASONING_EFFORT,
} from "@/lib/ai/config";

export const ECONOMICS_GRADING_CONTRACT_VERSION = "ib-econ-2026-v1" as const;

/** Immutable server-owned provenance for every new econ-v4 grade. */
export const CURRENT_ECONOMICS_GRADING_PROVENANCE: GradingProvenance = Object.freeze({
  rubricVersion: ECONOMICS_RUBRIC_VERSION,
  taxonomyVersion: ECONOMICS_TAXONOMY_VERSION,
  gradingContractVersion: ECONOMICS_GRADING_CONTRACT_VERSION,
  modelId: WRITTEN_GRADING_MODEL,
  reasoningEffort: WRITTEN_GRADING_REASONING_EFFORT,
});
