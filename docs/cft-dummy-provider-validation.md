# CFT dummy-provider validation report

Date: 2026-08-29
Implementation commit: `b4db52c39375d472b79eebf4ed8b8a9dc4005bee`
Browser: Chrome for Testing 152.0.7977.64, mac-arm64

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check` | PASS — 19 test files, 306 tests; production build completed |
| `npm run build:test` | PASS — packaged test extension built |
| `git diff --check` | PASS |
| Packaged CFT `--provider=dummy --dummy-profile=normal --scenario=navigation` (runner default delay) | PASS — `testBuild:true`, `delayMs:69`; home/detail/back translated 9/48/149 nodes; no duplicate source ids; OFF restored the page; all 27 geometry snapshots stayed within 1 px; max long task 0 ms, CPU recovery 1.87 s |
| Packaged CFT `--provider=dummy --dummy-profile=expanded --scenario=navigation` (runner default delay) | PASS — `testBuild:true`, `delayMs:69`; expanded output was observed through the renderer; all 27 geometry snapshots stayed within 1 px; max long task 0 ms, CPU recovery 1.99 s |
| Production-build guard with `--provider=dummy --skip-build` | PASS (expected rejection) — loaded build reported `kind:production`, `testBuild:false`, and the runner failed with the explicit `npm run build:test` message |

The CFT artifacts were written to:

- `/private/tmp/translight-cft/result-normal-69/result.json`
- `/private/tmp/translight-cft/result-expanded-69/result.json`
- `/private/tmp/translight-cft/result-production-guard-69/result.json`

Both successful artifacts record the provider type, profile, delay, extension
version/build identifier, and tested commit. The scenario also reports that the
page realm could not see the extension harness or runtime and had zero
translations before the extension action was invoked.

## Delay calibration

The real Chrome Translator API was observed in Chrome with 78 successful
`en:ko` requests. The measured average was `68.82 ms`, with a `39.6 ms`
minimum and `95.4 ms` maximum. The Dummy provider and CFT runner therefore
use the rounded integer default `69 ms`; `--dummy-delay-ms` remains available
for controlled timing experiments.

## What this validates

The packaged test extension was activated through the extension-owned action /
background path. It exercised the real content script, `PageSession`, queue,
provider, and renderer while checking mutation discovery, navigation and Back,
pending-work OFF → ON restart, stale-session isolation, DOM cleanup, geometry,
page responsiveness, and CPU settling.

## Known limitations

Dummy mode does not validate Translator API availability, model download or
preparation, API-specific failures, or translation quality. The local fixture
is deterministic and does not replace validation on live sites. Real-provider
coverage remains a separate regular-Chrome/attached-Chrome path using
`npm run build` and a Translator-capable browser profile.
