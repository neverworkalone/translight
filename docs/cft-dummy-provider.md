# CFT dummy-provider validation

## Modes

| Mode | Build | Provider | What it proves |
| --- | --- | --- | --- |
| CFT dummy | `npm run build:test` | deterministic local dummy | packaged action-to-renderer workflow, mutation discovery, layout/lifecycle cleanup, navigation/Back, and responsiveness |
| Translator API | `npm run build` | Chrome Translator API | API availability, model preparation/download, API errors, and real translation behavior |

The dummy provider never calls the network or Chrome Translator API. Its
`normal` profile returns `ko:<source>` and its `expanded` profile pads output to
approximately 1.4× the source length. Translation resolves after a configurable
delay (69 ms by default, based on a 68.82 ms Chrome Translator API sample
average), and abort/close cancels pending delivery.

## Commands

```bash
npm run check
npm run build:test
npm run test:metacritic:chrome -- \
  --provider=dummy \
  --dummy-profile=normal \
  --dummy-delay-ms=69 \
  --scenario=navigation \
  --chrome=/path/to/Chrome\ for\ Testing
```

The Vite build embeds the current git HEAD SHA and clean/dirty state in
`BUILD_INFO`. The dirty state comes from Git porcelain status with ignored files
excluded, so tracked changes and non-ignored untracked build inputs cannot be
mistaken for a clean commit. The CFT runner records the provider
type/profile/delay, extension manifest version and build identifier, the loaded
build SHA/dirty state, the checkout state, the tested commit, and
geometry-check results in `artifacts/metacritic-chrome/result.json`. In local
launch mode it fails before the scenario when the loaded bundle is stale,
dirty, or does not report a valid SHA, or when the checkout is dirty; this also
protects `--skip-build`. Attach mode preserves the real-provider path and
reports the loaded SHA separately, without claiming it matches or verifies the
current checkout.

It also fails if dummy mode is requested against a production build. Dummy
mode is therefore explicit both in the CLI and in the test-build marker.

Known limitation: CFT and the real Translator API require a supported local
browser binary/profile. If no extension-capable Chromium binary is installed,
the browser command is reported as `validation blocked`; unit/build checks do
not replace that browser validation.
