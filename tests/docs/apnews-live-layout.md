# AP News live-page compact layout

Fixture: ../fixtures/apnews-live-layout-repro.html and
../fixtures/apnews-live-layout-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/apnews-live-layout-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied AP News live page's trending links, live
controls, article lead, and side rail using the saved page's nested
PageListTrending, bsp-custom-headline, and LiveBlogPage DOM and CSS. The upper
panel keeps the legacy child-placement state from the attached snapshot so the
vertical failure remains visible; the lower panel runs the current renderer on
the same layout.

The repaired case must report a vertical legacy probe, stable source
rectangles, horizontal non-overlapping translations, translationCount: 11, a
stable live/tabs grid relationship, no overlap between the anchored label and
the following article content, restoredAfterStop: true, and testPassed: true.

## Cleanup and limitations

Stop the session and confirm that generated nodes and layout changes are
removed. Geometry and overlap checks require a real browser; this fixture does
not replace live AP News validation.
