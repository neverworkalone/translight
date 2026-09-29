# Never Work Alone heading clipping reproduction

This CFT fixture copies the current live site's hero and About layout rules for
the two phrases shown in the issue screenshot. It marks the hero title as
English so the production `PageSession` collects the line-break title, then
starts a deterministic Korean provider and records the generated text
rectangles and any clipping ancestor. The live site currently leaves that
heading's `lang` attribute unset, so the fixture isolates rendering from the
separate language-admission heuristic.

Run the fixture through the repository-managed Chrome for Testing runner:

```bash
npm run dev -- --host 127.0.0.1
npm run test:metacritic:chrome -- \
  --skip-translation \
  --scenario=navigation \
  --url=http://127.0.0.1:5173/tests/fixtures/neverworkalone-heading-clipping-repro.html \
  --window-size=925,676 \
  --output-dir=/private/tmp/translight-issue59-before
```

The 925×676 window gives the CFT page a 925×533 viewport, matching the issue
screenshot. `--window-size` applies to launched browsers; attach mode keeps the
attached browser's existing size.

The runner's navigation checks expect the Metacritic fixture and therefore
exit when this local page has no `Star Wars Zero Company` link. Its CFT
`failure.png` is still a browser rendering capture of the fixture. The issue
reproduction is visible in the page, with geometry recorded in
`window.__neverworkaloneIssue59Report`. The report panel is hidden at the
issue's viewport width so it does not cover the text being checked.
