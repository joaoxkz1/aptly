import "server-only";
import { topicQuestionSet } from "./topic-set";

const SHARED = "shared_sl_hl" as const;

export const UNIT_1_QUESTIONS = [
  ...topicQuestionSet({
    topicCode: "1.1",
    levelRelevance: SHARED,
    short: [
      [
        "define",
        "Define opportunity cost. [2 marks]",
        "The next best alternative forgone when a choice is made.",
        "Describing opportunity cost as the money price of a choice rather than the value of the next best alternative forgone.",
        ["scarcity", "choice"],
      ],
      [
        "define",
        "Define scarcity in economics. [2 marks]",
        "The condition in which finite resources are insufficient to satisfy unlimited human wants.",
        "Treating scarcity as a temporary shortage of one product rather than the fundamental economic problem.",
        ["scarcity", "resource_allocation"],
      ],
    ],
    ten: [
      [
        "explain",
        "Explain how scarcity gives rise to choice and opportunity cost. [10 marks]",
        "Scarcity, finite factors of production, unlimited wants, choice and opportunity cost.",
        "Show that competing uses of limited resources force choices, each of which sacrifices the next best feasible alternative.",
        "Presenting scarcity, choice and opportunity cost as unrelated definitions rather than a causal chain.",
        ["scarcity", "economic_analysis"],
      ],
      [
        "analyse",
        "Analyse how a production possibilities curve can illustrate scarcity, choice and opportunity cost. [10 marks]",
        "Production possibilities, productive efficiency, attainable combinations and opportunity cost.",
        "Explain how the frontier represents current productive capacity, points on it require trade-offs, and its slope reflects opportunity cost.",
        "Assuming every point inside the frontier is unattainable or that moving along it increases total resources.",
        ["production_possibilities", "trade_off"],
      ],
    ],
    fifteen: [
      [
        "discuss",
        "Discuss the view that economic growth removes the problem of scarcity. [15 marks]",
        "Scarcity, productive capacity, economic growth and changing wants.",
        "Growth can expand attainable output and ease particular constraints, but resources remain finite relative to wants and growth itself involves choices.",
        "Distinguish reduced material deprivation from elimination of scarcity, and consider distribution, sustainability and evolving wants.",
        "Claiming that a larger production possibilities frontier means opportunity cost no longer exists.",
        ["growth", "scarcity", "sustainability"],
      ],
      [
        "evaluate",
        "Using real-world examples, evaluate the usefulness of opportunity cost when governments allocate scarce resources. [15 marks]",
        "Opportunity cost, public expenditure choices and resource allocation.",
        "Government spending or regulation redirects real resources, so the benefits of the chosen use should be compared with the next best feasible public use.",
        "Consider measurement difficulties, uncertainty, distributional priorities, non-market benefits and political constraints before judging usefulness.",
        "Treating opportunity cost as only the recorded financial cost in a government budget.",
        ["government_choice", "trade_off", "distributional_effect"],
      ],
    ],
  }),
  ...topicQuestionSet({
    topicCode: "1.2",
    levelRelevance: SHARED,
    short: [
      [
        "distinguish",
        "Distinguish between positive and normative economic statements. [2 marks]",
        "Positive statements are testable claims about what is, while normative statements express value judgements about what ought to be.",
        "Equating positive with beneficial and normative with normal or widely accepted.",
        ["positive_normative", "economic_method"],
      ],
      [
        "define",
        "Define the term ceteris paribus. [2 marks]",
        "Other relevant factors are assumed to remain unchanged while the relationship between selected variables is examined.",
        "Interpreting ceteris paribus as a claim that other factors never change in reality.",
        ["assumptions", "economic_models"],
      ],
    ],
    ten: [
      [
        "explain",
        "Explain why economists use models and assumptions to study economic behaviour. [10 marks]",
        "Economic models, abstraction, assumptions, hypotheses and testable implications.",
        "Show how simplifying complex reality isolates relationships, supports predictions and permits evidence to test or refine explanations.",
        "Assuming that a simplified model is useless merely because its assumptions are unrealistic.",
        ["economic_models", "assumptions"],
      ],
      [
        "analyse",
        "Analyse why two economists may reach different policy conclusions from the same economic evidence. [10 marks]",
        "Positive analysis, normative judgements, model assumptions and interpretation of evidence.",
        "Different causal assumptions, time horizons, priorities and value judgements can lead from common observations to different recommendations.",
        "Suggesting that disagreement necessarily means one economist has ignored all evidence.",
        ["policy_disagreement", "assumptions", "values"],
      ],
    ],
    fifteen: [
      [
        "evaluate",
        "Evaluate the role of assumptions in making economic models useful for policy decisions. [15 marks]",
        "Model-building, simplifying assumptions, prediction and empirical testing.",
        "Assumptions make causal reasoning tractable, but predictions can mislead when omitted factors or behavioural responses are important.",
        "Judge usefulness by purpose, predictive performance, transparency, robustness and the costs of policy error rather than realism alone.",
        "Arguing that more detailed models are always more accurate or more useful.",
        ["economic_models", "assumptions", "policy_design"],
      ],
      [
        "discuss",
        "Using real-world examples, discuss whether economic policy can ever be based only on positive analysis. [15 marks]",
        "Positive and normative economics, policy objectives and evidence.",
        "Evidence can estimate likely consequences, but choosing objectives and accepting trade-offs normally requires value judgements.",
        "Consider technocratic rules, democratic mandates, uncertainty and distributional choices before reaching a conditional conclusion.",
        "Treating empirical evidence as free of all interpretation or treating every factual claim as normative.",
        ["positive_normative", "policy_design", "distributional_effect"],
      ],
    ],
  }),
];
