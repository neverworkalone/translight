# Google search result translation placement

Fixture: ../fixtures/google-result-transform-repro.html and
../fixtures/google-result-transform-repro.js

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

The runner reads the JSON report from the page and exits successfully only
when the browser assertions pass. On failure it writes `failure.png` alongside
the JSON report and trace.

The fixture starts the production `PageSession` against the captured result
DOM and CSS. Google applies `transform: scaleY(-1)` to `.V9tjod`,
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
