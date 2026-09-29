import {PageSession} from '../../src/content/page-session.js';

const reportElement = document.querySelector('#report');
const targets = [
  document.querySelector('#hero-title'),
  document.querySelector('#about-title')
];

function normalizedText(value) {
  return String(value ?? '').replace(/[\t\r\n ]+/gu, ' ').trim();
}

function translate(text) {
  const source = normalizedText(text);
  if (source.startsWith("You'll never work alone") || source.startsWith("You'll neverwork alone")) {
    return '당신은 결코 혼자 일하지 않을 것입니다';
  }
  if (source === 'Never Work Alone') {
    return '절대 혼자 일하지 마세요';
  }
  return `번역: ${source}`;
}

function clippingAncestors(text) {
  const view = text.ownerDocument.defaultView;
  const textRange = text.ownerDocument.createRange();
  textRange.selectNodeContents(text);
  const textRects = Array.from(textRange.getClientRects());
  const clips = [];
  for (let ancestor = text.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    const clipsX = ['hidden', 'clip'].includes(style.overflowX || style.overflow);
    const clipsY = ['hidden', 'clip'].includes(style.overflowY || style.overflow);
    if (!clipsX && !clipsY) continue;
    const bounds = ancestor.getBoundingClientRect();
    const clipped = textRects.some((rect) =>
      clipsX && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) ||
      clipsY && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
    );
    clips.push({
      selector: ancestor.id ? `#${ancestor.id}` : ancestor.className || ancestor.tagName.toLowerCase(),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      clipped
    });
  }
  return clips;
}

function measureTarget(element, session) {
  const record = session.renderer.getRecordForElement(element);
  const text = record?.translation?.querySelector('[data-translight-text="true"]');
  if (!record || !text) return {source: normalizedText(element.textContent), translated: false};
  const rect = record.translation.getBoundingClientRect();
  const textRects = Array.from((() => {
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getClientRects();
  })());
  return {
    translated: true,
    source: normalizedText(record.originalText),
    translation: normalizedText(text.textContent),
    placement: record.placement,
    translationRect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    textLineRects: textRects.map(({x, y, width, height}) => ({x, y, width, height})),
    clippingAncestors: clippingAncestors(text)
  };
}

async function run() {
  // The issue occurs after choosing English in the footer and then translating.
  document.documentElement.lang = 'en';
  document.querySelector('[data-language-choice="en"]').click();
  const session = new PageSession({
    generation: 5901,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => translate(text),
      cancel: () => {},
      close: () => {}
    }
  });

  await session.start();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const targetResults = targets.map((element) => measureTarget(element, session));
  const allTargetsTranslated = targetResults.every(({translated}) => translated !== false);
  const clippedTargets = targetResults.filter((result) =>
    result.clippingAncestors?.some(({clipped}) => clipped)
  );
  const result = {
    fixture: 'neverworkalone-heading-clipping-repro',
    viewport: {width: innerWidth, height: innerHeight},
    language: document.documentElement.lang,
    targets: targetResults,
    clippedTargets: clippedTargets.map(({source}) => source),
    testPassed: allTargetsTranslated && clippedTargets.length === 0
  };
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  const result = {fixture: 'neverworkalone-heading-clipping-repro', error: error.message, stack: error.stack};
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
});
