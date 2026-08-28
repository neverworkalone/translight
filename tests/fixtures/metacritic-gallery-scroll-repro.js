import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController
} from '../../src/content/controller.js';
import {PageSession} from '../../src/content/page-session.js';

const GALLERY_SLUG = 'august-september-2026-game-preview-wolverine-silent-hill-townfall-control-resonant';
const ITEM_COUNT = 22;
const SCROLL_STEP = 520;
const ROUTE_SETTLE_MS = 650;
const report = document.querySelector('#report');
const root = document.querySelector('#metacritic-root');
const sourceTexts = [];
const providerCalls = [];
const runtimeMessages = [];
let runtimeListener;
let controller;
let session;
let sessionRouteChanges = 0;
let contentNavigationMessages = 0;
let routeChanges = 0;
let queueCreations = 0;
let missingTranslationSamples = 0;
let minimumTranslatedParagraphs = Number.POSITIVE_INFINITY;
let maximumTranslatedParagraphs = 0;
let lastGalleryIndex = null;
let scrollStep = -1;
const missingSampleDetails = [];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeout = 15000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await wait(25);
  }
  throw new Error('Timed out waiting for the gallery fixture state.');
}

function galleryItemMarkup(index) {
  const firstText = `The ${index === 15 ? 'open-world action' : 'featured'} game preview item explains what players can expect from this release.`;
  const secondText = `This article paragraph for gallery item ${index} contains enough English content to verify stable translation while the page scrolls.`;
  sourceTexts.push(firstText, secondText);
  return `
    <div data-testid="gallery-item" class="c-galleryItem-${index}" id="gallery-item-${index}" slug="${GALLERY_SLUG}">
      <div>
        <h2><a href="/game/gallery-item-${index}/">Gallery Item ${index}</a></h2>
        <p>${index} / ${ITEM_COUNT}</p>
      </div>
      <div data-testid="gallery-item-metascore">
        <div data-testid="gallery-item-metascore-score">${70 + (index % 25)}</div>
        <div>Metascore<br><strong>Generally favorable</strong></div>
      </div>
      <div data-testid="gallery-item-image">
        <picture><img alt="Gallery Item ${index}" loading="lazy"></picture>
      </div>
      <div data-testid="gallery-item-credit">Photo credit for gallery item ${index}</div>
      <div class="gallery-copy">
        <p class="cms-p">${firstText}</p>
        <p class="cms-p">${secondText}</p>
      </div>
    </div>
  `;
}

function renderArticle() {
  sourceTexts.length = 0;
  root.innerHTML = Array.from({length: ITEM_COUNT}, (_, index) => galleryItemMarkup(index + 1)).join('');
}

function paragraphStats() {
  const paragraphs = [...root.querySelectorAll('.cms-p')];
  const translated = paragraphs.filter((paragraph) =>
    paragraph.nextElementSibling?.matches('translight-translation')
  ).length;
  return {total: paragraphs.length, translated};
}

function sampleParagraphs() {
  const {total, translated} = paragraphStats();
  minimumTranslatedParagraphs = Math.min(minimumTranslatedParagraphs, translated);
  maximumTranslatedParagraphs = Math.max(maximumTranslatedParagraphs, translated);
  if (translated < total) {
    missingTranslationSamples += 1;
    if (missingSampleDetails.length < 24) {
      missingSampleDetails.push({
        scrollStep,
        translated,
        total,
        generated: root.querySelectorAll('[data-translight-generated="true"]').length,
        records: session?.renderer?.records?.size ?? null,
        path: location.pathname
      });
    }
  }
}

function activeGalleryIndex() {
  const center = window.innerHeight / 2;
  const item = [...root.querySelectorAll('[data-testid="gallery-item"]')].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.top <= center && rect.bottom >= center;
  });
  return item ? Number(item.id.replace('gallery-item-', '')) : null;
}

function updateGalleryUrl() {
  const index = activeGalleryIndex();
  if (!index || index === lastGalleryIndex) return;
  lastGalleryIndex = index;
  history.replaceState({galleryIndex: index}, '', `/pictures/${GALLERY_SLUG}/${index}`);
  routeChanges += 1;
  const image = document.querySelector(`#gallery-item-${index} img`);
  image?.classList.add('loaded');
}

function installGalleryScrollSpy() {
  window.addEventListener('scroll', updateGalleryUrl, {passive: true});
  updateGalleryUrl();
}

function createInstrumentedSession(options) {
  const provider = {
    getModelState: async () => 'Available',
    prepare: async () => {},
    translate: async (text) => {
      providerCalls.push(text);
      await wait(12);
      return `ko:${text}`;
    },
    cancel: () => {},
    close: () => {}
  };
  const pageSession = new PageSession({
    ...options,
    document,
    settings: {translatePageTitle: false},
    provider
  });
  const originalCreateQueue = pageSession.createQueue.bind(pageSession);
  pageSession.createQueue = (signal) => {
    queueCreations += 1;
    return originalCreateQueue(signal);
  };
  const originalBeginRouteChange = pageSession.beginRouteChange.bind(pageSession);
  pageSession.beginRouteChange = (...args) => {
    sessionRouteChanges += 1;
    return originalBeginRouteChange(...args);
  };
  return pageSession;
}

function installRuntime() {
  const runtime = {
    onMessage: {
      addListener(listener) {
        runtimeListener = listener;
      }
    },
    sendMessage(message) {
      runtimeMessages.push(message);
      if (message.type === 'CONTENT_NAVIGATION') {
        contentNavigationMessages += 1;
        queueMicrotask(() => runtimeListener?.({
          type: 'TRANSLATION_ROUTE',
          documentToken: controller.documentToken,
          routeGeneration: message.routeGeneration,
          continueTranslation: true
        }, {}, () => {}));
      }
      return Promise.resolve();
    }
  };
  controller = installContentController({runtime, createSession: createInstrumentedSession});
}

async function run() {
  history.replaceState({galleryIndex: 5}, '', `/pictures/${GALLERY_SLUG}/5`);
  renderArticle();
  installGalleryScrollSpy();
  installRuntime();
  await controller.settingsReady;
  await runtimeListener({
    type: 'TRANSLATION_START',
    generation: 8801,
    documentToken: controller.documentToken
  }, {}, () => {});
  session = controller.currentSession;
  await waitFor(() => session?.renderer && session?.queue);
  await waitFor(() => {
    const stats = paragraphStats();
    return stats.translated === stats.total;
  });
  const initialStats = paragraphStats();
  minimumTranslatedParagraphs = initialStats.translated;
  maximumTranslatedParagraphs = initialStats.translated;
  const initialProviderCalls = providerCalls.length;
  let sampleTimer = setInterval(sampleParagraphs, 25);

  for (let step = 0; step < ITEM_COUNT; step += 1) {
    window.scrollBy({top: SCROLL_STEP, behavior: 'instant'});
    updateGalleryUrl();
    await wait(ROUTE_SETTLE_MS);
    sampleParagraphs();
  }
  clearInterval(sampleTimer);
  sampleTimer = null;
  await wait(400);
  sampleParagraphs();

  const stats = paragraphStats();
  const result = {
    fixture: 'metacritic-gallery-scroll-repro',
    sourceUrl: `https://www.metacritic.com/pictures/${GALLERY_SLUG}/5`,
    galleryItems: root.querySelectorAll('[data-testid="gallery-item"]').length,
    galleryUrlChanges: routeChanges,
    contentRouteMessages: contentNavigationMessages,
    sessionRouteChanges,
    controllerRouteGeneration: controller.routeGeneration,
    queueCreations,
    initialProviderCalls,
    providerCallCount: providerCalls.length,
    sourceParagraphs: stats.total,
    translatedParagraphs: stats.translated,
    minimumTranslatedParagraphs,
    maximumTranslatedParagraphs,
    missingTranslationSamples,
    missingSampleDetails,
    translationContentsMatch: [...session.renderer.records.values()]
      .filter((record) => record.element?.isConnected && root.contains(record.element))
      .every((record) => record.translation?.textContent === `ko:${record.originalText}`),
    queueState: {
      pending: session.queue?.pending.length ?? 0,
      active: session.queue?.active ?? 0,
      retiredQueues: session.retiredQueues?.size ?? 0
    }
  };

  await runtimeListener({
    type: 'TRANSLATION_STOP',
    generation: session.generation,
    documentToken: controller.documentToken
  }, {}, () => {});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  result.testPassed = result.galleryItems === ITEM_COUNT &&
    result.galleryUrlChanges > 0 &&
    result.contentRouteMessages === 0 &&
    result.sessionRouteChanges === 0 &&
    result.controllerRouteGeneration === 0 &&
    result.queueCreations === 1 &&
    result.translatedParagraphs === result.sourceParagraphs &&
    result.minimumTranslatedParagraphs === result.sourceParagraphs &&
    result.translationContentsMatch &&
    result.queueState.pending === 0 &&
    result.queueState.active === 0 &&
    result.queueState.retiredQueues === 0 &&
    result.restoredAfterStop;
  delete globalThis[CONTENT_CONTROLLER_KEY];
  delete globalThis[DOCUMENT_TOKEN_KEY];
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
