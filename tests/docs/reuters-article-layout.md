# Reuters article translation layout

Fixture: ../fixtures/reuters-article-layout-repro.html and
../fixtures/reuters-article-layout-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/reuters-article-layout-repro.html
in Chrome. To exercise a resize while the translation session remains active,
use the resize scenario:

http://127.0.0.1:5173/tests/fixtures/reuters-article-layout-repro.html?scenario=resize

Open it at a desktop width such as 1200px, then resize the same window to
1000px without reloading.

## Scenario and expected result

This fixture models the supplied Reuters article body, where premium article
paragraphs are centered at a fixed desktop width. The translation is inserted
as a sibling, so it must preserve the source paragraph's horizontal bounds
instead of expanding to the full article container. The same bounds must stay
aligned after a resize within the desktop breakpoint and after the viewport
crosses the mobile breakpoint. The report keeps each measurement in
resizeSamples.

The cleanup case must report equal sourceLayout and translationLayout,
translationCount: 2, restoredAfterStop: true, and testPassed: true. The resize
scenario must additionally report at least one aligned entry in resizeSamples
and keep testPassed: true while the session is active.

## Cleanup and limitations

Stop the session after each scenario and confirm the original layout is
restored. Use a real browser for resize and geometry validation; the fixture
does not replace a live Reuters check.
