// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.metacritic.com/"}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController,
  isMetacriticGalleryStateChange
} from '../src/content/controller.js';
import { PageSession } from '../src/content/page-session.js';
import { CACHE_RESULT_BATCH_SIZE } from '../src/content/translation-queue.js';

afterEach(() => {
  vi.useRealTimers();
  delete globalThis[CONTENT_CONTROLLER_KEY];
  delete globalThis[DOCUMENT_TOKEN_KEY];
});

function waitFor(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Timed out waiting for the controller fixture state.'));
        return;
      }
      setTimeout(check, 0);
    };
    check();
  });
}

describe('content navigation notifications', () => {
  it('does not restart translation for Metacritic gallery URLs updated by scroll', () => {
    history.replaceState({}, '', '/pictures/august-september-2026-game-preview/5');
    document.body.innerHTML = `
      <main>
        <div data-testid="gallery-item" slug="august-september-2026-game-preview" id="gallery-item-5"><p>Gallery item five.</p></div>
        <div data-testid="gallery-item" slug="august-september-2026-game-preview" id="gallery-item-6"><p>Gallery item six.</p></div>
      </main>
    `;
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage() {
        return Promise.resolve();
      }
    };
    const controller = installContentController({runtime});
    const session = {
      isNavigationWatching: () => true,
      beginRouteChange: vi.fn(),
      generation: 42,
      status: 'ACTIVE',
      activation: 'manual'
    };
    controller.currentSession = session;

    expect(isMetacriticGalleryStateChange({
      document,
      previousUrl: `${location.origin}/pictures/august-september-2026-game-preview/5`,
      currentUrl: `${location.origin}/pictures/august-september-2026-game-preview/6`
    })).toBe(true);

    history.replaceState({}, '', '/pictures/august-september-2026-game-preview/6');

    expect(controller.navigationHandler()).toBe(false);
    expect(controller.lastNavigationUrl).toBe(`${location.origin}/pictures/august-september-2026-game-preview/6`);
    expect(session.beginRouteChange).not.toHaveBeenCalled();
  });

  it('keeps ordinary Metacritic routes and unrelated gallery slugs navigable', () => {
    history.replaceState({}, '', '/pictures/august-september-2026-game-preview/5');
    document.body.innerHTML = `
      <main>
        <div data-testid="gallery-item" slug="august-september-2026-game-preview"><p>Gallery item five.</p></div>
        <div data-testid="gallery-item" slug="august-september-2026-game-preview"><p>Gallery item six.</p></div>
      </main>
    `;
    expect(isMetacriticGalleryStateChange({
      document,
      previousUrl: 'https://www.metacritic.com/pictures/august-september-2026-game-preview/5',
      currentUrl: 'https://www.metacritic.com/pictures/another-preview/6'
    })).toBe(false);
    document.querySelector('[data-testid="gallery-item"]').remove();
    expect(isMetacriticGalleryStateChange({
      document,
      previousUrl: 'https://www.metacritic.com/pictures/august-september-2026-game-preview/5',
      currentUrl: 'https://www.metacritic.com/pictures/august-september-2026-game-preview/6'
    })).toBe(false);
  });

  it('reports same-document hash navigation to the background', async () => {
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };

    const controller = installContentController({runtime});
    controller.currentSession = {
      isNavigationWatching: () => true,
      beginRouteChange: vi.fn(),
      generation: 42,
      status: 'ACTIVE',
      activation: 'manual'
    };
    history.pushState({}, '', '#Types');
    controller.navigationHandler();

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_NAVIGATION',
      previousUrl: `${location.origin}/wiki/Well-being`,
      currentUrl: `${location.origin}/wiki/Well-being#Types`,
      url: `${location.origin}/wiki/Well-being#Types`,
      documentToken: expect.any(String),
      routeGeneration: 1
    });
    expect(controller.currentSession.beginRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({routeGeneration: 1})
    );
    expect(controller.navigationHandler()).toBe(false);
  });

  it('reports its current location when automatic rules are refreshed', async () => {
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    let listener;
    const runtime = {
      onMessage: {
        addListener(next) {
          listener = next;
        }
      },
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };

    installContentController({runtime});
    listener({type: 'TRANSLATION_RULES_CHANGED'}, {}, () => {});
    await Promise.resolve();

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_RULES_CHANGED',
      documentToken: expect.any(String),
      url: `${location.origin}/wiki/Well-being`
    });
  });

  it('uses the session-scoped fallback watcher for pushState without patching history', () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const controller = installContentController({runtime});
    const session = {
      isNavigationWatching: () => true,
      beginRouteChange: vi.fn()
    };
    controller.currentSession = session;
    controller.startNavigationWatcher(session);

    history.pushState({}, '', '/wiki/Well-being#Types');
    vi.advanceTimersByTime(499);
    expect(messages.filter(({type}) => type === 'CONTENT_NAVIGATION')).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_NAVIGATION',
      previousUrl: `${location.origin}/wiki/Well-being`,
      currentUrl: `${location.origin}/wiki/Well-being#Types`,
      routeGeneration: 1
    });
    controller.stopNavigationWatcher();
    vi.useRealTimers();
  });

  it('keeps a cached session and sends a resume handshake on pageshow', () => {
    history.replaceState({}, '', '/questions');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const controller = installContentController({runtime});
    const session = {
      isNavigationWatching: () => true,
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      generation: 42,
      status: 'ACTIVE',
      activation: 'manual'
    };
    controller.currentSession = session;

    controller.pageLifecycleHandler({persisted: true});
    expect(session.stop).not.toHaveBeenCalled();
    expect(session.pause).toHaveBeenCalledTimes(1);

    controller.pageShowHandler({persisted: true});
    expect(session.resume).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_READY',
      documentToken: expect.any(String),
      url: `${location.origin}/questions`,
      resume: true,
      contentSessionActive: true,
      contentSessionGeneration: 42,
      contentSessionStatus: 'ACTIVE',
      contentSessionActivation: 'manual'
    });
    controller.stopNavigationWatcher();
  });

  it('pauses the real page session across a BFCache lifecycle', async () => {
    history.replaceState({}, '', '/questions');
    document.body.innerHTML = `
      <p>First BFCache paragraph.</p>
      <p>Second BFCache paragraph.</p>
    `;
    const messages = [];
    let resolveActive;
    let startListener;
    const runtime = {
      onMessage: {
        addListener(next) {
          startListener = next;
        }
      },
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const provider = {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: (text) => {
        if (text === 'First BFCache paragraph.') {
          return new Promise((resolve) => { resolveActive = resolve; });
        }
        return Promise.resolve(`ko:${text}`);
      },
      cancel: () => {},
      close: () => {}
    };
    const controller = installContentController({
      runtime,
      createSession: (options) => new PageSession({
        ...options,
        document,
        settings: {translatePageTitle: false},
        concurrency: 1,
        provider
      })
    });

    try {
      await startListener({
        type: 'TRANSLATION_START',
        generation: 77,
        documentToken: controller.documentToken
      }, {}, () => {});
      for (let attempt = 0; attempt < 20 &&
          (!controller.currentSession?.queue || typeof resolveActive !== 'function'); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const session = controller.currentSession;
      expect(session?.queue).toBeTruthy();

      const pagehide = new Event('pagehide');
      Object.defineProperty(pagehide, 'persisted', {value: true});
      globalThis.dispatchEvent(pagehide);
      expect(session.paused).toBe(true);
      expect(session.queue.paused).toBe(true);
      resolveActive('ko:First BFCache paragraph.');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.queue.pending).toHaveLength(1);

      const pageshow = new Event('pageshow');
      Object.defineProperty(pageshow, 'persisted', {value: true});
      globalThis.dispatchEvent(pageshow);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await session.runPromise;
      expect(session.paused).toBe(false);
      expect(messages.some((message) => message.type === 'CONTENT_READY' && message.resume)).toBe(true);
      expect(document.querySelectorAll('translight-translation')).toHaveLength(2);
    } finally {
      controller.currentSession?.stop({notify: false});
    }
  });

  it('reuses the controller cache across route changes and OFF/ON restarts', async () => {
    history.replaceState({}, '', '/metacritic/home');
    const homeTexts = Array.from({length: 48}, (_, index) =>
      `Home Latest News item ${index + 1} has enough English text to translate.`
    );
    const detailTexts = Array.from({length: 16}, (_, index) =>
      `Detail review item ${index + 1} has enough English text to translate.`
    );
    const render = (texts) => {
      document.body.innerHTML = texts.map((text) => `<p>${text}</p>`).join('');
    };
    render(homeTexts);

    const messages = [];
    let listener;
    const providerCalls = [];
    const sessionMetrics = [];
    const runtime = {
      onMessage: {
        addListener(next) {
          listener = next;
        }
      },
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const providerForSession = () => ({
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        providerCalls.push(text);
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    });
    const controller = installContentController({
      runtime,
      createSession: (options) => {
        const metrics = {cacheHits: 0, results: 0};
        const session = new PageSession({
          ...options,
          document,
          observe: true,
          settings: {translatePageTitle: false},
          provider: providerForSession()
        });
        const createQueue = session.createQueue.bind(session);
        session.createQueue = (signal) => {
          createQueue(signal);
          const onResult = session.queue.onResult;
          session.queue.onResult = (block, value, metadata) => {
            metrics.results += 1;
            if (metadata?.fromCache) metrics.cacheHits += 1;
            return onResult(block, value, metadata);
          };
        };
        sessionMetrics.push(metrics);
        return session;
      }
    });

    await controller.settingsReady;
    controller.stopNavigationWatcher();

    const start = async (generation) => {
      await listener({
        type: 'TRANSLATION_START',
        generation,
        documentToken: controller.documentToken
      }, {}, () => {});
      const session = controller.currentSession;
      await session.runPromise;
      expect(document.querySelectorAll('translight-translation')).toHaveLength(homeTexts.length);
      controller.stopNavigationWatcher();
      return session;
    };
    const navigate = async (url, texts) => {
      history.pushState({}, '', url);
      expect(controller.navigationHandler()).toBe(true);
      const route = messages.at(-1);
      render(texts);
      await Promise.resolve();
      await listener({
        type: 'TRANSLATION_ROUTE',
        documentToken: controller.documentToken,
        routeGeneration: route.routeGeneration,
        continueTranslation: true
      }, {}, () => {});
      await waitFor(() => document.querySelectorAll('translight-translation').length === texts.length);
      controller.stopNavigationWatcher();
    };

    try {
      await start(1);
      const providerCallCountBeforeRoutes = providerCalls.length;

      await navigate('/metacritic/detail/star-wars-zero-company', detailTexts);
      await navigate('/metacritic/home', homeTexts);
      expect(providerCalls.length).toBeGreaterThan(providerCallCountBeforeRoutes);
      const providerCallCountBeforeRestart = providerCalls.length;

      for (let generation = 2; generation <= 4; generation += 1) {
        await listener({
          type: 'TRANSLATION_STOP',
          generation: generation - 1,
          documentToken: controller.documentToken
        }, {}, () => {});
        expect(document.querySelectorAll('translight-translation')).toHaveLength(0);

        const metricsBeforeRestart = sessionMetrics.length;
        const firstTimer = new Promise((resolve) =>
          setTimeout(() => resolve(sessionMetrics[metricsBeforeRestart]?.cacheHits ?? 0), 0)
        );
        await start(generation);
        const cacheHitsBeforeFirstTimer = await firstTimer;

        expect(cacheHitsBeforeFirstTimer).toBeLessThanOrEqual(CACHE_RESULT_BATCH_SIZE);
        expect(sessionMetrics.at(-1).cacheHits).toBe(homeTexts.length);
        expect(providerCalls.length).toBe(providerCallCountBeforeRestart);
        expect(document.querySelectorAll('translight-translation')).toHaveLength(homeTexts.length);
      }
    } finally {
      controller.currentSession?.stop({notify: false});
      controller.stopNavigationWatcher();
    }
  });
});
