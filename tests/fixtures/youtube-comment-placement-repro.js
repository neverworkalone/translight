import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const comment = document.querySelector('#content-text');
const hiddenChip = document.querySelector('#paid-comment-chip');
const expectedText = 'China is an incredibly beautiful country. And your videos are simply wonderful!';
const originalComment = comment.textContent.trim();

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 7401,
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
  const translationAfterOriginal = Boolean(
    translation && (comment.compareDocumentPosition(translation) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
  const result = {
    fixture: 'youtube-comment-placement-repro',
    sourceUrl: 'https://www.youtube.com/watch?v=lzopkfaUcKs',
    bodySelector: '#comments #content-text',
    providerCalls: calls,
    translationCount: translations.length,
    originalComment: originalComment,
    translatedComment: translation?.textContent ?? null,
    translationAfterOriginal,
    hiddenPaidChip: Boolean(hiddenChip?.hidden),
    testPassed: calls.length === 1 && calls[0] === expectedText &&
      originalComment === expectedText && translations.length === 1 &&
      translationAfterOriginal && Boolean(hiddenChip?.hidden)
  };

  session.stop({notify: false});
  result.restoredAfterStop = comment.textContent.trim() === originalComment &&
    document.querySelector('translight-translation') === null;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
