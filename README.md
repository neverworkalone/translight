# Translight · 빛번역

A Chrome extension for translating English webpages into Korean with Chrome's built-in Translator API while preserving the original text.

## Features

- Translate English webpages into Korean with Chrome's built-in Translator API
- Start, cancel, and stop translation from the toolbar
- Choose original + translation, translation + original, or translation-only display
- Translate page titles, paragraphs, lists, quotes, captions, and table cells
- Detect English content blocks even when a site's UI language is Korean
- Prioritize visible content on long pages and handle dynamically changing pages
- Continue manual translation across same-origin navigation
- Automatically translate registered hostnames
- Customize 10 translation display styles, colors, bold, and italic text
- View translation model status and download progress
- Export, import, and reset settings
- Skip translation when a page is already in the target language
- Leave code, preformatted text, and form controls unchanged
- Remove only the nodes, attributes, and styles added by Translight when translation is stopped

## Install

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/translight-·-빛번역/jhlbnaobbadaagnonlaklpelbaakidll).

## Help

See the [Help page](https://neverworkalone.github.io/translight/) for setup instructions and usage details.

## Tech Stack

- Vue 3
- Vite
- Chrome Extension Manifest V3
- Chrome built-in Translator API

## Development

### Install dependencies

```bash
npm install
```

### Build the extension

```bash
npm run build
```

### Run CFT regression tests without the Translator model

Build the dedicated test extension and run the packaged-extension navigation
scenario in Chrome for Testing:

```bash
npm run build:test
npm run test:metacritic:chrome -- \
  --provider=dummy \
  --dummy-profile=normal \
  --dummy-delay-ms=69 \
  --scenario=navigation
```

The runner also invokes `npm run build:test` automatically unless
`--skip-build` is supplied. It verifies the loaded service worker's test-build
marker before enabling the dummy provider. Local commit verification also
requires both the loaded bundle and the current checkout to be clean; tracked
changes and non-ignored untracked inputs block the run, while ignored build
artifacts do not. Use `--dummy-profile=expanded` to exercise wrapping and
overflow with deterministic output, and pass
`--chrome=/path/to/Chrome for Testing` when the binary is not in the default
locations. Results are written to `artifacts/metacritic-chrome/result.json`.

The dummy mode exercises extension action/background/content/`PageSession`/
queue/provider/renderer, mutation discovery, navigation and Back, OFF → ON,
cleanup, baseline geometry checks during incremental rendering, and
responsiveness. It does not test Translator API availability, model
preparation/download, API errors, or translation quality.

For Translator API validation, keep the real provider path:

```bash
npm run build
npm run test:metacritic:chrome -- \
  --provider=real \
  --scenario=gallery \
  --chrome=/path/to/attached-or-test-Chromium
```

An attached browser may be used with `--debugging-port`, `--profile-dir`, and
`--browser-pid` according to the runner help. Dummy selection is rejected by a
production build, is not a setting or options-page feature, and has no page
`postMessage` or query-parameter activation path.

### Run tests and checks

```bash
npm run check
```

### Create a release package

```bash
npm run package
```

### For a readable debug package without JavaScript or CSS minification:

```bash
./pack.sh
```


### Run the development server

```bash
npm run dev
```

The Translator API and its language model run in Chrome's supported desktop environments. The first translation may require downloading the on-device model. Translight does not send page content to an external translation server.
