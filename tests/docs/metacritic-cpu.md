# Metacritic translation CPU regression

Fixture: ../fixtures/metacritic-cpu-repro.html and
../fixtures/metacritic-cpu-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/metacritic-cpu-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Metacritic homepage at
https://www.metacritic.com/. Many deeply nested card wrappers contain English
headings, descriptions, and tags, and the source elements are laid out in flex
containers like the live page. The session must not rescan every translation
record in response to its own generated-node insertions, and it must not move a
translation that is already in its requested position.

The repaired case must report recoverySchedules: 0,
translationCount: 376, testPassed: true, and restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm all generated nodes are removed. The fixture
provides deterministic regression counts; use CFT for browser CPU and
responsiveness validation.
