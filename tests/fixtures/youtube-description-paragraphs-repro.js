import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const description = document.querySelector('#expanded');
const expectedTexts = [
  'First description paragraph with enough text to represent the expanded YouTube description.',
  'Second description paragraph stays separate from the first paragraph.',
  'Third description paragraph should receive its translation at its own boundary.'
];
const originalDescription = description.textContent;

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 7301,
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

  const segments = Array.from(description.querySelectorAll('[data-translight-segment="true"]'));
  const translations = Array.from(description.querySelectorAll('translight-translation'));
  const segmentTexts = segments.map((segment) => segment.textContent.trim());
  const translationTexts = translations.map((translation) => translation.textContent.replace(/^ko:/, '').trim());
  const interleaved = segments.every((segment) => {
    const translation = segment.nextElementSibling;
    return translation?.matches('translight-translation');
  });
  const result = {
    fixture: 'youtube-description-paragraphs-repro',
    sourceUrl: 'https://www.youtube.com/watch?v=h9QaF2X74H0',
    bodySelector: '#description-inline-expander #expanded',
    providerCalls: calls,
    segmentTexts,
    translationTexts,
    translationCount: translations.length,
    interleaved,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      segmentTexts.join('|') === expectedTexts.join('|') &&
      translationTexts.join('|') === expectedTexts.join('|') &&
      translations.length === expectedTexts.length &&
      interleaved
  };
  session.stop({notify: false});
  result.restoredAfterStop = description.textContent === originalDescription &&
    description.querySelector('translight-translation') === null &&
    description.querySelector('[data-translight-segment="true"]') === null;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
