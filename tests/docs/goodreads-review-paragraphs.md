# Goodreads review paragraph placement

Fixture: ../fixtures/goodreads-review-paragraphs-repro.html and
../fixtures/goodreads-review-paragraphs-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/goodreads-review-paragraphs-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Goodreads book page at
https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow. Goodreads
renders a review as one formatted inline span and uses consecutive br elements
for blank-line paragraph boundaries. The collector must split those paragraphs
and place each translation directly after its own paragraph.

The repaired case must report segmentCount: 3, translationCount: 3,
translationsInsideReview: true, interleaved: true, testPassed: true, and
restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm that the review markup is restored. The fixture
models the supplied page and is not a live-site test.
