# Translight Development Guidelines

Scope: implementation, bug fixes, and validation for `neverworkalone/translight`.

Core principle: **Do not patch by assumption. Reproduce the failure before changing code, then verify the fix under the same conditions. When changing DOM-processing paths, validate both functionality and performance.**

## 1. Scope and Boundaries

* Confirm the target repository, branch/commit, requested scope, and current working changes before starting.
* DO NOT overwrite unfinished user work.
* Treat NaverDic as a separate product and repository. DO NOT automatically carry over its features, settings, or product decisions.
* Use current code and tests to establish existing behavior.
* Determine expected behavior from confirmed requirements and user-designated designs.
* If these conflict, identify the conflict rather than silently choosing one.
* If older planning documents conflict with current behavior, DO NOT make product-policy decisions on your own.
* Keep changes scoped to the confirmed cause or requested task.
* DO NOT mix unrelated refactoring, feature expansion, or dependency additions into the same change.
* Distinguish implementation requests from review requests.
* When asked only to review, DO NOT modify product code yourself.

## 2. Fixes and Validation

### Bug Fixes

* Identify the actual symptom, expected behavior, and reproduction conditions.
* Build a reproduction from the provided screenshots, saved pages, logs, actual DOM, or other relevant evidence.
* MUST run the reproduction against the pre-change code and confirm that it fails.
* A test that fails because of environment problems or a broken test harness is NOT a successful reproduction.
* Fix the confirmed cause with the smallest reasonable change.
* DO NOT add broad selectors, global style exceptions, or unrelated special cases without confirming their scope.
* Re-run the same reproduction with the same input, environment, and pass criteria after the change.
* MUST confirm a pre-change failure and a post-change pass for the same case.
* Check the normal path and nearby failure conditions.
* Preserve every automatable bug reproduction in the default regression suite.
* Extend existing coverage when it already represents the same failure.
* If automation is not feasible, explain why and retain reproducible manual steps.

If the original symptom cannot be reproduced:

* Separate confirmed facts from hypotheses.
* Continue investigation and test construction where possible.
* DO NOT make a speculative product change without approval.

If required validation cannot run:

* Report `validation blocked`.
* State what could not be validated and why.
* DO NOT report the issue as resolved.

DO NOT make a test pass by removing reproduction conditions, weakening expected behavior, deleting failing assertions, or changing the test to match the broken implementation.

If a test itself is wrong, fix the test for a stated reason and re-confirm that the corrected test still fails against the pre-change code.

### Rendering Issues

* Validate positioning, overlap, clipping, width, wrapping, scrolling, and visibility problems in actual Chrome/Chromium rendering.
* Use jsdom or mocked coordinates only for structure, state, and deterministic logic checks.
* DO NOT treat mocked layout values as proof of correct browser layout.
* DO NOT treat DOM presence as proof that an element is visibly rendered correctly.
* Validate the user-reported case or a fixture that faithfully reproduces the same rendering failure.
* If only a fixture was validated, report that separately from validation on the actual site.
* Inspect the observation that matches the bug:

  * relative positioning
  * non-overlap
  * clipping
  * dimensions
  * wrapping
  * visibility
  * scroll behavior
* When relevant, also check:

  * display modes and mode switching
  * narrow viewports and resize
  * multi-line content
  * explicit grid/flex placement
  * clipping and overflow
  * SPA updates
  * source-node removal or movement
  * translation stop/restart
* When text length affects layout, use deterministic short and long translations for reproducible checks.

## 3. Performance and Test Safety

* When adding or changing site-specific handling, DOM collection, insertion, recovery, layout synchronization, or observer paths, validate both functional and performance regressions in the same change.
* Prefer extending existing fixtures, instrumentation, and tests instead of creating a new test file for every case.
* Exercise the actual production path at N/2N scale or another scale appropriate to the change.
* Choose input shapes that expose the relevant risk, such as:

  * many siblings
  * deep DOM trees
  * repeated events
  * large translated-node sets
  * repeated insertion/recovery cycles
* Measure the work that matters for the changed path, including:

  * nodes visited, items processed, or characters scanned
  * selector search scope
  * layout reads
  * DOM/style writes
  * callbacks
  * scheduled work
* DO NOT rely only on helper or callback invocation counts when each call can perform unbounded work.
* Define an operation budget or complexity expectation when the path has meaningful scaling risk.
* Detect and prevent:

  * unnecessary full rescans
  * accidental O(N²) growth
  * global work triggered by local changes
  * redundant style writes
  * observer self-trigger loops
  * scheduled work that survives teardown
* Prefer deterministic operation counts and call counts over arbitrary timing thresholds in automated tests.
* Use real browser profiling when the change directly concerns:

  * CPU spikes
  * hangs
  * frame drops
  * expensive layout reads/writes
  * event-processing regressions
* Keep automated operation-count validation separate from real browser timing/CPU/frame measurements.
* Performance bug regressions MUST fail before the fix and pass afterward.
* New performance-sensitive paths MUST execute in regression coverage and stay within their defined budget.
* Persistent regression coverage belongs in the default test suite.

### Test Integrity

* Tests MUST exercise production code.
* DO NOT reimplement the fix inside the test.
* DO NOT mock the function under test into succeeding.
* Mock only required boundaries such as external providers, time, or deterministic layout values.
* Assert user-visible results and meaningful cost, not only implementation details such as a class name or one CSS declaration.
* DO NOT delete or skip failing tests merely to make the suite pass.
* DO NOT loosen performance budgets without a justified reason and an explicit explanation.

### Cleanup and Site Safety

* Preserve the site's original structure, behavior, and appearance as much as possible.
* Modify only what is required for the intended Translight display mode.
* On teardown, remove only nodes, styles, attributes, observers, and scheduled work created by Translight.
* DO NOT delete site-owned nodes during recovery.
* DO NOT restore stale snapshots over changes made later by the site.
* Re-check dynamic conditions after insertion when they can change.
* Invalidate caches when relevant nodes are changed, removed, moved, or resized.
* Keep re-checks limited to the affected scope whenever possible.

## 4. Execution and Reporting

### Execution

* Determine commands from the current `package.json` and test configuration.
* Run the narrow relevant tests first.
* Then run the default validation command: `npm run check`.
* If code changes after validation, rerun the affected checks.

### Completion Report

For bug and compatibility fixes, report briefly:

* **Reproduction:** symptom, expected behavior, and confirmed pre-change failure
* **Fix:** confirmed cause and scope of the change
* **Validation:** post-change result under the same conditions and nearby regressions checked
* **Performance:** scale, metrics, budget, and result when a performance-sensitive path changed
* **Unvalidated:** anything not executed, why it was not executed, and what is still needed

Clearly distinguish between:

* `patch prepared`
* `automated tests passed`
* `browser reproduction confirmed fixed`
* `validation blocked`

Passing the full automated test suite alone does NOT prove that the reported user-visible issue is resolved.

Do not report results from an older commit or patch state as validation of the latest change.

## Review Feedback

When asked to check PR review comments, evaluate the feedback rather than merely summarizing it: fix findings you agree with, and explain your reasoning when you disagree.

* Read all current review comments and threads.
* Evaluate each comment against the current code and PR head.
* If you agree with the finding, fix it and run the relevant validation.
* If you disagree, explain why with concrete technical reasoning instead of changing the code.
* Push confirmed fixes to the existing PR.
* DO NOT self-review or merge the PR unless explicitly asked.
