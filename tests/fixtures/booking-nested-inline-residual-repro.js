import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const descriptions = Array.from(document.querySelectorAll('[data-testid="property-description"]'));
const expectedByDescription = [
  [
    'This introduction explains the hotel location.',
    'Facilities: Guests can use the hotel swimming pool.',
    'Rooms: Each room has a balcony with sea views.',
    'This final note explains the cancellation policy.'
  ],
  [
    'Opening note has enough English words.',
    'First: First inline paragraph has enough English words.',
    'Second: Second inline paragraph has enough English words.',
    'Middle note has enough English words.',
    'Third: Third inline paragraph has enough English words.',
    'Fourth: Fourth inline paragraph has enough English words.',
    'Closing note has enough English words.'
  ]
];
const expectedTexts = expectedByDescription.flat();
const originalMarkup = descriptions.map((description) => description.innerHTML);
const visualOnly = new URL(location.href).searchParams.has('visual');

function getSnapshot() {
  const segments = descriptions.flatMap((description) =>
    Array.from(description.querySelectorAll('[data-translight-segment="true"]'))
  );
  const translations = descriptions.flatMap((description) =>
    Array.from(description.querySelectorAll('translight-translation'))
  );
  const segmentTexts = segments.map((segment) => segment.textContent.trim());
  const translationTexts = translations.map((translation) =>
    translation.textContent.replace(/^ko:/, '').trim()
  );
  const pairs = segments.map((segment) => {
    const translation = segment.nextElementSibling?.matches('translight-translation')
      ? segment.nextElementSibling
      : null;
    const sourceRect = segment.getBoundingClientRect();
    const translationRect = translation?.getBoundingClientRect();
    const verticallySeparate = Boolean(translation) && (
      translationRect.top >= sourceRect.bottom - 1 ||
      translationRect.bottom <= sourceRect.top + 1
    );
    return {
      sourceTop: Math.round(sourceRect.top),
      sourceBottom: Math.round(sourceRect.bottom),
      translationTop: translation ? Math.round(translationRect.top) : null,
      translationBottom: translation ? Math.round(translationRect.bottom) : null,
      verticallySeparate
    };
  });
  return {
    segmentTexts,
    translationTexts,
    segmentCount: segments.length,
    translationCount: translations.length,
    translationsInsideDescriptions: translations.every((translation) =>
      descriptions.some((description) => description.contains(translation))
    ),
    interleaved: pairs.every(({verticallySeparate}) => verticallySeparate),
    pairs
  };
}

function snapshotMatches(snapshot) {
  return snapshot.segmentTexts.join('|') === expectedTexts.join('|') &&
    snapshot.translationTexts.join('|') === expectedTexts.join('|') &&
    snapshot.segmentCount === expectedTexts.length &&
    snapshot.translationCount === expectedTexts.length &&
    new Set(snapshot.segmentTexts).size === expectedTexts.length &&
    snapshot.translationsInsideDescriptions &&
    snapshot.interleaved;
}

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 9611,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        calls.push(text);
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });

  await session.start();
  const firstPass = getSnapshot();
  const propertyCalls = calls.filter((text) => expectedTexts.includes(text));
  const result = {
    fixture: 'booking-nested-inline-residual-repro',
    sourceUrl: 'https://www.booking.com/hotel/us/waikiki-beachcomber-by-outrigger-honolulu.html',
    bodySelector: '[data-testid="property-description"]',
    providerCalls: calls,
    firstPass,
    testPassed: calls.length === expectedTexts.length + 1 &&
      propertyCalls.length === expectedTexts.length &&
      new Set(propertyCalls).size === expectedTexts.length &&
      snapshotMatches(firstPass)
  };
  report.textContent = JSON.stringify(result, null, 2);

  if (visualOnly) {
    result.restoredAfterStop = 'deferred for visual inspection';
    report.textContent = JSON.stringify(result, null, 2);
    return;
  }

  session.stop({notify: false});
  const restoredAfterStop = descriptions.every((description, index) =>
    description.innerHTML === originalMarkup[index] &&
    description.querySelector('[data-translight-segment="true"]') === null &&
    description.querySelector('translight-translation') === null
  ) && document.querySelector('style[data-translight-generated="true"]') === null;

  await session.start();
  const restartPass = getSnapshot();
  const restartHasNoDuplicates = restartPass.segmentCount === expectedTexts.length &&
    restartPass.translationCount === expectedTexts.length &&
    new Set(restartPass.segmentTexts).size === expectedTexts.length;
  session.stop({notify: false});
  const restoredAfterRestart = descriptions.every((description, index) =>
    description.innerHTML === originalMarkup[index] &&
    description.querySelector('[data-translight-segment="true"]') === null &&
    description.querySelector('translight-translation') === null
  ) && document.querySelector('style[data-translight-generated="true"]') === null;

  result.providerCalls = calls;
  result.restartPass = restartPass;
  result.restoredAfterStop = restoredAfterStop;
  result.restoredAfterRestart = restoredAfterRestart;
  result.restartHasNoDuplicates = restartHasNoDuplicates;
  result.testPassed = result.testPassed && snapshotMatches(restartPass) &&
    restoredAfterStop && restoredAfterRestart && restartHasNoDuplicates;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
