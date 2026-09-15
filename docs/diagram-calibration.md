# Diagram calibration pilot

This is an **offline review harness and 24-case recruitment template**, not a completed vision evaluation. The repository contains planned synthetic scenarios, original example answer text, and no photographs or teacher marks. Unit tests use synthetic engineering values to test policy and validation. Passing them does not show that a model can interpret real handwriting.

## Collect independent evidence

1. Copy `diagram-calibration-template.csv` into a private working directory. Supply the exact question, its contract/version, student text, and the actual local photo path. Keep image bytes and identifying student details out of the repository. A genuinely omitted attachment remains blank; an unavailable image must not be relabeled as omission.
2. Use the scenario column to recruit varied examples, not to label them. The coverage includes alternate notation, labeling, arrows, incompatible mechanisms, same-part root errors, blurred photos, teacher annotations, several families, and 4/10/15-mark tasks. Replace the supplied example answer text when collecting authentic pairs.
3. Set `artifact_provenance` to `teacher_reviewed_synthetic` for constructed work or `consented_student_work` for authorized real work after collection. `planned_synthetic` and `synthetic_engineering` are excluded from agreement metrics.
4. Give the teacher only the question, applicable marking contract, answer and image. Keep the intended scenario, Aptly feedback and Aptly mark hidden until the teacher locks the independent judgment. The teacher may inspect the original private question blueprint; do not show them Aptly's diagnosis of this answer.

Generate an optional blinded teacher pack, excluding scenario expectations and Aptly output:

```powershell
node scripts/diagram-calibration.mjs --teacher private/manifest.csv --teacher-pack private/teacher-blind.csv
```

The command creates a new file and will not overwrite an existing review. After review, join the `teacher_*` columns back into the original manifest by `case_id`. Preserve the original photos, text and version information. Teacher state is `pending`, `complete`, `unassessable`, or `exclude`; an unreadable photograph has no mark. Record reviewer, date and `teacher_blinded=true` only when true. Record optional diagram/explanation marks only for a genuine 2+2 contract. Separate component observations from any overall ceiling: the awarded overall mark need not equal raw component credit when a ceiling applies.

## Record Aptly separately

Run the selected snapshots through the actual staging assessment path with the pilot feature flag enabled. This harness makes **zero network/provider calls**, including when JSON results are supplied. Any paid model evaluation remains a separately authorized action. Export observations, versions, image hashes and snapshot identity for investigation, but never inject teacher marks or intended scenario labels into the grading request.

Supply an independent JSON array using this shape; the null values below are placeholders, not test results:

```json
[
  {
    "case_id": "cal-01",
    "state": "incomplete",
    "total_marks": 4,
    "mark": null,
    "diagram": null,
    "explanation": null,
    "rule_ids": [],
    "evidence_state": "processing_failure",
    "assessment_version": 4,
    "model_version": "record-actual-model-id",
    "reviewer_version": "record-actual-reviewer-version",
    "snapshot_id": "record-actual-snapshot-id"
  }
]
```

Use `state=complete` only for completed assessment snapshots. Incomplete or failed operations must have `mark=null`; they are never scored as zero. Completed marks are integers in the actual total's range. Optional components are integers 0-2 only for split contracts. Preserve state failures and disagreements as evidence rather than excluding inconvenient cases silently.

## Compare and inspect

```powershell
node scripts/diagram-calibration.mjs
node scripts/diagram-calibration.mjs --self-test
node scripts/diagram-calibration.mjs --teacher private/reviewed-manifest.csv --aptly private/aptly-results.json --out private/comparison.json
```

The default command reports 24 planned cases and **zero paired marks**. The self-test checks the harness using explicitly synthetic numbers; it is not a calibration run. Comparison requires complete independent teacher metadata and actual Aptly provenance. The report separates authentic and constructed evidence, and separates mark totals; each cohort reports count, exact matches, matches within one mark, mean absolute difference, signed difference and family counts. It also lists component/rule disagreements and mismatches between teacher assessability and Aptly completion. These describe this selected sample only.

Investigate every disagreement by inspecting the exact bound image and answer. Categorize the cause: unreadable source, excluded teacher annotation, incorrect visual observation, economic interpretation, contract scope, arithmetic, or teacher disagreement. Revise the contract or implementation only after reviewing evidence; preserve the original run. Re-run changed-answer/same-image cases because consistency may change even if observations can be reused.

## Post-implementation real-world validation

- The [source-closure record](ib-source-verification-pending.md) resolves the researched assessment rules and current guide amendments. All 96 four-mark and 211 historical essay records have a substantive source review; they are not independently teacher-validated.
- Obtain independent teacher marks on authentic handwritten pairs from the enabled families. This measures real-world agreement and observation quality; it does not block completion of the researched implementation. No independent teacher marks have been supplied.
- Keep `NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED` staged until evidence supports the selected scope. Record actual configurations with each run; follow the implementation rollout/rollback documentation for changing the flag and preserving historical scores.
- Treat 24 varied pairs as an initial disagreement-finding exercise. They cannot establish syllabus-wide accuracy, examiner equivalence, or improved learning.
