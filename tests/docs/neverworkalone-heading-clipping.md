# Never Work Alone heading clipping reproduction

`tests/fixtures/neverworkalone-site/` is based on the saved homepage supplied in
`neverworkalone.zip`. It keeps the page's HTML, CSS, assets, and language
switcher. The saved extensionless Google Fonts stylesheet is served as
`fonts.css` so Vite provides its CSS MIME type. The other page changes add a
hidden report element and load a fixture module that selects Korean, starts
production `PageSession` with the screenshot's Korean translation, scrolls to
the bottom of the page, and records text geometry, clipping ancestors, and
overlap with nearby content for the two reported headings.

Run the saved page through the repository-managed Chrome for Testing runner:

```bash
npm run dev -- --host 127.0.0.1
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=fixture \
  --url=http://127.0.0.1:5173/tests/fixtures/neverworkalone-site/neverworkalone.html \
  --window-size=925,676 \
  --output-dir=/private/tmp/translight-issue59-before
```

The requested window size yields a 925×533 viewport in CFT, matching the issue
screenshot. The fixture report is written to `result.json` and the browser page
also exposes `window.__neverworkaloneIssue59Report`. The CFT runner verifies
that the fixture publishes a JSON report with a boolean `testPassed` value.
`testPassed` means at least one targeted translation rendered and none of the
rendered target translations were clipped or overlapped a peer. The fixture
also reports each overlap and `untranslatedTargets`; a missing translation
cannot establish a clipping or overlap result.
