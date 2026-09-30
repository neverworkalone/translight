# Never Work Alone heading clipping reproduction

`tests/fixtures/neverworkalone-site/` is based on the saved homepage supplied in
`neverworkalone.zip`. It keeps the page's HTML, CSS, assets, and language
switcher. The saved extensionless Google Fonts stylesheet is served as
`fonts.css` so Vite provides its CSS MIME type. The other page changes add a
hidden report element and load a fixture module that selects English as in
issue #59, starts production `PageSession` with deterministic Korean outputs,
scrolls to the bottom of the page instantly despite the saved site's smooth
scroll rule, and records whether both reported headings were translated,
visible, clipped, or overlapped nearby content. Add `?language=ko` to the fixture
URL to reproduce the Korean page state in the supplied screenshot; this case
measures the About heading.

Run the saved page through the repository-managed Chrome for Testing runner:

```bash
npm run dev -- --host 127.0.0.1
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=fixture \
  --url=http://127.0.0.1:5173/tests/fixtures/neverworkalone-site/neverworkalone.html \
  --window-size=1416,1031 \
  --output-dir=/private/tmp/translight-issue59-screenshot-repro
```

The requested window size yields a 1416×888 viewport in CFT, matching the
supplied screenshot's page scale. The fixture report is written to `result.json`
and the browser page also exposes `window.__neverworkaloneIssue59Report`. The
CFT runner verifies that the fixture publishes a JSON report with a boolean
`testPassed` value.
`testPassed` requires both reported headings to be translated from their
expected source text and visible, with no clipping, overlap with nearby page
content, or overlap between the painted highlight fragments on wrapped lines.
The fixture reports `untranslatedTargets` and source mismatches so a missing or
malformed source cannot establish that clipping is fixed.

The English issue route switches the saved page to English and targets both
reported headings. The fixture keeps the page's original `<br>` in the hero
heading and verifies that production collection preserves its word boundary.
The Korean screenshot route remains available with `?language=ko`; it measures
the About heading and previously reproduced a 26.8px intersection between
wrapped highlight fragments. The English route is the required regression for
the reported path and both routes measure clipping and overlap separately.
