# Browser regression fixtures

Browser-only reproduction steps live in this directory instead of the project
README. Each fixture should keep its page and runner together, and each new bug
should add a short section here with the URL, setup, scenarios, and expected
result.

## IMDb native scroll-anchor observation

Fixture: `imdb-jitter-repro.html` and `imdb-jitter-repro.js`

Start the Vite development server from the repository root:

```bash
npm run dev
```

Open this URL in Chrome:

```text
http://127.0.0.1:5173/tests/fixtures/imdb-jitter-repro.html?scenario=recovery&top=3100
```

The fixture simulates an IMDb-style long page where the host briefly displays a
generated translation and removes it during the next reconciliation. It samples
`scrollY` while the session translates the page and reports the result in the
fixed panel. The renderer keeps the document's native scroll anchoring enabled;
only generated translation nodes opt out of anchoring. This fixture is an
observation of the browser's native compensation during generic content churn;
`jitterDetected` is diagnostic and can be true by design. The configuration
check must report:

```json
{
  "rootOverflowAnchor": "auto",
  "testPassed": true
}
```

## IMDb left-column Awards jitter

Fixture: `imdb-left-jitter-repro.html` and `imdb-left-jitter-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/imdb-left-jitter-repro.html?scenario=rerender&top=600
```

This fixture models the Awards card DOM from the supplied IMDb snapshot at
`https://www.imdb.com/name/nm0005370/`. The supplied recording uses another
IMDb profile, `https://www.imdb.com/name/nm1296883/?ref_=hm_mpc_rnk_2`, but both
pages use the same inline-list Awards pattern. During the run, the host
replaces the inner `#award-content` markup six times, matching the
reconciliation that caused the left card to oscillate.

The repaired case must report `cardHeight.distinctHeights: [49]`,
`stablePlacement: true`, and `testPassed: true`. Before the fix, the same
scenario reported alternating card heights `[49, 95]` and kept the generated
translation inside the replaceable card.

When adding another browser regression, use a descriptive `<bug-name>-repro`
fixture name and document its reproducible URL and pass/fail signal in this
file.
