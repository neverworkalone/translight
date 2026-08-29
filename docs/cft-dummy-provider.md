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

The CFT runner records the provider type/profile/delay, extension manifest
version and build identifier, the tested commit, and geometry-check results in
`artifacts/metacritic-chrome/result.json`. It fails if dummy mode is requested
against a production build. `--skip-build` is supported only when the already
loaded extension is the intended build.

Known limitation: CFT and the real Translator API require a supported local
browser binary/profile. If no extension-capable Chromium binary is installed,
the browser command is reported as `validation blocked`; unit/build checks do
not replace that browser validation.
