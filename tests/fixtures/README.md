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

## Craigslist posting-body translation

Fixture: `craigslist-body-translation-repro.html` and
`craigslist-body-translation-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/craigslist-body-translation-repro.html
```

The fixture models the supplied Craigslist page at
`https://www.craigslist.org/view/d/play-organised-soccer-fooball-in-seoul/hfuqhkJcBAZYkn7k6SwE55`.
Its posting body is a semantic `section#postingbody` whose English paragraphs
are direct text nodes separated by `<br>` elements, with a hidden print-only
`div` before them. The collector must split the three visible paragraphs and
place all three generated translations inside `#postingbody`.

The repaired case must report `sourceSegmentCount: 3`,
`bodyTranslationCount: 3`, `rootOverflowAnchor: "auto"`, and
`testPassed: true`.

## XDA article translation font size

Fixture: `xda-translation-font-size-repro.html` and
`xda-translation-font-size-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/xda-translation-font-size-repro.html
```

This fixture models the supplied XDA article at
`https://www.xda-developers.com/routers-channel-width-setting-sabotaging-gaming-fix-takes-seconds/`.
The article container and its regular content wrapper use a `10px` base size,
while the article paragraphs use `18px` text and `28.8px` line height. The
translation is inserted as a sibling of each paragraph, so it must copy the
source paragraph's computed typography instead of inheriting the smaller
wrapper values.

The repaired case must report equal `sourceFontSize` and `translationFontSize`,
equal `sourceLineHeight` and `translationLineHeight`,
`bodyTranslationCount: 2`, and `testPassed: true`.

When adding another browser regression, use a descriptive `<bug-name>-repro`
fixture name and document its reproducible URL and pass/fail signal in this
file.
