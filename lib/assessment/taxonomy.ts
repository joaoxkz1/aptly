/**
 * Controlled vocabularies for assessment-aware grading.
 * Single source of truth: the schema (lib/ai/assessment-schema.ts), the
 * validator, the readiness math, and the UI all reuse these `as const` arrays.
 * No secrets — safe to import on the client.
 */

export const ASSESSMENT_FORMATS = [
  "paper_1_a",
  "paper_1_b",
  "paper_2_a_definition",
  "paper_2_b_quantitative_or_diagram",
  "paper_2_c_to_f_diagram_and_explanation",
  "paper_2_g_extended_response",
  "paper_3_a_technical_or_quantitative",
  "paper_3_b_policy_recommendation",
  "custom_short_response",
  "custom_extended_response",
  "uncertain",
] as const;

export const PAPERS = ["paper_1", "paper_2", "paper_3", "custom", "uncertain"] as const;

export const QUESTION_PARTS = ["a", "b", "c", "d", "e", "f", "g", "unknown"] as const;

export const LEVEL_RELEVANCES = ["shared_sl_hl", "hl_only", "unknown"] as const;

export const MARKS_SOURCES = [
  "explicit_in_question",
  "canonical_inferred",
  "custom_explicit",
  "not_reliably_known",
] as const;

export const CONFIDENCES = ["high", "medium", "low"] as const;

export const MARK_DISPLAY_MODES = [
  "exact_estimate",
  "partial_estimate",
  "practice_feedback_only",
] as const;

// Commit 1: only an explicit allocation in the pasted question may justify a
// numeric partial split. The model may NOT self-declare a canonical template.
export const EVIDENCE_SPLIT_SOURCES = ["explicit_in_question", "not_specified"] as const;

// The kind of genuinely-missing evidence a partial estimate may exclude.
// (No "source/stimulus" type — missing source stays practice_feedback_only.)
export const UNASSESSED_EVIDENCE_TYPES = ["diagram", "workings"] as const;

export const DIAGRAM_STATUSES = [
  "not_relevant",
  "not_submitted",
  "text_description_only",
  "submitted_and_assessed",
  "unable_to_assess",
] as const;

export const WORKINGS_STATUSES = [
  "not_relevant",
  "not_submitted",
  "typed_and_assessed",
  "image_and_assessed",
  "unable_to_assess",
] as const;

export const SYLLABUS_UNITS = ["unit_1", "unit_2", "unit_3", "unit_4", "unknown"] as const;

// Controlled syllabus topic codes (1.1–4.10). Analytics group by these codes;
// the human label is carried per-attempt in `topicLabel`.
export const SYLLABUS_TOPICS = [
  "1.1",
  "1.2",
  "2.1",
  "2.2",
  "2.3",
  "2.4",
  "2.5",
  "2.6",
  "2.7",
  "2.8",
  "2.9",
  "2.10",
  "2.11",
  "2.12",
  "3.1",
  "3.2",
  "3.3",
  "3.4",
  "3.5",
  "3.6",
  "3.7",
  "4.1",
  "4.2",
  "4.3",
  "4.4",
  "4.5",
  "4.6",
  "4.7",
  "4.8",
  "4.9",
  "4.10",
  "unknown",
] as const;

// Normalized command terms. A diagram instruction is captured by
// `diagramExpected` + `assessmentSkills`, NOT by a "using_diagram" term.
export const COMMAND_TERMS = [
  "define",
  "describe",
  "distinguish",
  "draw",
  "calculate",
  "explain",
  "analyse",
  "discuss",
  "evaluate",
  "examine",
  "justify",
  "compare",
  "contrast",
  "compare_contrast",
  "to_what_extent",
  "recommend",
  "other",
] as const;

// Controlled assessment skills, decoupled from paper/format. Drive coverage,
// confidence, performance analytics, and Study Next.
export const ASSESSMENT_SKILLS = [
  "definition",
  "calculation",
  "diagram_explanation",
  "economic_analysis",
  "data_interpretation",
  "application",
  "evaluation",
  "policy_recommendation",
] as const;

export const ATTACHMENT_CONTENTS = [
  "none",
  "diagram",
  "workings",
  "both",
  "neither_or_unreadable",
] as const;

export const MARK_BREAKDOWN_LABELS = [
  "Knowledge and terminology",
  "Economic analysis",
  "Application to context",
  "Evaluation and judgment",
  "Data use",
  "Diagram",
  "Calculation method",
  "Final answer",
  "Policy recommendation",
  "Structure and clarity",
] as const;

// --- Human labels (UI display) --------------------------------------------

export const ASSESSMENT_FORMAT_LABELS: Record<(typeof ASSESSMENT_FORMATS)[number], string> = {
  paper_1_a: "Paper 1 (a)",
  paper_1_b: "Paper 1 (b)",
  paper_2_a_definition: "Paper 2 (a)",
  paper_2_b_quantitative_or_diagram: "Paper 2 (b)",
  paper_2_c_to_f_diagram_and_explanation: "Paper 2 (c–f)",
  paper_2_g_extended_response: "Paper 2 (g)",
  paper_3_a_technical_or_quantitative: "Paper 3 (a)",
  paper_3_b_policy_recommendation: "Paper 3 (b)",
  custom_short_response: "Short response",
  custom_extended_response: "Extended response",
  uncertain: "Unclassified",
};

export const ASSESSMENT_SKILL_LABELS: Record<(typeof ASSESSMENT_SKILLS)[number], string> = {
  definition: "Definitions",
  calculation: "Calculation",
  diagram_explanation: "Diagram explanation",
  economic_analysis: "Economic analysis",
  data_interpretation: "Data interpretation",
  application: "Application",
  evaluation: "Evaluation",
  policy_recommendation: "Policy recommendation",
};
