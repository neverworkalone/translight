# XDA article translation font size

Fixture: ../fixtures/xda-translation-font-size-repro.html and
../fixtures/xda-translation-font-size-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/xda-translation-font-size-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied XDA article at
https://www.xda-developers.com/routers-channel-width-setting-sabotaging-gaming-fix-takes-seconds/.
The article container and its regular content wrapper use a 10px base size,
while article paragraphs use 18px text and 28.8px line height. The translation
is inserted as a sibling of each paragraph, so it must copy the source
paragraph's computed typography instead of inheriting the smaller wrapper values.

The repaired case must report equal sourceFontSize and translationFontSize,
equal sourceLineHeight and translationLineHeight, bodyTranslationCount: 2,
and testPassed: true.

## Cleanup and limitations

Stop the session and confirm the source page is restored. The fixture checks
computed typography in a real browser; it is not a live XDA run.
