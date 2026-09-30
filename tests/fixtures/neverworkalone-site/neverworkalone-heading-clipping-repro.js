import {PageSession} from '../../../src/content/page-session.js';

const reportElement = document.querySelector('#report');
const headingTargets = [
  document.querySelector('#hero-title'),
  document.querySelector('#about-title')
];
const translationInputs = [];

function normalizedText(value) {
  return String(value ?? '').replace(/[\t\r\n ]+/gu, ' ').trim();
}

function translate(text) {
  const source = normalizedText(text);
  translationInputs.push(source);
  if (source === "You'll never work alone") {
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
  const expectedSource = element.id === 'hero-title' ? "You'll never work alone" : 'Never Work Alone';
  const record = session.renderer.getRecordForElement(element);
  const text = record?.translation?.querySelector('[data-translight-text="true"]');
  if (!record || !text) {
    return {
      source: normalizedText(element.textContent),
      expectedSource,
      sourceMatchesExpected: false,
      translated: false
    };
  }
  const rect = record.translation.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(text);
  const textRects = Array.from(range.getClientRects());
  const textStyle = getComputedStyle(text);
  const visible = textRects.length > 0 && textRects.every(({left, right, top, bottom}) =>
    left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight
  );
  return {
    translated: true,
    source: normalizedText(record.originalText),
    expectedSource,
    sourceMatchesExpected: normalizedText(record.originalText) === expectedSource,
    translation: normalizedText(text.textContent),
    placement: record.placement,
    visible,
    viewportScrollY: scrollY,
    translationRect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    textLineRects: textRects.map(({x, y, width, height}) => ({x, y, width, height})),
    highlightFragmentRects: Array.from(
      text.getClientRects(),
      ({x, y, width, height}) => ({x, y, width, height})
    ),
    textStyle: {
      fontSize: textStyle.fontSize,
      lineHeight: textStyle.lineHeight,
      backgroundColor: textStyle.backgroundColor
    },
    highlightFragmentIntersections: highlightFragmentIntersections(Array.from(text.getClientRects())),
    lineRangeIntersections: lineRangeIntersections(textRects),
    clippingAncestors: clippingAncestors(text),
    overlappingPeers: overlappingPeers(element, record.translation)
  };
}

async function run() {
  const params = new URLSearchParams(location.search);
  const testLanguage = params.get('language') === 'ko' ? 'ko' : 'en';
  const legacyLineHeightBaseline = params.get('line-height') === 'legacy';
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

  const collectedBlocks = session.collectBlocks(document.body, {
    targetLanguage: 'ko',
    splitSegments: false
  });
  const collectedTargetSources = headingTargets.map((element) => ({
    target: element.id,
    source: collectedBlocks.find((block) => block.element === element)?.text ?? null
  }));

  await session.start();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (legacyLineHeightBaseline) {
    for (const element of targets) {
      const translation = session.renderer.getRecordForElement(element)?.translation;
      const text = translation?.querySelector('[data-translight-text="true"]');
      if (!text) throw new Error(`Cannot apply legacy line-height to ${element.id}.`);
      // Keep the current PageSession and translations, but restore the old
      // highlight line-height so CFT can isolate the rendering change.
      text.style.setProperty('line-height', '1', 'important');
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  const targetRecordSummaries = headingTargets.map((element) => {
    const records = [...session.renderer.records.values()].filter((record) =>
      record.element === element || element.contains(record.element) || record.element.contains(element)
    );
    return {
      target: element.id,
      directRecord: Boolean(session.renderer.getRecordForElement(element)),
      records: records.map(({element: sourceElement, originalText}) => ({
        element: sourceElement.id ? `#${sourceElement.id}` : sourceElement.tagName.toLowerCase(),
        text: normalizedText(originalText)
      }))
    };
  });
  const targetResults = [];
  for (const element of targets) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const bounds = element.getBoundingClientRect();
      const targetScrollY = Math.max(
        0,
        scrollY + bounds.top - Math.max(0, (innerHeight - bounds.height) / 2)
      );
      window.scrollTo({top: targetScrollY, behavior: 'instant'});
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const visibleBounds = element.getBoundingClientRect();
      if (visibleBounds.top >= 0 && visibleBounds.bottom <= innerHeight) break;
    }
    targetResults.push(measureTarget(element, session));
  }

  let maxScrollY = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    maxScrollY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    window.scrollTo({top: maxScrollY, behavior: 'instant'});
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    maxScrollY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    if (Math.abs(scrollY - maxScrollY) <= 1) break;
  }
  const atBottom = Math.abs(scrollY - maxScrollY) <= 1;
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
    visualBaseline: legacyLineHeightBaseline ? 'legacy-line-height' : 'current-line-height',
    expectedVisualFailure: legacyLineHeightBaseline ? 'highlight-fragment-overlap' : null,
    viewport: {width: innerWidth, height: innerHeight},
    pageScroll: {scrollY, maxScrollY, atBottom, scrollHeight: document.documentElement.scrollHeight},
    language: document.documentElement.lang,
    collectedTargetSources: collectedTargetSources.filter(({target}) =>
      targets.some((element) => element.id === target)
    ),
    translationInputs,
    targetRecordSummaries: targetRecordSummaries.filter(({target}) =>
      targets.some((element) => element.id === target)
    ),
    targets: targetResults,
    allTargetsTranslated: translatedTargets.length === targetResults.length,
    untranslatedTargets: untranslatedTargets.map(({source}) => source),
    clippedTargets: clippedTargets.map(({source}) => source),
    overlappingTargets: overlappingTargets.map(({source}) => source),
    highlightOverlapReproduced: targetResults.some(
      ({highlightFragmentIntersections: intersections}) => intersections?.length > 0
    ),
    clippingReproduced: clippedTargets.length > 0,
    overlapReproduced: overlappingTargets.length > 0,
    testPassed: translatedTargets.length === targets.length &&
      translatedTargets.every(({visible, sourceMatchesExpected}) => visible && sourceMatchesExpected) &&
      clippedTargets.length === 0 &&
      targetResults.every(({overlappingPeers: peers}) => peers?.length === 0) &&
      (legacyLineHeightBaseline ? resultHighlightOverlap(targetResults) : overlappingTargets.length === 0) &&
      atBottom
  };
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
}

function resultHighlightOverlap(targets) {
  return targets.some(({highlightFragmentIntersections: intersections}) => intersections?.length > 0);
}

run().catch((error) => {
  const result = {fixture: 'neverworkalone-heading-clipping-repro', error: error.message, stack: error.stack};
  window.__neverworkaloneIssue59Report = result;
  reportElement.textContent = JSON.stringify(result, null, 2);
});
