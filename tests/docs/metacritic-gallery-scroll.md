# Metacritic gallery scroll-state translation stability

Fixture: ../fixtures/metacritic-gallery-scroll-repro.html and
../fixtures/metacritic-gallery-scroll-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/metacritic-gallery-scroll-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Metacritic article at
https://www.metacritic.com/pictures/august-september-2026-game-preview-wolverine-silent-hill-townfall-control-resonant/5.
The page keeps 22 gallery items in one document and updates
/pictures/slug/item with history.replaceState as the scroll position changes,
matching the live page's scroll spy. The controller must treat those URLs as
presentation state: it must keep one queue and the translated article
paragraphs connected while the gallery URL changes.

The repaired case must report galleryUrlChanges > 0,
contentRouteMessages: 0, sessionRouteChanges: 0, controllerRouteGeneration: 0,
minimumTranslatedParagraphs === sourceParagraphs,
translationContentsMatch: true, and testPassed: true with
restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm the translated article and all generated nodes are
removed. The local fixture models the live gallery's route behavior and does
not replace validation on the live Metacritic article.
