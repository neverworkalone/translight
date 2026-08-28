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

function sameRect(first, second) {
  if (!first || !second) return false;
  return ['x', 'y', 'width', 'height'].every((property) =>
    Math.abs(first[property] - second[property]) <= 1
  );
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
  const clippedControl = document.querySelector('#clipped-control');
  const clippedBefore = {
    source: rect(clippedSource),
    control: rect(clippedControl)
  };
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

  const transitionRenderer = new TranslationRenderer({
    document,
    sessionId: 'grid-safety-transition'
  });
  const transitionGrid = document.querySelector('#transition-grid');
  const transitionSource = document.querySelector('#transition-source');
  const transitionControl = document.querySelector('#transition-control');
  const transitionTranslation = transitionRenderer.insert({
    element: transitionSource,
    sourceId: 'transition-source',
    translatedText: '라이브'
  });
  const transitionInitialPlacement = placementOf(transitionRenderer, 'transition-source');
  const transitionBefore = {
    source: rect(transitionSource),
    control: rect(transitionControl)
  };
  transitionGrid.style.gridTemplateColumns = '120px';
  transitionGrid.style.gridTemplateRows = '36px 36px';
  transitionRenderer.syncLayouts();
  const transitionAfterTranslation = rect(transitionTranslation);
  const transitionAfter = {
    source: rect(transitionSource),
    control: rect(transitionControl)
  };

  const multiSourceRect = rect(multiSource);
  const multiTranslationRect = rect(multiTranslation);
  const result = {
    fixture: 'grid-layout-safety-repro',
    twoRowGrid: {
      placement: placementOf(multiRenderer, 'multi-row-source'),
      translationParent: multiTranslation?.parentElement?.id ||
        multiTranslation?.parentElement?.tagName || null,
      translationPosition: getComputedStyle(multiTranslation).position,
      sourceRect: multiSourceRect,
      translationRect: multiTranslationRect,
      noOverlap: !overlaps(multiSourceRect, multiTranslationRect),
      outsideGrid: multiTranslation?.parentElement !== document.querySelector('#multi-row')
    },
    clippedSource: {
      placement: placementOf(clippedRenderer, 'clipped-source'),
      translationParent: clippedTranslation?.parentElement?.id ||
        clippedTranslation?.parentElement?.tagName || null,
      translationPosition: getComputedStyle(clippedTranslation).position,
      sourceOverflow: getComputedStyle(clippedSource).overflow,
      outsideSource: clippedTranslation?.parentElement !== clippedSource,
      outsideGrid: clippedTranslation?.parentElement !== document.querySelector('#clipped'),
      sourceRect: clippedBefore.source,
      sourceRectAfter: rect(clippedSource),
      controlRect: clippedBefore.control,
      controlRectAfter: rect(clippedControl),
      hostLayoutStable: sameRect(clippedBefore.source, rect(clippedSource)) &&
        sameRect(clippedBefore.control, rect(clippedControl)),
      noControlOverlap: !overlaps(rect(clippedTranslation), rect(clippedControl))
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
    },
    responsiveTransition: {
      initialPlacement: transitionInitialPlacement,
      placement: placementOf(transitionRenderer, 'transition-source'),
      translationParent: transitionTranslation?.parentElement?.id ||
        transitionTranslation?.parentElement?.tagName || null,
      outsideGrid: transitionTranslation?.parentElement !== transitionGrid,
      sourceRect: transitionBefore.source,
      sourceRectAfter: transitionAfter.source,
      controlRect: transitionBefore.control,
      controlRectAfter: transitionAfter.control,
      translationRect: transitionAfterTranslation,
      hostLayoutSafe: !overlaps(transitionAfterTranslation, transitionAfter.source) &&
        !overlaps(transitionAfterTranslation, transitionAfter.control)
    }
  };

  const passed = result.twoRowGrid.placement === 'grid-layout-external' &&
    result.twoRowGrid.translationPosition !== 'absolute' &&
    result.twoRowGrid.noOverlap && result.twoRowGrid.outsideGrid &&
    result.clippedSource.placement === 'grid-layout-external' &&
    result.clippedSource.outsideSource &&
    result.clippedSource.outsideGrid &&
    result.clippedSource.translationPosition !== 'absolute' &&
    result.clippedSource.hostLayoutStable &&
    result.clippedSource.noControlOverlap &&
    result.anchoredFallback.placement === 'grid-layout-anchored' &&
    result.anchoredFallback.translationParent === 'fallback-source' &&
    result.anchoredFallback.hiddenPlacement === 'anchored' &&
    result.anchoredFallback.sourceDisplay === 'flex' &&
    result.anchoredFallback.sourceVisibility === 'hidden' &&
    result.anchoredFallback.translationVisibility === 'visible' &&
    result.anchoredFallback.sourceText === 'LIVE' &&
    result.anchoredFallback.translationText === '번역' &&
    result.responsiveTransition.initialPlacement === 'grid-layout-anchored' &&
    result.responsiveTransition.placement === 'grid-layout-external' &&
    result.responsiveTransition.outsideGrid &&
    result.responsiveTransition.hostLayoutSafe;

  multiRenderer.removeAll();
  clippedRenderer.removeAll();
  fallbackRenderer.removeAll();
  transitionRenderer.removeAll();
  result.restoredAfterStop = document.querySelectorAll('translight-translation').length === 0 &&
    multiSource.textContent === 'One' &&
    clippedSource.textContent === 'LIVE' &&
    fallbackSource.textContent.replace(/\s+/gu, '') === 'LIVE' &&
    transitionSource.textContent === 'LIVE';
  result.testPassed = passed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

try {
  run();
} catch (error) {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
}
