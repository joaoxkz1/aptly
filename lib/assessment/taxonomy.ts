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

// --- Assessment Integrity: canonical, server-derived scoring model ----------
// Where the mark TOTAL (denominator) came from. Decided by trusted app/server
// logic (preflight + user confirmation + controlled template), never the model.
export const MARK_TOTAL_SOURCES = ["explicit", "user_confirmed", "template_inferred", "unknown"] as const;

// The single canonical per-attempt status every surface reads through the
// status helper. Server-derived and persisted for new attempts; derived
// conservatively on read for legacy attempts.
export const SCORING_STATES = ["marked", "provisional", "feedback_only", "legacy_unscored"] as const;

// Controlled rubric-template registry. Exactly one approved template this
// release. A universal missing-diagram cap is NOT allowed.
export const RUBRIC_TEMPLATE_IDS = ["four_mark_diagram_explain"] as const;

// --- IB Marking Fidelity: assessment framework -----------------------------
// The controlled IB-style marking framework. SERVER-derived from trusted
// preflight/context (explicit paper labels, recognised templates, or an
// explicit user confirmation) — NEVER inferred by the model or from a command
// term/raw total alone. Drives which markband model and UI are used.
// There is NO universal rubric across totals: 10/15-mark papers are best-fit,
// Paper 2(a)/(b) and Paper 3(a) are question-specific analytic, and only the
// recognised Paper 2(c)–(f)-style diagram-explain uses a 2+2 component split.
export const ASSESSMENT_FRAMEWORKS = [
  "paper2_short_analytic", // recognised short 1–2 mark response (definition/calc/diagram-read)
  "paper2_four_mark_diagram_explain", // recognised "using a named diagram, explain…" (2 written + 2 diagram)
  "paper2a_definition", // explicit Paper 2(a) — question-specific analytic definition marking
  "paper2b_quantitative", // explicit Paper 2(b) — question-specific quantitative/diagram task
  "paper1a_10_mark", // Paper 1(a) best-fit, 10 marks
  "paper1b_15_mark", // Paper 1(b) best-fit, 15 marks
  "paper2g_15_mark", // Paper 2(g) data-response best-fit, 15 marks
  "paper3a_analytic", // explicit Paper 3(a) — variable-mark analytic subparts (never the 2+2 template)
  "paper3b_10_mark", // Paper 3(b) HL recommendation best-fit, 10 marks
  "generic_practice", // explicit/confirmed total but paper format NOT confirmed
] as const;

export const CONFIDENCES = ["high", "medium", "low"] as const;

// markDisplayMode is now SERVER-set (never model-chosen) and kept for DB /
// back-compat. `provisional_estimate` backs a template/inference-sourced total.
export const MARK_DISPLAY_MODES = [
  "exact_estimate",
  "partial_estimate",
  "provisional_estimate",
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

// Student-facing framework label shown in the feedback header. Generic practice
// deliberately does NOT claim a paper — the header adds "Paper format not
// confirmed" separately.
export const ASSESSMENT_FRAMEWORK_LABELS: Record<(typeof ASSESSMENT_FRAMEWORKS)[number], string> = {
  paper2_short_analytic: "Short response",
  // Recognised by structure, not an explicit Paper 2 label — never claim "Paper 2".
  paper2_four_mark_diagram_explain: "4-mark diagram explanation",
  paper2a_definition: "Paper 2(a) · definition",
  paper2b_quantitative: "Paper 2(b) · quantitative",
  paper1a_10_mark: "Paper 1(a) · 10-mark explanation",
  paper1b_15_mark: "Paper 1(b) · 15-mark extended response",
  paper2g_15_mark: "Paper 2(g) · 15-mark data response",
  paper3a_analytic: "Paper 3(a) · analytic response",
  paper3b_10_mark: "Paper 3(b) · 10-mark recommendation",
  generic_practice: "Practice response",
};

// --- Curated syllabus topic labels ----------------------------------------
// One deliberate display label per controlled topic code. Analytics ALWAYS
// group by the code; these labels normalize display so raw classifier variants
// ("demand" / "Demand" / "Demand & Supply") can never fragment a topic.
// `SYLLABUS_TOPIC_SHORT_LABELS` is a deliberate compact label for dense/compact
// layouts (never a truncated fragment); the full label stays available for
// title attributes and supporting copy.
export const SYLLABUS_TOPIC_LABELS: Record<(typeof SYLLABUS_TOPICS)[number], string> = {
  "1.1": "What is Economics",
  "1.2": "Economic Methodology",
  "2.1": "Demand",
  "2.2": "Supply",
  "2.3": "Market Equilibrium",
  "2.4": "Elasticities",
  "2.5": "Government Intervention",
  "2.6": "Market Failure & Externalities",
  "2.7": "Public Goods & Information",
  "2.8": "Market Power",
  "2.9": "Theory of the Firm",
  "2.10": "Market Structures",
  "2.11": "Price Discrimination",
  "2.12": "Behavioural Economics",
  "3.1": "Measuring Economic Activity",
  "3.2": "AD–AS Analysis",
  "3.3": "Macroeconomic Objectives",
  "3.4": "Fiscal Policy",
  "3.5": "Monetary Policy",
  "3.6": "Supply-side Policies",
  "3.7": "Inequality & Poverty",
  "4.1": "Benefits of Trade",
  "4.2": "Trade Protection",
  "4.3": "Economic Integration",
  "4.4": "Exchange Rates",
  "4.5": "Balance of Payments",
  "4.6": "Sustainable Development",
  "4.7": "Measuring Development",
  "4.8": "Barriers to Development",
  "4.9": "Development Strategies",
  "4.10": "Global Economic Relations",
  unknown: "Unclassified topic",
};

// Compact labels only where the full curated label is long. Deliberate, never
// a broken phrase. Codes not listed fall back to the full curated label.
export const SYLLABUS_TOPIC_SHORT_LABELS: Partial<Record<(typeof SYLLABUS_TOPICS)[number], string>> = {
  "1.2": "Methodology",
  "2.3": "Equilibrium",
  "2.6": "Market Failure",
  "2.7": "Public Goods",
  "3.1": "National Income",
  "3.3": "Macro Objectives",
  "3.6": "Supply-side Policy",
  "3.7": "Inequality",
  "4.6": "Sustainable Dev.",
  "4.10": "Global Relations",
};
