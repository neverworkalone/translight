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

function runTailOrderCase(insertionOrder, sessionId, update = false) {
  const host = document.createElement('div');
  const layout = document.createElement('div');
  layout.style.display = 'grid';
  layout.style.gridTemplateColumns = '100px';
  layout.style.gridTemplateRows = '20px 20px 20px';
  const sources = [0, 1, 2].map((index) => {
    const source = document.createElement('div');
    source.style.display = 'flex';
    source.textContent = `Item ${index}`;
    layout.appendChild(source);
    return source;
  });
  host.appendChild(layout);
  document.body.appendChild(host);

  const renderer = new TranslationRenderer({document, sessionId});
  for (const index of insertionOrder) {
    renderer.insert({
      element: sources[index],
      sourceId: `${sessionId}-${index}`,
      translatedText: `T${index}`
    });
  }
  if (update) {
    renderer.insert({
      element: sources[0],
      sourceId: `${sessionId}-0`,
      translatedText: 'T0 updated'
    });
  }
  const order = [...host.children]
    .filter((child) => child.matches('translight-translation'))
    .map((child) => child.textContent);
  renderer.removeAll();
  const restored = host.children.length === 1 && !host.querySelector('translight-translation');
  host.remove();
  return {order, restored};
}

function runMovedOrderCase(removeMovedSource, sessionId) {
  const host = document.createElement('div');
  const layout = document.createElement('div');
  layout.style.display = 'grid';
  layout.style.gridTemplateColumns = '100px';
  layout.style.gridTemplateRows = '20px 20px 20px 20px';
  const sources = {};
  for (const id of ['A', 'B', 'C']) {
    const source = document.createElement('div');
    source.style.display = 'flex';
    source.textContent = id;
    layout.appendChild(source);
    sources[id] = source;
  }
  host.appendChild(layout);
  const following = document.createElement('p');
  following.textContent = 'Following content';
  host.appendChild(following);
  document.body.appendChild(host);

  const renderer = new TranslationRenderer({document, sessionId});
  for (const id of ['A', 'B', 'C']) {
    renderer.insert({element: sources[id], sourceId: id, translatedText: id});
  }
  layout.appendChild(sources.A);
  if (removeMovedSource) {
    renderer.remove(sources.A);
  } else {
    renderer.insert({element: sources.A, sourceId: 'A', translatedText: 'A updated'});
  }
  const sourceX = document.createElement('div');
  sourceX.style.display = 'flex';
  sourceX.textContent = 'X';
  layout.insertBefore(sourceX, sources.B);
  renderer.insert({element: sourceX, sourceId: 'X', translatedText: 'X'});

  const order = [...host.children]
    .filter((child) => child.matches('translight-translation'))
    .map((child) => child.textContent);
  const sourceOrder = [...layout.children].map((child) => child.textContent);
  renderer.removeAll();
  const restored = host.children.length === 2 && !host.querySelector('translight-translation');
  host.remove();
  return {order, sourceOrder, restored};
}

async function runSuppressedExternalCase(sessionId) {
  const layout = document.querySelector('#suppressed-grid');
  const source = document.querySelector('#suppressed-source');
  const control = document.querySelector('#suppressed-control');
  const renderer = new TranslationRenderer({
    document,
    sessionId,
    settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
  });
  const translation = renderer.insert({
    element: source,
    sourceId: `${sessionId}-source`,
    translatedText: 'Translated'
  });
  const initiallySuppressed = !translation?.isConnected;

  layout.appendChild(source);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const suppressedAfterSourceMove = !translation?.isConnected;

  renderer.updatePresentation({translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION});
  const restoredAfterModeSwitch = translation?.isConnected === true;
  renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ONLY});
  const suppressedAfterSecondModeSwitch = !translation?.isConnected;
  const placement = renderer.records.get(`${sessionId}-source`)?.placement?.kind ?? null;

  layout.insertBefore(source, control);
  renderer.removeAll();
  return {
    placement,
    initiallySuppressed,
    suppressedAfterSourceMove,
    restoredAfterModeSwitch,
    suppressedAfterSecondModeSwitch,
    restoredAfterStop: source.textContent === 'Original' &&
      layout.children[0] === source && layout.children[1] === control
  };
}

async function run() {
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
  const tailOrder = {
    forward: runTailOrderCase([0, 1, 2], 'grid-safety-tail-forward'),
    reverse: runTailOrderCase([2, 1, 0], 'grid-safety-tail-reverse'),
    asyncUpdate: runTailOrderCase([2, 0, 1], 'grid-safety-tail-async-update', true)
  };
  const movedOrder = {
    update: runMovedOrderCase(false, 'grid-safety-moved-update'),
    remove: runMovedOrderCase(true, 'grid-safety-moved-remove')
  };
  const suppressedExternal = await runSuppressedExternalCase('grid-safety-suppressed-external');

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
    },
    tailOrder,
    movedOrder,
    suppressedExternal
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
    result.responsiveTransition.hostLayoutSafe &&
    Object.entries(result.tailOrder).every(([name, {order, restored}]) => {
      const expected = name === 'asyncUpdate' ? 'T0 updated|T1|T2' : 'T0|T1|T2';
      return restored && order.join('|') === expected;
    }) &&
    result.movedOrder.update.restored &&
    result.movedOrder.update.order.join('|') === 'X|B|C|A updated' &&
    result.movedOrder.update.sourceOrder.join('|') === 'X|B|C|A' &&
    result.movedOrder.remove.restored &&
    result.movedOrder.remove.order.join('|') === 'X|B|C' &&
    result.movedOrder.remove.sourceOrder.join('|') === 'X|B|C|A' &&
    result.suppressedExternal.placement === 'grid-layout-external' &&
    result.suppressedExternal.initiallySuppressed &&
    result.suppressedExternal.suppressedAfterSourceMove &&
    result.suppressedExternal.restoredAfterModeSwitch &&
    result.suppressedExternal.suppressedAfterSecondModeSwitch &&
    result.suppressedExternal.restoredAfterStop;

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

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
