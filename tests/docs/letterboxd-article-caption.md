# Letterboxd article caption and logo

Fixture: ../fixtures/letterboxd-article-caption-repro.html and
../fixtures/letterboxd-article-caption-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/letterboxd-article-caption-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Letterboxd journal page. The hero image
caption contains links to the featured films and must still be collected as
article prose, while the site-logo image-replacement text must remain
untouched so its fixed header box does not expand.

The repaired case must report captionTranslationCount: 1,
logoTranslationCount: 0, translationCount: 2, matching logo and caption
layouts before and after translation, restoredAfterStop: true, and
testPassed: true.

## Cleanup and limitations

Stop the session and confirm that the original caption and logo layout are
restored. The fixture models the supplied page rather than testing the live
Letterboxd site.
