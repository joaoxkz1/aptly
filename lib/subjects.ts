import type { Subject } from "./types";

export const SUBJECTS: Subject[] = ["Economics", "Business", "Physics"];

export const TOPICS: Record<Subject, string[]> = {
  Economics: [
    "Demand & Supply",
    "Elasticities",
    "Market Failure",
    "Macroeconomic Objectives",
    "Fiscal & Monetary Policy",
    "International Trade",
  ],
  Business: [
    "Marketing Mix",
    "Motivation Theories",
    "Finance & Accounts",
    "Operations Management",
    "Business Strategy",
  ],
  Physics: [
    "Mechanics",
    "Thermal Physics",
    "Waves",
    "Electricity & Magnetism",
    "Energy Production",
  ],
};

export const SUBJECT_COLORS: Record<Subject, string> = {
  Economics: "bg-emerald-500",
  Business: "bg-sky-500",
  Physics: "bg-violet-500",
};

export const SUBJECT_BADGE: Record<Subject, string> = {
  Economics:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
  Business:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900",
  Physics:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
};
