import {TRANSLATION_MODES} from '../../src/settings.js';
import {TranslationRenderer} from '../../src/content/translation-renderer.js';

const report = document.querySelector('#report');

function rect(element) {
  const value = element?.getBoundingClientRect?.();
  return value ? {
    x: Math.round(value.x * 100) / 100,
    y: Math.round(value.y * 100) / 100,
    width: Math.round(value.width * 100) / 100,
    height: Math.round(value.height * 100) / 100
  } : null;
}

function overlaps(first, second) {
  if (!first || !second) return false;
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

function placementOf(renderer, sourceId) {
  const record = renderer.records.get(sourceId);
  return record?.placement?.kind ?? record?.placement ?? null;
}

function run() {
  const multiRenderer = new TranslationRenderer({document, sessionId: 'grid-safety-multi'});
  const multiSource = document.querySelector('#multi-row-source');
  const multiTranslation = multiRenderer.insert({
    element: multiSource,
    sourceId: 'multi-row-source',
    translatedText: '첫 번째'
  });

  const clippedRenderer = new TranslationRenderer({document, sessionId: 'grid-safety-clipped'});
  const clippedSource = document.querySelector('#clipped-source');
  const clippedTranslation = clippedRenderer.insert({
    element: clippedSource,
    sourceId: 'clipped-source',
    translatedText: '라이브'
  });

  const fallbackRenderer = new TranslationRenderer({
    document,
    sessionId: 'grid-safety-fallback',
    settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
  });
  const fallbackSource = document.querySelector('#fallback-source');
  const fallbackTranslation = fallbackRenderer.insert({
    element: fallbackSource,
    sourceId: 'fallback-source',
    translatedText: '번역'
  });

  const multiSourceRect = rect(multiSource);
  const multiTranslationRect = rect(multiTranslation);
  const result = {
    fixture: 'grid-layout-safety-repro',
    twoRowGrid: {
      placement: placementOf(multiRenderer, 'multi-row-source'),
      translationParent: multiTranslation?.parentElement?.id ?? null,
      translationPosition: getComputedStyle(multiTranslation).position,
      sourceRect: multiSourceRect,
      translationRect: multiTranslationRect,
      noOverlap: !overlaps(multiSourceRect, multiTranslationRect)
    },
    clippedSource: {
      placement: placementOf(clippedRenderer, 'clipped-source'),
      translationParent: clippedTranslation?.parentElement?.id ?? null,
      translationPosition: getComputedStyle(clippedTranslation).position,
      sourceOverflow: getComputedStyle(clippedSource).overflow,
      outsideSource: clippedTranslation?.parentElement !== clippedSource
    },
    anchoredFallback: {
      placement: placementOf(fallbackRenderer, 'fallback-source'),
      translationParent: fallbackTranslation?.parentElement?.id ?? null,
      hiddenPlacement: fallbackSource.getAttribute('data-translight-hidden-placement'),
      sourceDisplay: getComputedStyle(fallbackSource).display,
      sourceVisibility: getComputedStyle(fallbackSource).visibility,
      translationVisibility: getComputedStyle(fallbackTranslation).visibility,
      sourceText: Array.from(fallbackSource.querySelectorAll('span:not([data-translight-text])'))
        .map((node) => node.textContent).join(''),
      translationText: fallbackTranslation.textContent
    }
  };

  const passed = result.twoRowGrid.placement === 'sibling' &&
    result.twoRowGrid.translationParent === 'multi-row' &&
    result.twoRowGrid.translationPosition !== 'absolute' &&
    result.twoRowGrid.noOverlap &&
    result.clippedSource.placement === 'sibling' &&
    result.clippedSource.outsideSource &&
    result.clippedSource.translationPosition !== 'absolute' &&
    result.anchoredFallback.placement === 'grid-layout-anchored' &&
    result.anchoredFallback.translationParent === 'fallback-source' &&
    result.anchoredFallback.hiddenPlacement === 'anchored' &&
    result.anchoredFallback.sourceDisplay === 'flex' &&
    result.anchoredFallback.sourceVisibility === 'hidden' &&
    result.anchoredFallback.translationVisibility === 'visible' &&
    result.anchoredFallback.sourceText === 'LIVE' &&
    result.anchoredFallback.translationText === '번역';

  multiRenderer.removeAll();
  clippedRenderer.removeAll();
  fallbackRenderer.removeAll();
  result.restoredAfterStop = document.querySelectorAll('translight-translation').length === 0 &&
    multiSource.textContent === 'One' &&
    clippedSource.textContent === 'LIVE' &&
    fallbackSource.textContent.replace(/\s+/gu, '') === 'LIVE';
  result.testPassed = passed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

try {
  run();
} catch (error) {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
}
