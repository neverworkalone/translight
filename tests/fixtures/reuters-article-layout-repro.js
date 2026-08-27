import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const source = document.querySelector('#source');
const expectedTexts = [
  'In January, Meta CEO Mark Zuckerberg and his top lieutenants gathered for their annual leadership retreat at his Hawaii compound.',
  'They hatched a radical plan to reimagine work at the social-media giant in the age of artificial intelligence.'
];

function layout(node) {
  const rect = node?.getBoundingClientRect?.();
  return rect ? {
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width)
  } : null;
}

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 8101,
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

  const translation = source.nextElementSibling;
  const sourceLayout = layout(source);
  const translationLayout = layout(translation);
  const result = {
    fixture: 'reuters-article-layout-repro',
    sourceUrl: 'https://www.reuters.com/investigations/mark-zuckerberg-had-bold-plan-replace-meta-staff-with-ai-heres-how-it-imploded-2026-08-26/',
    providerCalls: calls,
    sourceLayout,
    translationLayout,
    translationCount: document.querySelectorAll('translight-translation').length,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      translationLayout?.left === sourceLayout?.left &&
      translationLayout?.right === sourceLayout?.right &&
      translationLayout?.width === sourceLayout?.width
  };
  report.textContent = JSON.stringify(result, null, 2);
  session.stop({notify: false});
  result.restoredAfterStop = document.querySelector('translight-translation') === null &&
    source.textContent.trim() === expectedTexts[0];
  result.testPassed = result.testPassed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
