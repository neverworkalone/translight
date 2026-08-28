import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const description = document.querySelector('[data-testid="property-description"]');
const expectedTexts = [
  'Prime Location: OUTRIGGER Waikiki Beachcomber Hotel in Honolulu offers easy access to Waikiki Beach, a 3-minute walk away. Nearby attractions include Royal Hawaiian Shopping Center (984 feet) and Royal Hawaiian Theater (4-minute walk). Honolulu International Airport is 9.3 mi from the property.',
  'Exceptional Facilities: Guests enjoy a swimming pool with stunning views, a sun terrace, and a family-friendly restaurant serving American cuisine. Additional amenities include a hot tub, fitness center, yoga classes, and film nights.',
  'Comfortable Accommodations: Rooms feature air-conditioning, balconies with sea or city views, private bathrooms, and modern amenities such as tea and coffee makers, hairdryers, and free toiletries. Family rooms and sofa beds cater to all travelers.',
  'Dining Experience: The on-site restaurant offers American cuisine with vegetarian and gluten-free options. Breakfast includes local specialties, warm dishes, and fresh fruits. A pool bar and coffee shop provide additional dining options.'
];
const originalDescription = description.textContent;
const visualOnly = new URL(location.href).searchParams.has('visual');

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 9601,
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

  const segments = Array.from(description.querySelectorAll('[data-translight-segment="true"]'));
  const translations = Array.from(description.querySelectorAll('translight-translation'));
  const segmentTexts = segments.map((segment) => segment.textContent.trim());
  const translationTexts = translations.map((translation) => translation.textContent.replace(/^ko:/, '').trim());
  const propertyCalls = calls.filter((text) => expectedTexts.includes(text));
  const interleaved = segments.every((segment) =>
    segment.nextElementSibling?.matches('translight-translation')
  );
  const result = {
    fixture: 'booking-property-paragraphs-repro',
    sourceUrl: 'https://www.booking.com/hotel/us/waikiki-beachcomber-by-outrigger-honolulu.html',
    bodySelector: '[data-testid="property-description"]',
    providerCalls: calls,
    segmentTexts,
    translationTexts,
    segmentCount: segments.length,
    translationCount: translations.length,
    translationsInsideDescription: translations.every((translation) => translation.parentElement === description),
    interleaved,
    testPassed: calls.length === expectedTexts.length + 1 &&
      propertyCalls.length === expectedTexts.length &&
      expectedTexts.every((text) => propertyCalls.includes(text)) &&
      segmentTexts.join('|') === expectedTexts.join('|') &&
      translationTexts.join('|') === expectedTexts.join('|') &&
      segments.length === expectedTexts.length &&
      translations.length === expectedTexts.length &&
      translations.every((translation) => translation.parentElement === description) &&
      interleaved
  };

  if (visualOnly) {
    result.restoredAfterStop = 'deferred for visual inspection';
  } else {
    session.stop({notify: false});
    result.restoredAfterStop = description.textContent === originalDescription &&
      description.querySelector('[data-translight-segment="true"]') === null &&
      description.querySelector('translight-translation') === null;
    result.testPassed = result.testPassed && result.restoredAfterStop;
  }
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
