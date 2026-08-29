# AP News navigation

Fixture: ../fixtures/apnews-navigation-repro.html and
../fixtures/apnews-navigation-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/apnews-navigation-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied AP News header, whose top navigation is a
custom bsp-nav element rather than a native nav. SCIENCE and MORE must remain
original menu labels with no generated translation nodes, while the article
title and paragraph continue to translate.

The repaired case must report translationCount: 2,
navigationAfter.translationCount: 0, restoredAfterStop: true, and
testPassed: true.

## Cleanup and limitations

Stop the session and confirm the original navigation, title, and paragraph
content are restored. The local fixture covers the saved AP News structure.
