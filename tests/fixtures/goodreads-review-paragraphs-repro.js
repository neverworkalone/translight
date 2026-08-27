import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const review = document.querySelector('#review-text');
const formatted = document.querySelector('.Formatted');
const expectedTexts = [
  'First review paragraph has enough English text to represent the opening of a Goodreads review.',
  'Second review paragraph stays separate so its translation should follow this paragraph instead of the whole review.',
  'Third review paragraph also needs its own translation at the paragraph boundary.'
];
const originalReview = review.textContent;

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 9401,
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

  const segments = Array.from(formatted.querySelectorAll('[data-translight-segment="true"]'));
  const translations = Array.from(formatted.querySelectorAll('translight-translation'));
  const segmentTexts = segments.map((segment) => segment.textContent.trim());
  const translationTexts = translations.map((translation) => translation.textContent.replace(/^ko:/, '').trim());
  const interleaved = segments.every((segment) =>
    segment.nextElementSibling?.matches('translight-translation')
  );
  const result = {
    fixture: 'goodreads-review-paragraphs-repro',
    sourceUrl: 'https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow',
    bodySelector: '#review-text .Formatted',
    providerCalls: calls,
    segmentTexts,
    translationTexts,
    segmentCount: segments.length,
    translationCount: translations.length,
    translationsInsideReview: translations.every((translation) => translation.parentElement === formatted),
    interleaved,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      segmentTexts.join('|') === expectedTexts.join('|') &&
      translationTexts.join('|') === expectedTexts.join('|') &&
      segments.length === expectedTexts.length &&
      translations.length === expectedTexts.length &&
      translations.every((translation) => translation.parentElement === formatted) &&
      interleaved
  };

  session.stop({notify: false});
  result.restoredAfterStop = review.textContent === originalReview &&
    review.querySelector('[data-translight-segment="true"]') === null &&
    review.querySelector('translight-translation') === null;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
