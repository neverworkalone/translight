# Amazon collapsed review translation visibility

Fixture: ../fixtures/amazon-review-visibility-repro.html and
../fixtures/amazon-review-visibility-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/amazon-review-visibility-repro.html
in Chrome.

## Scenario and expected result

The fixture models the supplied Amazon page at
https://www.amazon.com/clp/B0CWGSG7X2. Amazon renders a review body inside a
collapsed data-a-card-type basic card with overflow hidden. The saved page
shows that the translation node is created after the review paragraph but is
clipped inside this card. The generated translation must be placed after the
collapsed card so it remains visible below the original review.

The repaired case must report translationCount: 1,
translationOutsideCollapsedCard: true, translationBelowCard: true,
testPassed: true, and restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm that the original collapsed card is restored.
Visibility and clipping checks require a real browser; the fixture is not a
live Amazon test.
