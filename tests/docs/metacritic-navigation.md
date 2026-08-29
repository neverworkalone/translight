# Metacritic repeated navigation regression

Fixture: ../fixtures/metacritic-navigation-repro.html and
../fixtures/metacritic-navigation-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/metacritic-navigation-repro.html
in Chrome.

## Scenario and expected result

This fixture replaces a deeply nested Metacritic-style card page eight times,
matching repeated link and back/forward route changes in one live session. Each
route must end with exactly one translation per source block, and stopping the
session must remove every generated node. The settle window must not rescan the
same unchanged route repeatedly.

The repaired case must report testPassed: true, restoredAfterStop: true, and
collectCalls <= 18.

## Cleanup and limitations

Stop the session after the repeated route sequence and confirm all generated
nodes are removed. The fixture models the route behavior and does not replace
a live Metacritic navigation run.
