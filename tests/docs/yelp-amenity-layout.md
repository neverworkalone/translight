# Yelp amenity table-cell layout

Fixture: ../fixtures/yelp-amenity-layout-repro.html and
../fixtures/yelp-amenity-layout-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/yelp-amenity-layout-repro.html
in Chrome.

## Scenario and expected result

This fixture models the Amenities and More section from the supplied Yelp page
at https://www.yelp.com/biz/dandelion-chocolate-san-francisco-12. Yelp uses
table/table-cell arrangement elements inside a wrapping two-column layout. Each
amenity translation must remain inside its existing CSS table cell; inserting a
block sibling creates an anonymous table cell, narrows the source, and causes
translated labels to reflow or appear vertically.

The repaired case must report placement:
[inside, inside, inside, inside], amenityTranslationCount: 4,
allAmenitiesInsideSource: true, layoutStableAcrossSnapshots: true,
layoutStabilityFailures: [], restoredAfterStop: true, and testPassed: true.
The layout check captures the baseline before translation and compares each
incremental and final snapshot within a 1px tolerance for source, item, and
wrapper positions and widths, plus the existing table child count.

## Cleanup and limitations

Stop the session and confirm the original table structure and geometry are
restored. The local fixture does not replace validation on the live Yelp page.
