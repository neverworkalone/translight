# Chrome for Testing runner

The local runner launches a separate Chrome user-data directory with the built
Translight extension loaded, drives the browser through the Chrome DevTools
Protocol, samples Chrome processes and page translation state, and writes a
JSON report plus a Chrome trace under `artifacts/metacritic-chrome/`.

It requires Chromium or Chrome for Testing. The official Google Chrome app
ignores the command-line switches used to load an unpacked extension, so the
runner reports `validation blocked` instead of silently measuring a browser
without Translight.

## Launch mode

Build the extension and run the gallery scroll scenario with:

```bash
npm run test:metacritic:chrome
```

Use `--scenario=navigation` for the homepage → Latest News → New and Notable
→ back flow, `--cycles=5` for more repetitions, or `--skip-translation` to
smoke-test browser control without requiring Chrome's Translator model. The
runner auto-detects Chrome for Testing in the repository's sibling
`../codex/chrome-mac-arm64` directory, as well as the usual application and
system locations. Pass `--chrome=/path/to/browser` when it is installed
elsewhere. On macOS, a launched app-bundled browser is visible but starts with
`open -n -g`, so it gets a distinct app instance while the current app keeps
focus; use `--foreground` to opt into the old activating behavior. The runner
claims its browser by matching both the temporary profile and debugging port,
and removes a partially launched browser if startup fails. A temporary Chrome
profile is removed after the run unless `--keep-profile` is supplied.

The runner verifies the extension service worker's test-build marker before
configuring dummy mode and verifies that the loaded build SHA and clean-build
state match the checkout in local launch mode. A dirty tracked file or
non-ignored untracked input blocks commit-verified validation; ignored files
are excluded.

## Deterministic dummy-provider coverage

Use the local Metacritic-shaped fixtures with the test-only provider:

```bash
npm run test:metacritic:chrome -- \
  --provider=dummy \
  --dummy-profile=normal \
  --dummy-delay-ms=69 \
  --scenario=navigation \
  --url=http://127.0.0.1:5173/tests/fixtures/metacritic-cft.html \
  --chrome="/path/to/Google Chrome for Testing"
```

This scenario invokes the real toolbar-action seam, checks dummy output and
incremental mutation discovery, forces a pending-work OFF → ON restart, drives
navigation and browser Back, checks document/session state and duplicate source
ids, compares fixture geometry to its pre-translation baseline during rendering
and cleanup, probes page-realm isolation, and applies the responsiveness/CPU
recovery gates. The fixture's route pages are `metacritic-cft.html` and
`metacritic-cft-detail.html`; they contain no direct PageSession or provider
mock.

## Attach mode

To drive an already running dedicated Chrome for Testing profile, start it with
remote debugging enabled and then attach the runner:

```bash
"/path/to/Google Chrome for Testing" \
  --remote-debugging-port=9222 \
  --user-data-dir=/private/tmp/translight-cft-profile \
  --disable-extensions-except=/path/to/translight/dist \
  --load-extension=/path/to/translight/dist

npm run test:metacritic:chrome -- \
  --debugging-port=9222 \
  --profile-dir=/private/tmp/translight-cft-profile \
  --scenario=navigation --cycles=5
```

Attach mode uses the active tab in that profile, invokes the extension's
toolbar action path, and never kills the attached browser. Use a dedicated
profile; the runner may temporarily enable same-site continuation for the
navigation scenario and restores that setting afterward. Pass
`--browser-pid=<pid>` when CPU sampling is required in attach mode.

Launch results use the loaded extension build SHA as `testedCommit`; attach
results do not claim checkout verification when the loaded build is older,
dirty, or does not expose a SHA. The loaded build's `dirty` state and the
checkout's `checkoutDirty` state are recorded in the result artifact.

The attached browser must already have Translight loaded; use a
Translator-capable Chrome profile when the run requires real translation.
Performance validation records eight timer-driven samples at the 250 ms
interval before the scenario. After the scenario it keeps translation ON and
checks rolling eight-sample CPU windows for up to 10 seconds, stopping at the
first recovered window and recording `recoveryTimeMs`, before translation OFF,
trace/file cleanup, or other runner teardown. Recovery CDP pings and the page
Long Task probe are included in the responsiveness gate. If attach mode has no
`--browser-pid`, the run is explicitly a browser-flow smoke test and reports
`smokePassed` instead of claiming `testPassed`.

## Output and limitations

Results are written to `artifacts/metacritic-chrome/result.json` by default.
The dummy provider never calls the network or Chrome Translator API. It does
not validate Translator API availability, model download or preparation,
API-specific failures, or translation quality. The local fixture is
deterministic and does not replace validation on live sites.

It also fails if dummy mode is requested against a production build. Dummy
mode is therefore explicit both in the CLI and in the test-build marker.
