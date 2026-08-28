# Browser regression fixtures

Browser-only reproduction steps live in this directory instead of the project
README. Each fixture should keep its page and runner together, and each new bug
should add a short section here with the URL, setup, scenarios, and expected
result.

## Guardian card translation placement

Fixture: `guardian-translation-placement-repro.html` and
`guardian-translation-placement-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/guardian-translation-placement-repro.html
```

This fixture models the supplied Guardian front page at
`https://www.theguardian.com/international`. Guardian story cards can render a
category as a block child before the headline text inside the same heading.
The headline translation must stay after the original headline, while the
category remains before the headline.

The repaired case must report `translationAfterOriginal: true`,
`categoryStillBeforeHeadline: true`, `translationCount: 2`,
`testPassed: true`, and `restoredAfterStop: true`.

## Booking property description paragraphs

Fixture: `booking-property-paragraphs-repro.html` and
`booking-property-paragraphs-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/booking-property-paragraphs-repro.html
```

This fixture models the supplied Booking.com property page at
`file:///Users/genonfire/Downloads/booking.html`. Booking renders the four
property-description paragraphs inside one `<p>` with `white-space: pre-wrap`;
each paragraph starts with an inline `<b>` label and is separated by literal
blank-line text. The collector must keep each label with its paragraph and the
session must place one translation after each source paragraph.

The repaired case must report `segmentCount: 4`, `translationCount: 4`,
`translationsInsideDescription: true`, `interleaved: true`,
`testPassed: true`, and `restoredAfterStop: true`.

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

## Goodreads review paragraph placement

Fixture: `goodreads-review-paragraphs-repro.html` and
`goodreads-review-paragraphs-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/goodreads-review-paragraphs-repro.html
```

This fixture models the supplied Goodreads book page at
`https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow`. Goodreads
renders a review as one formatted inline span and uses consecutive `<br>`
elements for blank-line paragraph boundaries. The collector must split those
paragraphs and place each translation directly after its own paragraph.

The repaired case must report `segmentCount: 3`, `translationCount: 3`,
`translationsInsideReview: true`, `interleaved: true`, `testPassed: true`,
and `restoredAfterStop: true`.

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

## Goodreads review order consistency

Fixture: `goodreads-review-order-repro.html` and
`goodreads-review-order-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/goodreads-review-order-repro.html
```

This fixture models the supplied Goodreads book page at
`https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow`. The Chai
review contains ordinary paragraphs separated by `<br><br>`, a direct nested
blockquote, and a blockquote containing a `div` inside Goodreads's formatted
inline wrapper. The Bill Gates review uses only inline content. The collector
must split Chai into ten independently translatable blocks instead of
aggregating the ordinary paragraphs below the review, and both cards must keep
the same configured source/translation order.

The repaired case must report `chai.reviewTranslationCount: 10`,
`chai.hasAggregatedTranslation: false`, `ordered: true` for both cards in both
modes, `restoredAfterStop: true`, and top-level `testPassed: true`.

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

## Reuters article translation layout

Fixture: `reuters-article-layout-repro.html` and
`reuters-article-layout-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/reuters-article-layout-repro.html
```

To exercise a resize while the translation session remains active, use the
resize scenario:

```text
http://127.0.0.1:5173/tests/fixtures/reuters-article-layout-repro.html?scenario=resize
```

Open it at a desktop width such as 1200px, then resize the same window to
1000px without reloading. The report keeps each measurement in
`resizeSamples` and must continue to show matching source and translation
horizontal bounds.

This fixture models the supplied Reuters article body, where premium article
paragraphs are centered at a fixed desktop width. The translation is inserted
as a sibling, so it must preserve the source paragraph's horizontal bounds
instead of expanding to the full article container. The same bounds must stay
aligned after a resize within the desktop breakpoint and after the viewport
crosses the mobile breakpoint.

The repaired cleanup case must report equal `sourceLayout` and
`translationLayout`, `translationCount: 2`, `restoredAfterStop: true`, and
`testPassed: true`. The resize scenario must additionally report at least one
aligned entry in `resizeSamples` and keep `testPassed: true` while the session
is active.

## Letterboxd article caption and logo

Fixture: `letterboxd-article-caption-repro.html` and
`letterboxd-article-caption-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/letterboxd-article-caption-repro.html
```

This fixture models the supplied Letterboxd journal page. The hero image
caption contains links to the featured films and must still be collected as
article prose, while the `site-logo` image-replacement text must remain
untouched so its fixed header box does not expand.

The repaired case must report `captionTranslationCount: 1`,
`logoTranslationCount: 0`, `translationCount: 2`, matching logo and caption
layouts before and after translation, `restoredAfterStop: true`, and
`testPassed: true`.

## AP News navigation

Fixture: `apnews-navigation-repro.html` and
`apnews-navigation-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/apnews-navigation-repro.html
```

This fixture models the supplied AP News header, whose top navigation is a
custom `bsp-nav` element rather than a native `nav`. `SCIENCE` and `MORE` must
remain original menu labels with no generated translation nodes, while the
article title and paragraph continue to translate.

The repaired case must report `translationCount: 2`,
`navigationAfter.translationCount: 0`, `restoredAfterStop: true`, and
`testPassed: true`.

## AP News live-page compact layout

Fixture: `apnews-live-layout-repro.html` and
`apnews-live-layout-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/apnews-live-layout-repro.html
```

This fixture models the supplied AP News live page's trending links, live
controls, article lead, and side rail using the saved page's nested
`PageListTrending`/`bsp-custom-headline` and `LiveBlogPage` DOM/CSS. The upper
panel keeps the legacy child-placement state from the attached snapshot so the
vertical failure remains visible; the lower panel runs the current renderer on
the same layout. The repaired case must report a vertical legacy probe, stable
source rectangles, horizontal non-overlapping translations,
`translationCount: 11`, a stable live/tabs grid relationship, and no overlap
between the anchored label and the following article content,
`restoredAfterStop: true`, and `testPassed: true`.

## Generic grid layout safety

Fixture: `grid-layout-safety-repro.html` and `grid-layout-safety-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/grid-layout-safety-repro.html
```

This fixture covers the generic cases that must not use the AP single-row
anchored placement: a two-row grid and a flex source with `overflow:hidden`.
Unsafe translations are placed outside the grid so existing host items keep
their positions. It also covers the translation-only fallback for a safe
single-row grid source and a one-row-to-two-row responsive transition. The
repaired case must report external placement without overlap/clipping or host
layout movement for the unsafe cases, visible anchored fallback text with the
source hidden, a safe re-evaluation after the responsive transition, and
`restoredAfterStop: true` with `testPassed: true`.

## YouTube long description paragraph placement

Fixture: `youtube-description-paragraphs-repro.html` and
`youtube-description-paragraphs-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/youtube-description-paragraphs-repro.html
```

This fixture models the supplied YouTube video at
`https://www.youtube.com/watch?v=h9QaF2X74H0`. YouTube renders the expanded
description inside `#expanded > yt-attributed-string` as nested inline spans;
paragraphs are separated by blank lines in a text node rather than by `<p>` or
`<br>` elements. Each generated translation must follow its own source
paragraph instead of being inserted once after the entire description.

The repaired case must report `translationCount: 3`, `interleaved: true`,
`testPassed: true`, and `restoredAfterStop: true`.

## YouTube comment translation placement

Fixture: `youtube-comment-placement-repro.html` and
`youtube-comment-placement-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/youtube-comment-placement-repro.html
```

The fixture models the supplied YouTube video at
`https://www.youtube.com/watch?v=lzopkfaUcKs`. YouTube places a hidden
`yt-pdg-comment-chip-renderer` inside the comment body before the visible
`yt-attributed-string` comment text, while the visible text wrapper can use a
larger font than its parent block. The hidden chip must not make the comment
look like a mixed block; the generated translation must follow the original
comment and match the visible text wrapper typography.

The repaired case must report `translationCount: 1`,
`translationAfterOriginal: true`, matching source/translation font and line
height values, `testPassed: true`, and `restoredAfterStop: true`.

## Amazon collapsed review translation visibility

Fixture: `amazon-review-visibility-repro.html` and
`amazon-review-visibility-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/amazon-review-visibility-repro.html
```

The fixture models the supplied Amazon page at
`https://www.amazon.com/clp/B0CWGSG7X2`. Amazon renders a review body inside a
collapsed `data-a-card-type="basic"` card with `overflow: hidden`; the saved
page shows that the translation node is created after the review paragraph,
but it is clipped inside this card. The generated translation must be placed
after the collapsed card so it remains visible below the original review.

The repaired case must report `translationCount: 1`,
`translationOutsideCollapsedCard: true`, `translationBelowCard: true`,
`testPassed: true`, and `restoredAfterStop: true`.

## YouTube collector mutation performance

Fixture: `youtube-collector-mutation-repro.html` and
`youtube-collector-mutation-repro.js`

Open this URL in Chrome while the Vite development server is running:

```text
http://127.0.0.1:5173/tests/fixtures/youtube-collector-mutation-repro.html
```

The fixture models the initial YouTube comment and description collection,
then appends one description paragraph and one comment after the first
translation pass. The collector must translate only the two initial blocks and
the two newly added blocks, without repeatedly traversing the whole page.

The repaired case must report `initialTranslationCount: 2`,
`mutationTranslationCount: 4`, `testPassed: true`, and
`restoredAfterStop: true`.

When adding another browser regression, use a descriptive `<bug-name>-repro`
fixture name and document its reproducible URL and pass/fail signal in this
file.
