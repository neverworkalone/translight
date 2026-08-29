import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const content = document.querySelector('#content');
const amenitySources = [...document.querySelectorAll('[data-amenity]')];
const originalContent = content.innerHTML;
const labels = amenitySources.map((source) => source.dataset.amenity);
const LAYOUT_TOLERANCE = 1;

function rect(element) {
  const value = element?.getBoundingClientRect?.();
  return value ? {
    x: Math.round(value.x * 100) / 100,
    y: Math.round(value.y * 100) / 100,
    width: Math.round(value.width * 100) / 100,
    height: Math.round(value.height * 100) / 100
  } : null;
}

function snapshot() {
  return amenitySources.map((source) => {
    const translation = source.querySelector('translight-translation');
    const table = source.parentElement;
    const item = table?.parentElement;
    const wrap = item?.parentElement;
    return {
      label: source.dataset.amenity,
      source: rect(source),
      translation: rect(translation),
      sourceParentDisplay: getComputedStyle(table).display,
      sourceParentChildCount: table?.children.length ?? 0,
      translationParent: translation?.parentElement === source ? 'source' :
        translation?.parentElement === table ? 'table' :
          translation?.parentElement?.className ?? null,
      translationDisplay: translation ? getComputedStyle(translation).display : null,
      translationWidth: translation ? getComputedStyle(translation).width : null,
      item: rect(item),
      wrap: rect(wrap)
    };
  });
}

function compareLayoutToBaseline(baseline, current, snapshotCount) {
  const failures = [];
  const metrics = [
    ['source', 'x'],
    ['source', 'width'],
    ['item', 'x'],
    ['item', 'width'],
    ['wrap', 'x'],
    ['wrap', 'width']
  ];
  for (const [index, expected] of baseline.entries()) {
    const actual = current[index];
    if (!actual) {
      failures.push({label: expected.label, snapshotCount, property: 'missing'});
      continue;
    }
    for (const [region, property] of metrics) {
      const expectedValue = expected[region]?.[property];
      const actualValue = actual[region]?.[property];
      if (expectedValue == null || actualValue == null ||
          Math.abs(actualValue - expectedValue) > LAYOUT_TOLERANCE) {
        failures.push({
          label: expected.label,
          snapshotCount,
          property: `${region}.${property}`,
          expected: expectedValue,
          actual: actualValue
        });
      }
    }
    if (actual.sourceParentChildCount !== expected.sourceParentChildCount) {
      failures.push({
        label: expected.label,
        snapshotCount,
        property: 'sourceParentChildCount',
        expected: expected.sourceParentChildCount,
        actual: actual.sourceParentChildCount
      });
    }
  }
  return failures;
}

async function waitForNextFrame() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function run() {
  const calls = [];
  const snapshots = [];
  const baseline = snapshot();
  const session = new PageSession({
    generation: 9701,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        calls.push(text);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });

  const snapshotTimer = setInterval(() => {
    const count = document.querySelectorAll('translight-translation').length;
    if (snapshots.at(-1)?.count === count) return;
    snapshots.push({count, layout: snapshot()});
  }, 10);
  await session.start();
  clearInterval(snapshotTimer);
  await waitForNextFrame();
  const translationCount = document.querySelectorAll('translight-translation').length;
  snapshots.push({count: translationCount, layout: snapshot()});
  const layoutStabilityFailures = snapshots.flatMap(({count, layout}) =>
    compareLayoutToBaseline(baseline, layout, count)
  );

  const records = amenitySources.map((source) => session.renderer?.getRecordForElement(source));
  const placement = records.map((record) => {
    const value = record?.placement;
    return typeof value === 'string' ? value : value?.kind ?? null;
  });
  const amenityTranslationCount = amenitySources.filter((source) =>
    source.querySelector('translight-translation')
  ).length;
  const allAmenitiesInsideSource = amenitySources.every((source) =>
    source.querySelector('translight-translation')?.parentElement === source
  );

  session.stop({notify: false});
  const restoredAfterStop = content.innerHTML === originalContent &&
    document.querySelectorAll('translight-translation').length === 0;
  report.textContent = JSON.stringify({
    fixture: 'yelp-amenity-layout-repro',
    sourceUrl: 'https://www.yelp.com/biz/dandelion-chocolate-san-francisco-12',
    labels,
    providerCalls: calls,
    translationCount,
    baseline,
    placement,
    snapshots,
    layoutStabilityFailures,
    layoutStableAcrossSnapshots: layoutStabilityFailures.length === 0,
    amenityTranslationCount,
    allAmenitiesInsideSource,
    restoredAfterStop,
    testPassed: calls.includes('Offers take-out') &&
      calls.includes('Offers delivery') &&
      calls.includes('Wheelchair accessible') &&
      calls.includes('ADA-compliant main entrance') &&
      amenityTranslationCount === 4 &&
      allAmenitiesInsideSource &&
      layoutStabilityFailures.length === 0 &&
      restoredAfterStop
  }, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
