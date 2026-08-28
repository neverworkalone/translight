# Translight PR Review Guidelines

Scope: PR reviews for `neverworkalone/translight`.

These rules apply only when the user explicitly requests a review of an existing PR.

Creating or updating a PR during an implementation task does NOT activate this review workflow and does NOT authorize self-review or merge.

DO NOT self-review or merge a PR that you created or updated as part of the current implementation task unless the user separately asks you to review or merge it.

## Review Scope

* Always review the latest PR head.
* Review the entire PR diff against the merge base, not only the latest commits.
* Inspect every changed file and relevant surrounding code.
* Report all substantiated blocking findings visible in the first pass whenever possible.
* Check:

  * reproduction evidence
  * connection between cause and fix
  * functional regressions
  * performance regressions
  * cleanup and recovery behavior
  * validation coverage
* **Fix causes, not symptoms.** If a change works around the reported failure without fixing the causal path, treat the approach as suspect.
* When the approach is flawed, explain why, recommend a safer design direction, and define how that direction should be validated.
* Clearly distinguish:

  * code-based expectations
  * mocked-environment results
  * actual browser observations

## Prior Discussion and Proportionality

* Read existing review threads and author replies before commenting.
* DO NOT repeat resolved or convincingly rebutted findings without new evidence.
* Keep findings proportional: DO NOT block on speculative edge cases that are not reachable under supported usage or a credible threat model.
* Consolidate related findings and avoid duplicate comments.

## Approval and Merge

* DO NOT approve a fix as confirmed if the reported symptom was not revalidated.
* DO NOT approve a performance-sensitive change when required performance regression coverage is missing.
* Post confirmed blocking findings with supporting evidence and hold the merge.
* When a new revision is pushed, review the latest head again.
* DO NOT merge draft PRs or PRs explicitly marked do-not-merge, even when validation passes.
* If the user explicitly requested a PR review and did not prohibit merging, merge the PR once all blockers are resolved and required validation is confirmed.
* Before merging, verify that the PR head still matches the reviewed and validated commit.
* For blocking findings, require regression coverage for the same class of failure when the case is automatable.
* Keep site-specific rules in code and regression fixtures rather than accumulating them in this document.
