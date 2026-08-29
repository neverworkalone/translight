# CFT dummy-provider validation report

Date: 2026-08-29  
Implementation commit: `4eb4a330fe5cc37b8aede3203998191a4013a595`  
Browser: Chrome for Testing 152.0.7977.64, mac-arm64

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check` | PASS — 19 test files, 306 tests; production build completed |
| `npm run build:test` | PASS — packaged test extension built |
| `git diff --check` | PASS |
| Packaged CFT `--provider=dummy --dummy-profile=normal --dummy-delay-ms=20 --scenario=navigation` | PASS — `testBuild:true`; home/detail/back translated 36/58/149 nodes; no duplicate source ids; OFF restored the page; all 11 geometry snapshots stayed within 1 px; responsiveness and CPU recovery passed |
| Packaged CFT `--provider=dummy --dummy-profile=expanded --dummy-delay-ms=20 --scenario=navigation` | PASS — `testBuild:true`; expanded output was observed through the renderer; all geometry, lifecycle, responsiveness, and CPU gates passed |
| Production-build guard with `--provider=dummy --skip-build` | PASS (expected rejection) — loaded build reported `kind:production`, `testBuild:false`, and the runner failed with the explicit `npm run build:test` message |

The CFT artifacts were written to:

- `/private/tmp/translight-cft/result-normal-final/result.json`
- `/private/tmp/translight-cft/result-expanded-final/result.json`
- `/private/tmp/translight-cft/result-production-guard/result.json`

Both successful artifacts record the provider type, profile, delay, extension
version/build identifier, and tested commit. The scenario also reports that the
page realm could not see the extension harness or runtime and had zero
translations before the extension action was invoked.

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
