# Booking property description paragraphs

Fixture: ../fixtures/booking-property-paragraphs-repro.html and
../fixtures/booking-property-paragraphs-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/booking-property-paragraphs-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Booking.com property page at
file:///Users/genonfire/Downloads/booking.html. Booking renders four
property-description paragraphs inside one p element with white-space:
pre-wrap. Each paragraph starts with an inline b label and is separated by
literal blank-line text. The collector must keep each label with its paragraph
and the session must place one translation after each source paragraph.

The repaired case must report segmentCount: 4, translationCount: 4,
translationsInsideDescription: true, interleaved: true, testPassed: true, and
restoredAfterStop: true.

## Cleanup and limitations

Stop the translation session and confirm that the original description markup
is restored. The local fixture stands in for the supplied saved page.
