import { PageSession } from '../../src/content/page-session.js';
import { TranslationQueue } from '../../src/content/translation-queue.js';
import { TranslationRenderer } from '../../src/content/translation-renderer.js';

const HOME_CARD_COUNT = 90;
const DETAIL_CARD_COUNT = 70;
const BLOCKS_PER_CARD = 4;
const LAYER_COUNT = 6;
const SCROLL_BURST_COUNT = 8;
const NAVIGATION_CYCLE_COUNT = 4;
const MAX_INTERACTION_RECT_CALLS = 5000;
const PROVIDER_CONCURRENCY_BUDGET = 3;
const BLOCK_TAGS = ['h3', 'p', 'li', 'h4'];
const report = document.querySelector('#report');
const root = document.querySelector('#metacritic-root');
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const collectRectCallsites = new URLSearchParams(location.search).has('stacks');
const collectMetrics = new URLSearchParams(location.search).has('metrics');
let rectCalls = 0;
const rectCallsites = new Map();
const metrics = {
  collectCalls: 0,
  mutationCallbacks: 0,
  pruneCalls: 0,
  pruneRecordVisits: 0,
  recoveryCalls: 0,
  rescanCalls: 0,
  queueEnqueueAllCalls: 0,
  queueSortCalls: 0,
  queuePrioritySortCalls: 0,
  queueSortLengths: [],
  syncLayoutsCalls: 0
};
let scrollEvents = 0;
let routeGeneration = 0;
let session;
let providerActive = 0;
let providerMaxActive = 0;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeout = 15000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error('Timed out waiting for the fixture state.');
}

function sourceMarkup(tagName, text) {
  return `<${tagName} class="fixture-source" data-fixture-source="true">${text}</${tagName}>`;
}

function createBlock(route, cardIndex, blockIndex) {
  const tagName = BLOCK_TAGS[blockIndex];
  let markup = sourceMarkup(
    tagName,
    `${route} Metacritic card ${cardIndex} ${tagName} content has enough English text to translate.`
  );
  for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
    const className = layer === 0 ? 'card-layer card-leaf-host' : 'card-layer';
    markup = `<div class="${className}">${markup}</div>`;
  }
  return markup;
}

function createCards(route, count) {
  return Array.from({length: count}, (_, cardIndex) => `
    <div class="metacritic-card">
      <div class="card-frame">
        ${Array.from({length: BLOCKS_PER_CARD}, (_, blockIndex) =>
          createBlock(route, cardIndex, blockIndex)
        ).join('')}
      </div>
    </div>
  `).join('');
}

function renderHome() {
  root.innerHTML = `
    <section class="fixture-section" data-section="new-and-notable">
      ${sourceMarkup('h2', 'New and Notable')}
      <a id="notable-link" href="/game/star-wars-zero-company/">
        ${sourceMarkup('h3', 'Star Wars Zero Company')}
        ${sourceMarkup('p', 'A new strategy game featured in the New and Notable collection.')}
      </a>
    </section>
    <section class="fixture-section" data-section="catalog">
      ${createCards('Home', HOME_CARD_COUNT)}
    </section>
    <section id="latest-news" class="fixture-section" data-section="latest-news">
      ${sourceMarkup('h2', 'Latest News')}
      ${Array.from({length: 8}, (_, index) => sourceMarkup(
        'p',
        `Latest News item ${index + 1} contains enough English text to translate.`
      )).join('')}
    </section>
  `;
}

function renderDetail() {
  root.innerHTML = `
    <section class="fixture-section" data-section="detail">
      ${sourceMarkup('h2', 'Star Wars Zero Company')}
      ${sourceMarkup('p', 'The detail page contains a long review and score summary.')}
      ${createCards('Detail', DETAIL_CARD_COUNT)}
    </section>
  `;
}

function currentRecords() {
  return [...session?.renderer?.records?.values?.() ?? []]
    .filter((record) => record.element?.isConnected && root.contains(record.element));
}

function currentTranslationCount() {
  return currentRecords().filter((record) => record.translation?.isConnected).length;
}

async function waitForCurrentRouteReady() {
  await waitFor(() => currentRecords().length > 0);
}

async function waitForCurrentRouteComplete() {
  await waitFor(() => {
    const records = currentRecords();
    const sourceCount = root.querySelectorAll('[data-fixture-source="true"]').length;
    return records.length === sourceCount &&
      records.every((record) => record.translation?.isConnected);
  });
  await wait(120);
}

async function scrollBurst(top) {
  window.scrollTo({top, behavior: 'instant'});
  for (let index = 0; index < SCROLL_BURST_COUNT; index += 1) {
    scrollEvents += 1;
    window.dispatchEvent(new Event('scroll'));
    await wait(60);
  }
}

async function navigateRoute(route, {push = false} = {}) {
  routeGeneration += 1;
  if (push) {
    history.pushState({route}, '', `?fixture-route=${route}-${routeGeneration}`);
  }
  if (!session.beginRouteChange({routeGeneration})) {
    throw new Error(`Could not begin route ${routeGeneration}.`);
  }
  if (route === 'home') renderHome();
  else renderDetail();
  await wait(0);
  if (!session.applyRouteDecision({routeGeneration, continueTranslation: true})) {
    throw new Error(`Could not apply route ${routeGeneration}.`);
  }
  await waitForCurrentRouteReady();
}

function waitForHistoryNavigation(direction) {
  return new Promise((resolve, reject) => {
    const handlePopState = () => {
      window.removeEventListener('popstate', handlePopState);
      navigateRoute(history.state?.route ?? 'home')
        .then(resolve)
        .catch(reject);
    };
    window.addEventListener('popstate', handlePopState, {once: true});
    history[direction]();
  });
}

async function run() {
  const providerDelay = Math.max(
    8,
    Number(new URLSearchParams(location.search).get('providerDelay')) || 8
  );
  if (collectMetrics) {
    const originalQueueEnqueueAll = TranslationQueue.prototype.enqueueAll;
    TranslationQueue.prototype.enqueueAll = function (blocks) {
      metrics.queueEnqueueAllCalls += 1;
      return originalQueueEnqueueAll.call(this, blocks);
    };
    const originalQueueSortPending = TranslationQueue.prototype.sortPending;
    TranslationQueue.prototype.sortPending = function () {
      metrics.queueSortCalls += 1;
      if (this.priorityDirty && this.pending.length >= 2) metrics.queuePrioritySortCalls += 1;
      metrics.queueSortLengths.push(this.pending.length);
      return originalQueueSortPending.call(this);
    };
    const originalSyncLayouts = TranslationRenderer.prototype.syncLayouts;
    TranslationRenderer.prototype.syncLayouts = function (...args) {
      metrics.syncLayoutsCalls += 1;
      return originalSyncLayouts.apply(this, args);
    };
  }
  Element.prototype.getBoundingClientRect = function (...args) {
    if (this.closest?.('#metacritic-root')) {
      rectCalls += 1;
      if (collectRectCallsites) {
        const callsite = new Error().stack?.split('\n')
          .find((line) => line.includes('/src/'))?.trim() ?? 'unknown';
        rectCallsites.set(callsite, (rectCallsites.get(callsite) ?? 0) + 1);
      }
    }
    return originalGetBoundingClientRect.apply(this, args);
  };
  history.replaceState({route: 'home'}, '', `${location.pathname}?fixture-route=home`);
  renderHome();

  const providerCalls = [];
  session = new PageSession({
    generation: 9603,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        providerActive += 1;
        providerMaxActive = Math.max(providerMaxActive, providerActive);
        try {
          await wait(providerDelay);
          providerCalls.push(text);
          return `ko:${text}`;
        } finally {
          providerActive -= 1;
        }
      },
      cancel: () => {},
      close: () => {}
    }
  });
  const originalCollectBlocks = session.collectBlocks.bind(session);
  session.collectBlocks = (...args) => {
    metrics.collectCalls += 1;
    return originalCollectBlocks(...args);
  };
  const originalHandleMutations = session.handleMutations.bind(session);
  session.handleMutations = (...args) => {
    metrics.mutationCallbacks += 1;
    return originalHandleMutations(...args);
  };
  const originalRescanRoute = session.rescanRoute.bind(session);
  session.rescanRoute = (...args) => {
    metrics.rescanCalls += 1;
    return originalRescanRoute(...args);
  };
  const startPromise = session.start();
  startPromise.catch((error) => {
    if (session?.isCurrent?.()) throw error;
  });

  await waitFor(() => session.renderer && session.queue);
  if (collectMetrics) {
    const originalPruneDisconnected = session.renderer.pruneDisconnected;
    session.renderer.pruneDisconnected = function (...args) {
      metrics.pruneCalls += 1;
      metrics.pruneRecordVisits = (metrics.pruneRecordVisits ?? 0) + this.records.size;
      return originalPruneDisconnected.apply(this, args);
    };
    const originalRecoverMissingTranslations = session.recoverMissingTranslations.bind(session);
    session.recoverMissingTranslations = (...args) => {
      metrics.recoveryCalls += 1;
      return originalRecoverMissingTranslations(...args);
    };
  }
  await wait(100);
  const initialRectCalls = rectCalls;

  const latestNews = document.querySelector('#latest-news');
  await scrollBurst(latestNews.offsetTop);
  await waitFor(() => latestNews.querySelectorAll('translight-translation').length >= 8);
  const latestNewsTranslated = latestNews.querySelectorAll('translight-translation').length;
  await scrollBurst(0);

  const notableLink = document.querySelector('#notable-link');
  let detailNavigation;
  notableLink.addEventListener('click', (event) => {
    event.preventDefault();
    detailNavigation = navigateRoute('detail', {push: true});
  }, {once: true});
  notableLink.click();
  await detailNavigation;
  await scrollBurst(document.documentElement.scrollHeight);
  await waitForCurrentRouteComplete();

  const routeSnapshots = [];
  for (let cycle = 1; cycle <= NAVIGATION_CYCLE_COUNT; cycle += 1) {
    await waitForHistoryNavigation('back');
    await scrollBurst(0);
    await waitForHistoryNavigation('forward');
    await scrollBurst(document.documentElement.scrollHeight);
    await waitForCurrentRouteComplete();
    routeSnapshots.push({
      cycle,
      route: history.state?.route,
      sourceCount: root.querySelectorAll('[data-fixture-source="true"]').length,
      recordCount: currentRecords().length,
      translationCount: currentTranslationCount(),
      retiredQueues: session.retiredQueues?.size ?? 0
    });
  }

  const interactionRectCalls = rectCalls - initialRectCalls;
  const allRecords = [...session.renderer.records.values()];
  const disconnectedRecordCount = allRecords.filter((record) => !record.element?.isConnected).length;
  const queueSortLengths = metrics.queueSortLengths;
  const result = {
    fixture: 'metacritic-scroll-navigation-repro',
    path: 'translate → scroll Latest News → wait → scroll top → click New and Notable → scroll bottom → back/forward cycles',
    latestNewsTranslated,
    scrollEvents,
    providerCallCount: providerCalls.length,
    providerUniqueCount: new Set(providerCalls).size,
    providerMaxActive,
    providerConcurrencyBudget: PROVIDER_CONCURRENCY_BUDGET,
    translationCacheSize: session.translationCache.size,
    interactionRectCalls,
    rectBudget: MAX_INTERACTION_RECT_CALLS,
    rendererRecordCount: allRecords.length,
    disconnectedRecordCount,
    queueState: {
      pending: session.queue?.pending.length ?? 0,
      active: session.queue?.active ?? 0,
      seen: session.queue?.seen.size ?? 0,
      cancelled: session.queue?.cancelled ?? true,
      retiredQueues: session.retiredQueues?.size ?? 0
    },
    ...(collectMetrics ? {
      metrics: {
        ...metrics,
        queueSortLengths: undefined,
        queueSortLengthSummary: {
          count: queueSortLengths.length,
          max: Math.max(...(queueSortLengths.length ? queueSortLengths : [0])),
          sum: queueSortLengths.reduce((sum, length) => sum + length, 0)
        }
      }
    } : {}),
    ...(collectRectCallsites ? {rectCallsites: Object.fromEntries(rectCallsites)} : {}),
    routeSnapshots,
    testPassed: latestNewsTranslated >= 8 && routeSnapshots.every((snapshot) =>
      snapshot.sourceCount === snapshot.recordCount &&
      snapshot.recordCount === snapshot.translationCount
    ) && interactionRectCalls <= MAX_INTERACTION_RECT_CALLS &&
      allRecords.length === root.querySelectorAll('[data-fixture-source="true"]').length &&
      disconnectedRecordCount === 0 &&
      (session.queue?.pending.length ?? 0) === 0 &&
      (session.queue?.active ?? 0) === 0 &&
      providerActive === 0 &&
      providerMaxActive <= PROVIDER_CONCURRENCY_BUDGET
  };

  session.stop({notify: false});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  result.testPassed &&= result.restoredAfterStop;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
