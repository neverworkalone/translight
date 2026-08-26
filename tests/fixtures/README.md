# Browser regression fixtures

Browser-only reproduction steps live in this directory instead of the project
README. Each fixture should keep its page and runner together, and each new bug
should add a short section here with the URL, setup, scenarios, and expected
result.

## IMDb scroll jitter

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
fixed panel. The repaired case must report:

```json
{
  "activeOverflowAnchor": "none",
  "jitterDetected": false,
  "testPassed": true
}
```

To verify the regression signal, use `scenario=legacy`; this removes the
scroll-anchor guard and should report `jitterDetected: true` and
`testPassed: true`.

When adding another browser regression, use a descriptive `<bug-name>-repro`
fixture name and document its reproducible URL and pass/fail signal in this
file.
