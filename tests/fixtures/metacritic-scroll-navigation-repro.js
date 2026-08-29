import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController
} from '../../src/content/controller.js';
import { PageSession } from '../../src/content/page-session.js';
import { CACHE_RESULT_BATCH_SIZE, TranslationQueue } from '../../src/content/translation-queue.js';
import { TranslationRenderer } from '../../src/content/translation-renderer.js';

// Keep the full homepage larger than the production cache so the supplied
// navigation path still exercises partial-cache restarts under realistic
// pressure. Warm-cache scheduling is covered separately below without
// reducing this reproduction workload.
const HOME_CARD_COUNT = 90;
const DETAIL_CARD_COUNT = 70;
const WARM_CACHE_PROBE_BLOCK_COUNT = 48;
const BLOCKS_PER_CARD = 4;
const LAYER_COUNT = 6;
const SCROLL_BURST_COUNT = 8;
const NAVIGATION_CYCLE_COUNT = 4;
const MAX_INTERACTION_RECT_CALLS = 5000;
const MAX_FIRST_TIMER_DELAY_MS = 250;
const MAX_COLLECTION_PHASE_MS = 250;
const MAX_REMOVE_ALL_MS = 100;
const MAX_RESULT_APPLY_MS = 16;
const MAX_LONG_TASK_MS = 250;
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
  collectPhases: [],
  mutationCallbacks: 0,
  pruneCalls: 0,
  pruneRecordVisits: 0,
  recoveryScanCalls: 0,
  recoveryStateVisits: 0,
  recoveryCalls: 0,
  rescanCalls: 0,
  queueEnqueueAllCalls: 0,
  queueSortCalls: 0,
  queuePrioritySortCalls: 0,
  queueSortLengths: [],
  syncLayoutsCalls: 0,
  resultApplications: 0,
  cacheHitResults: 0,
  maxResultApplyMs: 0,
  sessionStarts: 0,
  sessionStops: 0,
  removeAllMs: [],
  restartProbes: [],
  longestMainThreadTask: 0,
  longTaskCount: 0,
  longTaskSupported: false
};
let scrollEvents = 0;
let routeGeneration = 0;
let session;
let controller;
let runtimeListener;
const runtimeMessages = [];
const sessionMetrics = [];
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

function renderWarmCacheProbe() {
  root.innerHTML = `
    <section class="fixture-section" data-section="warm-cache-probe">
      ${sourceMarkup('h2', 'Warm cache probe')}
      ${Array.from({length: WARM_CACHE_PROBE_BLOCK_COUNT}, (_, index) => sourceMarkup(
        'p',
        `Warm cache probe item ${index + 1} has enough English text to translate.`
      )).join('')}
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

function currentTranslationContentMismatches() {
  return currentRecords().filter((record) =>
    record.translation?.textContent !== `ko:${record.originalText}`
  ).length;
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

async function applyControllerRoute(route) {
  const navigation = runtimeMessages.at(-1);
  if (navigation?.type !== 'CONTENT_NAVIGATION') {
    throw new Error('Controller did not report the route change.');
  }
  routeGeneration = navigation.routeGeneration;
  if (route === 'home') renderHome();
  else if (route === 'detail') renderDetail();
  else if (route === 'warm-cache-probe') renderWarmCacheProbe();
  else throw new Error(`Unknown fixture route: ${route}.`);
  await wait(0);
  await runtimeListener({
    type: 'TRANSLATION_ROUTE',
    documentToken: controller.documentToken,
    routeGeneration,
    continueTranslation: true
  }, {}, () => {});
  await waitForCurrentRouteReady();
}

async function navigateRoute(route, {push = false} = {}) {
  if (push) {
    history.pushState({route}, '', `?fixture-route=${route}-${controller.routeGeneration + 1}`);
  }
  if (!controller.navigationHandler()) {
    throw new Error(`Controller could not begin route ${route}.`);
  }
  await applyControllerRoute(route);
}

function waitForHistoryNavigation(direction) {
  return new Promise((resolve, reject) => {
    const handlePopState = async () => {
      window.removeEventListener('popstate', handlePopState);
      try {
        const route = history.state?.route ?? 'home';
        if (!session?.routeDecisionPending && !controller.navigationHandler()) {
          throw new Error(`Controller could not observe history ${direction}.`);
        }
        await applyControllerRoute(route);
        resolve();
      } catch (error) {
        reject(error);
      }
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
  const providerCalls = [];
  const longTaskObserver = (() => {
    try {
      const Observer = window.PerformanceObserver;
      const observer = new Observer((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTaskCount += 1;
          metrics.longestMainThreadTask = Math.max(metrics.longestMainThreadTask, entry.duration);
        }
      });
      observer.observe({entryTypes: ['longtask']});
      metrics.longTaskSupported = true;
      return observer;
    } catch {
      return null;
    }
  })();
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

  const instrumentRenderer = (pageSession, sessionMetric) => {
    const renderer = pageSession.renderer;
    if (!renderer || renderer.__metacriticFixtureInstrumented) return;
    renderer.__metacriticFixtureInstrumented = true;
    const originalPruneDisconnected = renderer.pruneDisconnected.bind(renderer);
    renderer.pruneDisconnected = (...args) => {
      metrics.pruneCalls += 1;
      metrics.pruneRecordVisits += renderer.records.size;
      return originalPruneDisconnected(...args);
    };
    const originalGetRecoveryState = renderer.getRecoveryState.bind(renderer);
    renderer.getRecoveryState = (...args) => {
      metrics.recoveryStateVisits += 1;
      return originalGetRecoveryState(...args);
    };
    const originalGetMissingTranslations = renderer.getMissingTranslations.bind(renderer);
    renderer.getMissingTranslations = (...args) => {
      metrics.recoveryScanCalls += 1;
      return originalGetMissingTranslations(...args);
    };
    const originalRemoveAll = renderer.removeAll.bind(renderer);
    renderer.removeAll = (...args) => {
      const started = performance.now();
      const result = originalRemoveAll(...args);
      const duration = performance.now() - started;
      metrics.removeAllMs.push(duration);
      sessionMetric.removeAllMs.push(duration);
      return result;
    };
    const originalRecoverMissingTranslations = pageSession.recoverMissingTranslations.bind(pageSession);
    pageSession.recoverMissingTranslations = (...args) => {
      metrics.recoveryCalls += 1;
      return originalRecoverMissingTranslations(...args);
    };
  };
  const createInstrumentedSession = (options) => {
    const sessionMetric = {
      generation: options.generation,
      collectPhases: [],
      cacheHits: 0,
      resultApplications: 0,
      maxResultApplyMs: 0,
      removeAllMs: [],
      phase: 'created',
      prepareMs: 0,
      firstResultAt: null
    };
    sessionMetrics.push(sessionMetric);
    const provider = {
      getModelState: async () => {
        sessionMetric.phase = 'model-check';
        return 'Available';
      },
      prepare: async () => {
        sessionMetric.phase = 'prepare';
        const started = performance.now();
        await Promise.resolve();
        sessionMetric.prepareMs = performance.now() - started;
        sessionMetric.phase = 'post-prepare';
      },
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
    };
    const pageSession = new PageSession({
      ...options,
      document,
      settings: {translatePageTitle: false},
      provider
    });
    const originalCollectBlocks = pageSession.collectBlocks.bind(pageSession);
    pageSession.collectBlocks = (...args) => {
      const phase = sessionMetric.phase;
      const started = performance.now();
      const blocks = originalCollectBlocks(...args);
      metrics.collectCalls += 1;
      const durationMs = performance.now() - started;
      metrics.collectPhases.push({generation: sessionMetric.generation, phase, blocks: blocks.length, durationMs});
      sessionMetric.collectPhases.push({phase, blocks: blocks.length, durationMs});
      return blocks;
    };
    const originalHandleMutations = pageSession.handleMutations.bind(pageSession);
    pageSession.handleMutations = (...args) => {
      metrics.mutationCallbacks += 1;
      return originalHandleMutations(...args);
    };
    const originalRescanRoute = pageSession.rescanRoute.bind(pageSession);
    pageSession.rescanRoute = (...args) => {
      metrics.rescanCalls += 1;
      return originalRescanRoute(...args);
    };
    const originalCreateQueue = pageSession.createQueue.bind(pageSession);
    pageSession.createQueue = (signal) => {
      originalCreateQueue(signal);
      const queue = pageSession.queue;
      if (!queue || queue.__metacriticFixtureInstrumented) return;
      queue.__metacriticFixtureInstrumented = true;
      const originalOnResult = queue.onResult;
      queue.onResult = (block, value, metadata) => {
        const started = performance.now();
        metrics.resultApplications += 1;
        sessionMetric.resultApplications += 1;
        if (metadata?.fromCache) {
          metrics.cacheHitResults += 1;
          sessionMetric.cacheHits += 1;
        }
        sessionMetric.firstResultAt ??= performance.now();
        const result = originalOnResult(block, value, metadata);
        const duration = performance.now() - started;
        sessionMetric.maxResultApplyMs = Math.max(sessionMetric.maxResultApplyMs, duration);
        metrics.maxResultApplyMs = Math.max(metrics.maxResultApplyMs, duration);
        return result;
      };
      instrumentRenderer(pageSession, sessionMetric);
    };
    const originalStart = pageSession.start.bind(pageSession);
    pageSession.start = () => {
      metrics.sessionStarts += 1;
      sessionMetric.startedAt = performance.now();
      return originalStart();
    };
    const originalStop = pageSession.stop.bind(pageSession);
    pageSession.stop = (...args) => {
      metrics.sessionStops += 1;
      instrumentRenderer(pageSession, sessionMetric);
      const started = performance.now();
      const result = originalStop(...args);
      sessionMetric.stopMs = performance.now() - started;
      return result;
    };
    return pageSession;
  };
  const runtime = {
    onMessage: {
      addListener(listener) {
        runtimeListener = listener;
      }
    },
    sendMessage(message) {
      runtimeMessages.push(message);
      return Promise.resolve();
    }
  };
  controller = installContentController({
    runtime,
    createSession: createInstrumentedSession
  });
  await controller.settingsReady;
  controller.stopNavigationWatcher();

  const startControllerSession = async (generation) => {
    await runtimeListener({
      type: 'TRANSLATION_START',
      generation,
      documentToken: controller.documentToken
    }, {}, () => {});
    session = controller.currentSession;
    await waitFor(() => session?.renderer && session?.queue);
    await session.runPromise;
    sessionMetrics.at(-1).completedAt = performance.now();
    controller.stopNavigationWatcher();
  };
  const restartCurrentSession = async (generation, restart) => {
    const previousGeneration = session.generation;
    const providerCallsBefore = providerCalls.length;
    const stoppedSessionMetric = sessionMetrics.at(-1);
    await runtimeListener({
      type: 'TRANSLATION_STOP',
      generation: previousGeneration,
      documentToken: controller.documentToken
    }, {}, () => {});
    const sourceCountAfterStop = root.querySelectorAll('[data-fixture-source="true"]').length;
    const generatedCountAfterStop = root.querySelectorAll('[data-translight-generated="true"]').length;
    const metricIndex = sessionMetrics.length;
    const restartStartedAt = performance.now();
    const firstTimer = new Promise((resolve) => setTimeout(() => {
      const currentMetrics = sessionMetrics[metricIndex];
      resolve({
        elapsedMs: performance.now() - restartStartedAt,
        cacheHits: currentMetrics?.cacheHits ?? 0,
        resultApplications: currentMetrics?.resultApplications ?? 0
      });
    }, 0));
    await startControllerSession(generation);
    const firstTimerSnapshot = await firstTimer;
    await waitForCurrentRouteComplete();
    const currentMetrics = sessionMetrics.at(-1);
    const sourceCount = root.querySelectorAll('[data-fixture-source="true"]').length;
    const translationCount = root.querySelectorAll('translight-translation').length;
    return {
      restart,
      providerCallsBefore,
      providerCallsAfter: providerCalls.length,
      cacheHits: currentMetrics?.cacheHits ?? 0,
      resultApplications: currentMetrics?.resultApplications ?? 0,
      firstTimer: firstTimerSnapshot,
      sourceCountAfterStop,
      generatedCountAfterStop,
      sourceCount,
      translationCount,
      translationContentMismatches: currentTranslationContentMismatches(),
      removeAllMs: stoppedSessionMetric?.removeAllMs ?? [],
      stopMs: stoppedSessionMetric?.stopMs ?? null
    };
  };
  await startControllerSession(9603);
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
      translationContentMismatches: currentTranslationContentMismatches(),
      retiredQueues: session.retiredQueues?.size ?? 0
    });
  }

  // End on the home route so the following OFF → ON checks use the same
  // controller and its existing page-memory cache rather than a new fixture.
  await navigateRoute('home', {push: true});
  await scrollBurst(document.querySelector('#latest-news').offsetTop);
  await waitForCurrentRouteComplete();
  const navigationRectCalls = rectCalls - initialRectCalls;
  const providerCallCountBeforeRestart = providerCalls.length;
  const cacheSizeBeforeRestart = controller.translationCache.size;
  const restartSnapshots = [];
  const restartCount = 3;
  for (let restart = 1; restart <= restartCount; restart += 1) {
    const restartSnapshot = await restartCurrentSession(9603 + restart, restart);
    restartSnapshots.push(restartSnapshot);
    metrics.restartProbes.push(restartSnapshot);
  }

  // Use a small route with a known working set to exercise the warm-cache
  // result path without weakening the full homepage reproduction above.
  await navigateRoute('warm-cache-probe', {push: true});
  await waitForCurrentRouteComplete();
  const warmCacheProbeProviderCallsBefore = providerCalls.length;
  const warmCacheProbeCacheSizeBefore = controller.translationCache.size;
  const warmCacheProbeSnapshots = [];
  for (let restart = 1; restart <= restartCount; restart += 1) {
    const restartSnapshot = await restartCurrentSession(9700 + restart, restart);
    warmCacheProbeSnapshots.push(restartSnapshot);
    metrics.restartProbes.push({...restartSnapshot, route: 'warm-cache-probe'});
  }

  await navigateRoute('home', {push: true});
  await scrollBurst(document.querySelector('#latest-news').offsetTop);
  await waitForCurrentRouteComplete();

  const totalInteractionRectCalls = rectCalls - initialRectCalls;
  const allRecords = [...session.renderer.records.values()];
  const disconnectedRecordCount = allRecords.filter((record) => !record.element?.isConnected).length;
  const queueSortLengths = metrics.queueSortLengths;
  const allRestartSnapshots = [...restartSnapshots, ...warmCacheProbeSnapshots];
  const maxFirstTimerDelayMs = Math.max(
    ...allRestartSnapshots.map((snapshot) => snapshot.firstTimer.elapsedMs),
    0
  );
  const maxCollectionPhaseMs = Math.max(
    ...metrics.collectPhases.map((entry) => entry.durationMs),
    0
  );
  const maxRemoveAllMs = Math.max(...metrics.removeAllMs, 0);
  const translationContentMismatches = currentTranslationContentMismatches();
  const result = {
    fixture: 'metacritic-scroll-navigation-repro',
    path: 'translate → scroll Latest News → wait → scroll top → click New and Notable → scroll bottom → back/forward cycles',
    latestNewsTranslated,
    scrollEvents,
    providerCallCount: providerCalls.length,
    providerUniqueCount: new Set(providerCalls).size,
    providerMaxActive,
    providerConcurrencyBudget: PROVIDER_CONCURRENCY_BUDGET,
    translationCacheSize: controller.translationCache.size,
    cacheScenarios: {
      cold: {initialSessionGeneration: 9603, cacheSizeBeforeStart: 0},
      partial: {
        detailSourceCount: DETAIL_CARD_COUNT * BLOCKS_PER_CARD + 2,
        cacheSizeBeforeRestart,
        providerCallsBeforeRestart: providerCallCountBeforeRestart
      },
      warm: warmCacheProbeSnapshots.map(({restart, cacheHits, providerCallsBefore, providerCallsAfter}) => ({
        restart,
        cacheHits,
        providerCallsBefore,
        providerCallsAfter,
        sourceCount: WARM_CACHE_PROBE_BLOCK_COUNT + 1
      }))
    },
    warmCacheProbe: {
      sourceCount: WARM_CACHE_PROBE_BLOCK_COUNT + 1,
      cacheSizeBeforeRestart: warmCacheProbeCacheSizeBefore,
      providerCallsBeforeRestart: warmCacheProbeProviderCallsBefore,
      snapshots: warmCacheProbeSnapshots
    },
    interactionRectCalls: navigationRectCalls,
    totalInteractionRectCalls,
    restartRectCalls: totalInteractionRectCalls - navigationRectCalls,
    rectBudget: MAX_INTERACTION_RECT_CALLS,
    responseBudgets: {
      firstTimerDelayMs: MAX_FIRST_TIMER_DELAY_MS,
      collectionPhaseMs: MAX_COLLECTION_PHASE_MS,
      removeAllMs: MAX_REMOVE_ALL_MS,
      resultApplyMs: MAX_RESULT_APPLY_MS,
      longTaskMs: MAX_LONG_TASK_MS
    },
    responseMetrics: {
      maxFirstTimerDelayMs: Math.round(maxFirstTimerDelayMs * 100) / 100,
      maxCollectionPhaseMs: Math.round(maxCollectionPhaseMs * 100) / 100,
      maxRemoveAllMs: Math.round(maxRemoveAllMs * 100) / 100,
      maxResultApplyMs: Math.round(metrics.maxResultApplyMs * 100) / 100,
      longestMainThreadTask: Math.round(metrics.longestMainThreadTask * 100) / 100,
      longTaskBudgetApplied: metrics.longTaskSupported
    },
    rendererRecordCount: allRecords.length,
    disconnectedRecordCount,
    translationContentMismatches: currentTranslationContentMismatches(),
    queueState: {
      pending: session.queue?.pending.length ?? 0,
      active: session.queue?.active ?? 0,
      seen: session.queue?.seen.size ?? 0,
      cancelled: session.queue?.cancelled ?? true,
      retiredQueues: session.retiredQueues?.size ?? 0
    },
    restartSnapshots,
    phases: {
      sessionCount: sessionMetrics.length,
      sessions: sessionMetrics.map((sessionMetric) => ({
        generation: sessionMetric.generation,
        prepareMs: Math.round(sessionMetric.prepareMs * 100) / 100,
        collectPhases: sessionMetric.collectPhases.map((entry) => ({
          phase: entry.phase,
          blocks: entry.blocks,
          durationMs: Math.round(entry.durationMs * 100) / 100
        })),
        cacheHits: sessionMetric.cacheHits,
        resultApplications: sessionMetric.resultApplications,
        maxResultApplyMs: Math.round(sessionMetric.maxResultApplyMs * 100) / 100,
        stopMs: sessionMetric.stopMs == null ? null : Math.round(sessionMetric.stopMs * 100) / 100
      })),
      collectPhases: metrics.collectPhases,
      cacheHitResults: metrics.cacheHitResults,
      resultApplications: metrics.resultApplications,
      maxResultApplyMs: Math.round(metrics.maxResultApplyMs * 100) / 100,
      removeAllMs: metrics.removeAllMs.map((duration) => Math.round(duration * 100) / 100),
      longestMainThreadTask: Math.round(metrics.longestMainThreadTask * 100) / 100,
      longTaskCount: metrics.longTaskCount,
      longTaskSupported: metrics.longTaskSupported
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
      snapshot.recordCount === snapshot.translationCount &&
      snapshot.translationContentMismatches === 0
    ) && navigationRectCalls <= MAX_INTERACTION_RECT_CALLS &&
      allRecords.length === root.querySelectorAll('[data-fixture-source="true"]').length &&
      disconnectedRecordCount === 0 &&
      translationContentMismatches === 0 &&
      (session.queue?.pending.length ?? 0) === 0 &&
      (session.queue?.active ?? 0) === 0 &&
      providerActive === 0 &&
      providerMaxActive <= PROVIDER_CONCURRENCY_BUDGET &&
      maxFirstTimerDelayMs <= MAX_FIRST_TIMER_DELAY_MS &&
      maxCollectionPhaseMs <= MAX_COLLECTION_PHASE_MS &&
      maxRemoveAllMs <= MAX_REMOVE_ALL_MS &&
      metrics.maxResultApplyMs <= MAX_RESULT_APPLY_MS &&
      (!metrics.longTaskSupported || metrics.longestMainThreadTask <= MAX_LONG_TASK_MS) &&
      restartSnapshots.length === restartCount &&
      restartSnapshots.every((snapshot) =>
        snapshot.sourceCountAfterStop > 0 &&
        snapshot.generatedCountAfterStop === 0 &&
        snapshot.sourceCount === snapshot.translationCount &&
        snapshot.translationContentMismatches === 0 &&
        snapshot.firstTimer.cacheHits <= CACHE_RESULT_BATCH_SIZE
      ) &&
      warmCacheProbeSnapshots.length === restartCount &&
      warmCacheProbeSnapshots.every((snapshot) =>
        snapshot.sourceCount === WARM_CACHE_PROBE_BLOCK_COUNT + 1 &&
        snapshot.sourceCountAfterStop === WARM_CACHE_PROBE_BLOCK_COUNT + 1 &&
        snapshot.generatedCountAfterStop === 0 &&
        snapshot.sourceCount === snapshot.translationCount &&
        snapshot.translationContentMismatches === 0 &&
        snapshot.cacheHits === WARM_CACHE_PROBE_BLOCK_COUNT + 1 &&
        snapshot.providerCallsAfter === snapshot.providerCallsBefore &&
        snapshot.firstTimer.cacheHits <= CACHE_RESULT_BATCH_SIZE
      ) &&
      (!collectMetrics || metrics.recoveryScanCalls === 0)
  };

  await runtimeListener({
    type: 'TRANSLATION_STOP',
    generation: session.generation,
    documentToken: controller.documentToken
  }, {}, () => {});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  result.testPassed &&= result.restoredAfterStop;
  longTaskObserver?.disconnect?.();
  delete globalThis[CONTENT_CONTROLLER_KEY];
  delete globalThis[DOCUMENT_TOKEN_KEY];
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
