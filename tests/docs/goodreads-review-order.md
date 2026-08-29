# Goodreads review order consistency

Fixture: ../fixtures/goodreads-review-order-repro.html and
../fixtures/goodreads-review-order-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/goodreads-review-order-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Goodreads book page at
https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow. The Chai
review contains ordinary paragraphs separated by br br, a direct nested
blockquote, and a blockquote containing a div inside Goodreads's formatted
inline wrapper. The Bill Gates review uses only inline content. The collector
must split Chai into ten independently translatable blocks instead of
aggregating the ordinary paragraphs below the review, and both cards must keep
the same configured source/translation order.

The repaired case must report chai.reviewTranslationCount: 10,
chai.hasAggregatedTranslation: false, ordered: true for both cards in both
modes, restoredAfterStop: true, and top-level testPassed: true.

## Cleanup and limitations

Run both configured modes, stop each session, and confirm all generated nodes
are removed. The local fixture models the saved page structure.
