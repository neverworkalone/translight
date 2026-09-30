# Google search result translation placement

Fixtures:

- `../fixtures/google-result-transform-repro.html` checks the result title's
  translation placement and the displayed URL.
- `../fixtures/google-url-translation-repro.html` reproduces issue #62 from the
  supplied Google screenshot: the result title and `.notranslate` URL display
  are English-scoped, URL-like strings and must not be translated.

## Run

Start Vite in one terminal:

```bash
npm run dev -- --host 127.0.0.1
```

Then launch the fixture with the repository's Chrome for Testing runner:

```bash
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=fixture \
  --url=http://127.0.0.1:5173/tests/fixtures/google-result-transform-repro.html \
  --output-dir=/private/tmp/translight-google-result
```

Run the issue #62 case with the same runner and a separate output directory:

```bash
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=fixture \
  --url=http://127.0.0.1:5173/tests/fixtures/google-url-translation-repro.html \
  --output-dir=/private/tmp/translight-google-url-translation
```

The issue fixture starts the production `PageSession` with deterministic
translations that reproduce the duplicate strings in the supplied screenshot.
Before the fix it should fail because the domain title and the URL marked
`.notranslate` are collected and sent to the provider. After the fix it should
pass with neither URL-like source translated, while the ordinary English
sentence in the first fixture remains translatable.

The runner reads the JSON report from the page and exits successfully only
when the browser assertions pass. On failure it writes `failure.png` alongside
the JSON report and trace.

The placement fixture starts the production `PageSession` against the captured
result DOM and CSS. Google applies `transform: scaleY(-1)` to `.V9tjod`,
`.V9tjod .LC20lb`, and `.V9tjod .ESMNde`. The fixture records all collected
sources and provider inputs, the displayed URL text and link target, the URL
element's translation record, and the title translation's position relative to
the displayed URL. This also checks whether a Google URL is accidentally sent
to the translation provider.

The report records the matched Google CSS rules, transforms along the source
and translation ancestor paths, vertical-flip parity, placement, URL text and
target preservation, URL collection, overlap, and Chrome bounding rectangles.
A pass requires the URL to remain unchanged and uncollected, the translation
not to overlap it, both text paths to have even vertical-flip parity, and the
translation rectangle to start below the source title.

The live Google search URL challenged the CFT runner during reproduction, so
this fixture models the observed result card behavior and does not claim a live
Google-site pass.
