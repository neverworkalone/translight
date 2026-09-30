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

The fixture uses the production `TranslationRenderer` with the result DOM and
CSS captured in the supplied Google search page. In particular, Google applies
`transform: scaleY(-1)` to `.V9tjod`, `.V9tjod .LC20lb`, and
`.V9tjod .ESMNde`. The generated translation is placed next to the title inside
that transformed ancestor, so it must cancel the ancestor flip and use the
opposite DOM order to appear upright below the title. The fixture does not
select the generated Translight element in its host CSS.

The report records the matched Google CSS rules, transforms along the source
and translation ancestor paths, vertical-flip parity, placement, and Chrome
bounding rectangles. A pass requires both text paths to have even vertical
flip parity and the translation rectangle to start below the source rectangle.

The live Google search URL challenged the CFT runner during reproduction, so
this fixture models the observed result card behavior and does not claim a live
Google-site pass.
