import {PageSession} from '../../../src/content/page-session.js';

const reportElement = document.querySelector('#report');
const headingTargets = [
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
  if (source === 'Never Work Alone') return '절대 혼자 일하지 마십시오';
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

function overlappingPeers(element, translation) {
  const section = element.closest('section');
  const translationRect = translation.getBoundingClientRect();
  const candidates = [
    ...Array.from(section?.querySelectorAll('h1, h2, p, a, button') ?? []),
    document.querySelector('.site-footer')
  ].filter((candidate) => candidate && candidate !== translation &&
    !element.contains(candidate) && !candidate.contains(element));

  return candidates.flatMap((candidate) => {
    const rect = candidate.getBoundingClientRect();
    const left = Math.max(translationRect.left, rect.left);
    const right = Math.min(translationRect.right, rect.right);
    const top = Math.max(translationRect.top, rect.top);
    const bottom = Math.min(translationRect.bottom, rect.bottom);
    if (left >= right || top >= bottom) return [];
    return [{
      selector: candidate.id ? `#${candidate.id}` : candidate.className || candidate.tagName.toLowerCase(),
      text: normalizedText(candidate.textContent),
      intersection: {x: left, y: top, width: right - left, height: bottom - top}
    }];
  });
}

function lineRangeIntersections(textRects) {
  return textRects.flatMap((first, firstIndex) =>
    textRects.slice(firstIndex + 1).flatMap((second, offset) => {
      const left = Math.max(first.left, second.left);
      const right = Math.min(first.right, second.right);
      const top = Math.max(first.top, second.top);
      const bottom = Math.min(first.bottom, second.bottom);
      if (left >= right || top >= bottom) return [];
      return [{
        firstLine: firstIndex + 1,
        secondLine: firstIndex + offset + 2,
        intersection: {x: left, y: top, width: right - left, height: bottom - top}
      }];
    })
  );
}

function highlightFragmentIntersections(rects) {
  return lineRangeIntersections(rects.map(({x, y, width, height}) => ({
    left: x,
    top: y,
    right: x + width,
    bottom: y + height
  })));
}

function measureTarget(element, session) {
  const record = session.renderer.getRecordForElement(element);
  const text = record?.translation?.querySelector('[data-translight-text="true"]');
  if (!record || !text) return {source: normalizedText(element.textContent), translated: false};
  const rect = record.translation.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(text);
  const textRects = Array.from(range.getClientRects());
  const textStyle = getComputedStyle(text);
  const visible = textRects.some(({left, right, top, bottom}) =>
    right > 0 && left < innerWidth && bottom > 0 && top < innerHeight
  );
  return {
    translated: true,
    source: normalizedText(record.originalText),
    translation: normalizedText(text.textContent),
    placement: record.placement,
    visible,
    translationRect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    textLineRects: textRects.map(({x, y, width, height}) => ({x, y, width, height})),
    highlightFragmentRects: Array.from(text.getClientRects(), ({x, y, width, height}) => ({x, y, width, height})),
    textStyle: {fontSize: textStyle.fontSize, lineHeight: textStyle.lineHeight, backgroundColor: textStyle.backgroundColor},
    highlightFragmentIntersections: highlightFragmentIntersections(Array.from(text.getClientRects())),
    lineRangeIntersections: lineRangeIntersections(textRects),
    clippingAncestors: clippingAncestors(text),
    overlappingPeers: overlappingPeers(element, record.translation)
  };
}

async function run() {
  const testLanguage = new URLSearchParams(location.search).get('language') === 'ko' ? 'ko' : 'en';
  const targets = testLanguage === 'ko' ? [headingTargets[1]] : headingTargets;
  // English is the issue #59 path; ?language=ko matches the supplied screenshot.
  document.querySelector('[data-language-choice="' + testLanguage + '"]').click();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

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
  const maxScrollY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  window.scrollTo({top: maxScrollY, behavior: 'instant'});
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const targetResults = targets.map((element) => measureTarget(element, session));
  const translatedTargets = targetResults.filter(({translated}) => translated !== false);
  const clippedTargets = targetResults.filter((result) =>
    result.clippingAncestors?.some(({clipped}) => clipped)
  );
  const overlappingTargets = targetResults.filter((result) =>
    result.overlappingPeers?.length > 0 || result.highlightFragmentIntersections?.length > 0
  );
  const untranslatedTargets = targetResults.filter(({translated}) => translated === false);
  const result = {
    fixture: 'neverworkalone-heading-clipping-repro',
    testCase: testLanguage === 'ko' ? 'screenshot-korean-state' : 'issue-59-english-state',
    viewport: {width: innerWidth, height: innerHeight},
    pageScroll: {scrollY, maxScrollY, scrollHeight: document.documentElement.scrollHeight},
    language: document.documentElement.lang,
    targets: targetResults,
    allTargetsTranslated: translatedTargets.length === targetResults.length,
    untranslatedTargets: untranslatedTargets.map(({source}) => source),
    clippedTargets: clippedTargets.map(({source}) => source),
    overlappingTargets: overlappingTargets.map(({source}) => source),
    highlightOverlapReproduced: targetResults.some(({highlightFragmentIntersections: intersections}) => intersections?.length > 0),
    clippingReproduced: clippedTargets.length > 0,
    overlapReproduced: overlappingTargets.length > 0,
    testPassed: translatedTargets.length === targets.length &&
      translatedTargets.every(({visible}) => visible) &&
      clippedTargets.length === 0 && overlappingTargets.length === 0
  };
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  const result = {fixture: 'neverworkalone-heading-clipping-repro', error: error.message, stack: error.stack};
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
});
