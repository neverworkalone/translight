# Google search result translation placement

Fixture: ../fixtures/google-result-transform-repro.html and
../fixtures/google-result-transform-repro.js

## Run

Launch the fixture with the repository's Chrome for Testing runner:

```bash
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=navigation \
  --url=http://127.0.0.1:5173/tests/fixtures/google-result-transform-repro.html \
  --cycles=1 \
  --output-dir=/private/tmp/translight-google-result
```

The runner saves `failure.png` after its Metacritic-specific navigation check
finds no “Latest News” section. Inspect the fixture report in that screenshot;
the expected navigation error is only the point where the runner captures the
page.

The fixture uses the production `TranslationRenderer` with a Google-style
result link that reverses its flex column and targets its generated translation
with a rotation rule. The translation must remain upright and render below the
source title. The report should show `translationTransform: "none"`,
`translationTextTransform: "none"`, `translationBelowSource: true`, and
`testPassed: true`.

The live Google search URL challenged the CFT runner during reproduction, so
this fixture models the observed result card behavior and does not claim a live
Google-site pass.
