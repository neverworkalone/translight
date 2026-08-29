# Metacritic scroll and repeated back/forward regression

Fixture: ../fixtures/metacritic-scroll-navigation-repro.html and
../fixtures/metacritic-scroll-navigation-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/metacritic-scroll-navigation-repro.html
in Chrome.

## Scenario and expected result

This fixture follows the supplied live-site path: start translation through
the real content controller, scroll to Latest News and wait for its items,
return to the top, click the New and Notable Star Wars Zero Company link,
scroll the detail route to the bottom, then repeat browser back/forward cycles.
The page uses deeply nested cards so scroll reprioritization and controller
route messages exercise the same pending work as the Metacritic homepage.

It then stops and restarts translation three times through the same controller
and page-memory cache on the full homepage, covering the cold initial run and a
partial cache larger than the cache limit. A small, known working set on a
warm-cache-probe route repeats the same-controller OFF to ON cycle three times
with cache-only results. Each restored route must retain exactly one
translation per source, and stopping the session must clean up every generated
node.

The repaired case must report latestNewsTranslated >= 8,
interactionRectCalls <= 5000 for the supplied navigation path, no
disconnected renderer records, an empty queue after each route completes,
recoveryScanCalls === 0 for the simulated path, three full-home
restartSnapshots, and three warmCacheProbe.snapshots with cache hits and no
provider calls. The result must report testPassed: true with
restoredAfterStop: true. Each restart snapshot records the first host timer's
observed cache-hit count; it must stay within the queue's cache-result batch
budget. The phases report separates initial and post-prepare collection,
removeAll, cache-result application, and Long Task observations. testPassed
also applies response budgets of 250 ms for the first timer, each collection
phase, and each Long Task, 100 ms for removeAll, and 16 ms for one result
application; if Long Task entries are unsupported, that browser metric is
reported but not gated.

Add ?metrics=1 to inspect collect/mutation, prune/recovery-scan, queue-sort,
and record-lifetime counters. Add ?stacks=1 to attribute rectangle reads to
production call sites. Add &providerDelay=12 to keep retired route calls in
flight long enough to exercise the provider-overlap budget;
providerMaxActive must remain at most the queue concurrency budget.

## Cleanup and limitations

Stop the session after the route and restart probes and confirm every generated
node is removed. Use a real browser for route, scroll, and responsiveness
validation; the fixture is deterministic and does not replace a live-site run.
