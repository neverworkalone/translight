import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const headline = document.querySelector('#headline');
const headlineText = document.querySelector('#headline-text');
const category = document.querySelector('#category');
const expectedHeadline = headlineText.textContent;
const expectedCategory = category.textContent;

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 9301,
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

  const translations = Array.from(document.querySelectorAll('translight-translation'));
  const headlineTranslation = translations.find((translation) =>
    translation.textContent === `ko:${expectedHeadline}`
  );
  const headlineOrder = [...headline.children];
  const translationAfterOriginal = Boolean(
    headlineTranslation && headlineOrder.indexOf(headlineTranslation) > headlineOrder.indexOf(headlineText)
  );
  const result = {
    fixture: 'guardian-translation-placement-repro',
    sourceUrl: 'https://www.theguardian.com/international',
    bodySelector: '#headline',
    providerCalls: calls,
    translationCount: translations.length,
    headlineTranslationParent: headlineTranslation?.parentElement?.id ?? null,
    translationAfterOriginal,
    categoryStillBeforeHeadline: headlineOrder.indexOf(category) < headlineOrder.indexOf(headlineText),
    testPassed: calls.length === 2 && calls.includes(expectedHeadline) && calls.includes(expectedCategory) &&
      translations.length === 2 && headlineTranslation?.parentElement === headline &&
      translationAfterOriginal &&
      headlineOrder.indexOf(category) < headlineOrder.indexOf(headlineText)
  };

  session.stop({notify: false});
  result.restoredAfterStop = headlineText.textContent === expectedHeadline &&
    category.textContent === expectedCategory &&
    document.querySelector('translight-translation') === null;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
