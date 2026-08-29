# Test documentation

This directory contains maintainer-facing documentation for browser regression
fixtures, Chrome for Testing (CFT) runs, and recorded validation results. It is
part of the test suite, not the user help site.

## Scope

- Keep reproducible browser-test instructions close to the fixtures they cover.
- Record the observable pass/fail signal for each regression case.
- Keep CFT runner behavior, test-build requirements, and validation reports
  here.
- Keep end-user setup and product usage documentation under `docs/`.

## Layout

- `tests/docs/README.md` — this index and the documentation rules.
- `tests/docs/cft-runner.md` — common CFT runner setup and modes.
- `tests/docs/<case-name>.md` — one document for each browser regression case.
- `tests/docs/*-validation.md` — dated validation reports and their artifacts.
- `tests/fixtures/` — fixture pages, runners, and unit tests.

Each browser regression document should have a matching fixture or runner in
`tests/fixtures/`. Use the same descriptive case name where practical. A
fixture-specific document links to its fixture files with paths relative to
this directory, for example `../fixtures/example-repro.html`.

## Documentation rules

1. Add one Markdown file per browser regression testcase. Do not append another
   long testcase section to `tests/fixtures/README.md`.
2. Name the document after the fixture or runner, without the `-repro` suffix
   when that makes the title easier to read.
3. Keep the fixture page and browser runner together under `tests/fixtures/`.
4. Put shared CFT setup and command-line behavior in `cft-runner.md`; link to
   it instead of duplicating the same explanation in every testcase document.
5. A testcase document must state the fixture files, prerequisites, URL or
   command, scenario, expected observable result, cleanup behavior, and any
   known limitation.
6. Describe pass/fail using report fields or other deterministic signals. If a
   case is a manual observation, say exactly what must be inspected.
7. Keep dated execution results in a separate `*-validation.md` report. Do not
   overwrite historical measurements when a new run is made.
8. Update this index whenever a testcase document is added, renamed, or
   removed.
9. Do not put user-facing product help in this directory. Do not put test-only
   implementation details in the published help pages under `docs/`.

## Required testcase template

Use this structure for new browser regression documents:

```markdown
# <Case title>

Fixture: `../fixtures/<page>.html` and `../fixtures/<runner>.js`

## Prerequisites

...

## Run

...

## Scenario and expected result

...

## Cleanup and limitations

...
```

Keep commands copyable, use stable local URLs where possible, and include the
exact report fields or measurements that determine `testPassed`.

## Common runner documentation

- [CFT runner](cft-runner.md)
- [CFT dummy-provider validation](cft-dummy-provider.md)
- [CFT dummy-provider validation report](cft-dummy-provider-validation.md)

## Browser regression cases

- [Guardian card translation placement](guardian-translation-placement.md)
- [Booking property description paragraphs](booking-property-paragraphs.md)
- [Booking nested inline residual paragraphs](booking-nested-inline-residual.md)
- [IMDb native scroll-anchor observation](imdb-jitter.md)
- [IMDb left-column Awards jitter](imdb-left-jitter.md)
- [Yelp amenity table-cell layout](yelp-amenity-layout.md)
- [Goodreads review paragraph placement](goodreads-review-paragraphs.md)
- [Craigslist posting-body translation](craigslist-body-translation.md)
- [Goodreads review order consistency](goodreads-review-order.md)
- [XDA article translation font size](xda-translation-font-size.md)
- [Reuters article translation layout](reuters-article-layout.md)
- [Letterboxd article caption and logo](letterboxd-article-caption.md)
- [AP News navigation](apnews-navigation.md)
- [AP News live-page compact layout](apnews-live-layout.md)
- [Generic grid layout safety](grid-layout-safety.md)
- [YouTube long description paragraph placement](youtube-description-paragraphs.md)
- [YouTube comment translation placement](youtube-comment-placement.md)
- [Amazon collapsed review translation visibility](amazon-review-visibility.md)
- [YouTube collector mutation performance](youtube-collector-mutation.md)
- [Metacritic translation CPU regression](metacritic-cpu.md)
- [Metacritic repeated navigation regression](metacritic-navigation.md)
- [Metacritic scroll and repeated back/forward regression](metacritic-scroll-navigation.md)
- [Metacritic gallery scroll-state translation stability](metacritic-gallery-scroll.md)
