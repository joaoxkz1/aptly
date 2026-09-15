# Live diagram validation: pricing and review controls

Verified from fetched official OpenAI documentation on **2026-09-15 at 18:36:53 UTC**. This file records rates and a review plan, not actual spend or grading accuracy. No assessment requests were made during this research.

## Exact configured models

Local [config.ts](../../lib/ai/config.ts) fixes the visual observer to `gpt-5.4` and authoritative grader to `gpt-5.6-terra`. Both assessed stages use medium reasoning and a 4,400 output-token limit. The observer supplies observations; the authoritative grader assigns economic credit. Calls use the Responses API, `store:false`, and `maxRetries:0`. The client does not override the endpoint or request a service tier. No model, effort, caching, or service-tier setting was changed for this review.

Assessed-observer settings are recorded in [assessed-visual-review.ts](../../lib/ai/assessed-visual-review.ts).

## Published rates

**USD per 1 million tokens, Standard processing, input at or below 272,000 tokens.** Both exact model prices were available; no substitute model was used.

| Stage / exact model | Uncached input | Cached input | Cache write | Output | Official source |
| --- | ---: | ---: | ---: | ---: | --- |
| Observer: `gpt-5.4` | $2.50 | $0.25 | No separate premium; ordinary input rate | $15.00 | [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4), [caching generation differences](https://developers.openai.com/api/docs/guides/prompt-caching) |
| Grader: `gpt-5.6-terra` | $2.00 | $0.20 | $2.50 | $12.00 | [GPT-5.6 Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Standard pricing table](https://developers.openai.com/api/docs/pricing) |

The model pages specify higher rates above 272,000 input tokens. Terra's published long-context rates are $4.00 input, $0.40 cached input, $5.00 cache write and $18.00 output. GPT-5.4 specifies 2× input and 1.5× output for long context. Eligible regional processing adds a 10% uplift; a different service tier also needs its own applicable rate. Check actual response/request metadata before presenting these Standard estimates as invoice-equivalent. [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [pricing](https://developers.openai.com/api/docs/pricing).

## Cost calculation

For each actual provider response, retain its response ID, returned model, service tier, status, input/output usage, `input_tokens_details.cached_tokens`, `input_tokens_details.cache_write_tokens` when available, and `output_tokens_details.reasoning_tokens`. Record both stages separately under the same assessment-attempt ID.

Let `I` be total input tokens, `C` cached tokens, `W` cache-write tokens, and `O` total output tokens. For the Standard short-context rates above:

```text
gpt-5.4 USD       = ((I - C) * 2.50 + C * 0.25 + O * 15.00) / 1,000,000
gpt-5.6-terra USD = ((I - C - W) * 2.00 + C * 0.20 + W * 2.50 + O * 12.00) / 1,000,000
assessment USD   = sum of actual dispatched stage costs
```

Cache-write pricing replaces the ordinary input rate for those tokens; it is not added on top. Use the actual reported counts and validate `0 <= C + W <= I`. Terra can create cache writes in its default implicit mode; absence of an explicit caching option is not proof of zero writes. Earlier models have no additional cache-write premium. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

If Terra's write count is unavailable, report an estimate range with `W=0` to `W=I-C`, or mark the exact cost unavailable. Missing usage after a timeout is unknown spend, not zero. Do not estimate token counts from the visible JSON length. Reasoning tokens are billed as output and are already included in `O`; adding them again double-counts them. Incomplete responses can incur usage without yielding usable text. [Reasoning usage and cost controls](https://developers.openai.com/api/docs/guides/reasoning).

Image input is converted into billable input tokens. The observer uses `detail:high`; do not add a separate image-generation fee to the observer call. Use the response's input usage for actual accounting rather than charging estimated image tokens a second time. Creation of synthetic fixtures is a separate operation from assessment and is not included in this token-cost formula. [Images and vision costs](https://developers.openai.com/api/docs/guides/images-vision).

At the configured output limits, one complete two-stage attempt has an output-only ceiling of $0.1188; 20 such attempts have an output-only ceiling of $2.376 at these rates. This is arithmetic from `4400 × (15 + 12) / 1,000,000`, **not a total spend ceiling**: input costs, failed/uncertain dispatches and any applicable pricing adjustments remain additional.

## Recommended first-pass coverage

The user's requested categories fit a 14-attempt first pass by combining the partial-credit and weak-diagram/strong-explanation categories in one case. Reserve up to six of the authorized 20 started attempts for necessary targeted retests. Root owns every assessment dispatch; agents make none.

1. Clearly correct diagram and explanation.
2. Partial diagram with a strong explanation, testing earned partial credit.
3. Wrong shift with an internally coherent own-figure explanation, separating the original economic error from error carry forward.
4. Missing task-relevant labels under the exact question's labeling rule.
5. Correct diagram with weak explanation.
6. Diagram/explanation contradiction.
7. Diagram only.
8. Explicitly confirmed diagram omission.
9. Messy but readable synthetic handwriting.
10. Blurry/ambiguous version of the same synthetic photograph.
11. Readable irrelevant image.
12. Valid alternative notation.
13. A representative 10-mark task whose diagram matters.
14. A representative 15-mark task whose diagram matters.

Inspect fixture content before dispatch. A mislabeled or accidentally ambiguous constructed case cannot serve as ground truth merely because its filename says "correct". Keep intended-case labels and expected results out of provider inputs. These are author-reviewed synthetic engineering cases; independent teacher marks remain absent.

## Stop criteria and error attribution

- **Hard budget stop:** do not start attempt 21. Count failed started attempts and retests; separately count provider calls because an image attempt can dispatch two stages. Do not retry an uncertain dispatch blindly.
- **Pause at the first integrity failure:** mark saved for unreadable essential evidence, wrong snapshot/image binding, duplicate paid dispatch, impossible component total/ceiling, private-content leakage, or a saved mark that differs from the authoritative result. Preserve the failed run, fix locally, and use a reserved retest only after the cause is understood.
- **Pause a repeated provider failure:** after two consecutive failures of the same stage/cause, inspect status, timeout, token limit and schema output before spending more attempts. This is an engineering recommendation, not an IB rule.
- **Stop once the planned coverage and necessary retests are complete.** Additional identical calls do not establish reliability. Treat score disagreements and variance as findings; do not rerun until a preferred mark appears.

Attribute the earliest demonstrated cause, retaining downstream symptoms:

| Category | Evidence that distinguishes it |
| --- | --- |
| Fixture/stimulus ambiguity | The actual pixels or supplied task do not support the intended case; no justified model-error conclusion yet. |
| Visual observation | A legible relationship/label was missed or invented in the observer's bounded observations. |
| Economic interpretation | Observations are accurate, but the grader derives the wrong economic mechanism or outcome. |
| Contract/rule scope | Wrong role/family, invalid labeling ceiling, repeated root-error penalty, or inappropriate rule transfer across question parts. |
| Deterministic reconciliation | Provider components and visible evidence are available, but server totals/ceilings or absent-explanation handling are wrong. |
| Transport/schema failure | API timeout, incomplete response, invalid structured output, refusal or processing error; retain no fabricated score. |
| Persistence/presentation | The validated mark is correct but the saved result, diagnostics or UI misrepresent it. |
| Human-reference disagreement | A reviewer disputes economic credit despite accurate observations and correctly applied contract; resolve independently, without relabeling the model run. |

Report successful completion, unreadable/no-mark outcomes, operational failures, and scored disagreements separately. A small selected synthetic run demonstrates specific behavior and finds defects; it is not teacher calibration, examiner equivalence, or syllabus-wide accuracy.
