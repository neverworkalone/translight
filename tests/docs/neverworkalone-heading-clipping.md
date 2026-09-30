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
`testPassed` requires both targeted headings to be translated and visible, with
no clipping or overlap. The fixture also reports each overlap and
`untranslatedTargets`; a missing translation cannot establish that the reported
clipping or overlap is fixed.
It also reports intersections between the browser's text-range line rectangles
separately from intersections with other page elements, so line geometry can be
compared with the actual CFT rendering.

On the latest CFT run, the About heading translated into two visible lines with
no clipping ancestor or overlapping peer. The hero heading remained untranslated
in the saved page, so its clipping could not be assessed and `testPassed` is
false. This run did not reproduce the reported clipping or overlap.
