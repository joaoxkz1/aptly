import "server-only";
import type { EconomicsBankQuestion } from "./types";
import { FOUR_MARK_SLICE } from "./four-mark-slice";
import { FOUR_MARK_INTRODUCTION } from "./four-mark-introduction";
import { FOUR_MARK_MICRO_SHARED } from "./four-mark-micro-shared";
import { FOUR_MARK_MICRO_HL } from "./four-mark-micro-hl";
import { FOUR_MARK_MACRO_SHARED } from "./four-mark-macro-shared";
import { FOUR_MARK_MACRO_HL } from "./four-mark-macro-hl";
import { FOUR_MARK_GLOBAL_TRADE } from "./four-mark-global-trade";
import { FOUR_MARK_GLOBAL_CURRENCY } from "./four-mark-global-currency";
import { FOUR_MARK_GLOBAL_DEVELOPMENT } from "./four-mark-global-development";

export const FOUR_MARK_QUESTIONS: readonly EconomicsBankQuestion[] = Object.freeze([
  ...FOUR_MARK_SLICE,
  ...FOUR_MARK_INTRODUCTION,
  ...FOUR_MARK_MICRO_SHARED,
  ...FOUR_MARK_MICRO_HL,
  ...FOUR_MARK_MACRO_SHARED,
  ...FOUR_MARK_MACRO_HL,
  ...FOUR_MARK_GLOBAL_TRADE,
  ...FOUR_MARK_GLOBAL_CURRENCY,
  ...FOUR_MARK_GLOBAL_DEVELOPMENT,
]);
