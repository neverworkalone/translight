import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const card = document.querySelector('[data-a-card-type="basic"]');
const reviewBody = document.querySelector('#review-body');
const expectedText = reviewBody.textContent;
const originalReview = reviewBody.textContent;

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 7501,
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
  await new Promise((resolve) => setTimeout(resolve, 200));

  const translations = Array.from(document.querySelectorAll('translight-translation'));
  const translation = translations[0];
  const cardRect = card.getBoundingClientRect();
  const translationRect = translation?.getBoundingClientRect();
  const translationOutsideCollapsedCard = translation?.parentElement === card.parentElement &&
    translation?.previousElementSibling === card;
  const translationBelowCard = Boolean(
    translationRect && translationRect.top >= cardRect.bottom
  );
  const result = {
    fixture: 'amazon-review-visibility-repro',
    sourceUrl: 'https://www.amazon.com/clp/B0CWGSG7X2',
    bodySelector: '[data-hook="reviewRichContentContainer"] #review-body',
    providerCalls: calls,
    translationCount: translations.length,
    translationOutsideCollapsedCard,
    translationBelowCard,
    translatedReview: translation?.textContent ?? null,
    testPassed: calls.length === 1 && calls[0] === expectedText &&
      translations.length === 1 && translationOutsideCollapsedCard &&
      translationBelowCard
  };

  session.stop({notify: false});
  result.restoredAfterStop = reviewBody.textContent === originalReview &&
    document.querySelector('translight-translation') === null;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
