import {afterEach, describe, expect, it, vi} from 'vitest';
import {SETTINGS_KEY} from '../src/settings.js';

const backgroundMessageListeners = [];
const updatedListeners = [];
const removedListeners = [];
const clickedListeners = [];
const iconCalls = [];
const badgeCalls = [];
const titleCalls = [];
const contentMessages = [];
let settings;
let runtimeMessage;

function makeArea(value) {
  return {
    get(_key, callback) {
      callback(value);
    },
    set(_value, callback) {
      callback?.();
    }
  };
}

function installChrome({
  autoTranslateSites = ['example.com'],
  statuses = ['ACTIVE'],
  autoTranslateSameSite = true,
  tabs = []
} = {}) {
  settings = {
    autoTranslateSameSite,
    autoTranslateSites
  };
  globalThis.chrome = {
    storage: {
      session: {get: async () => ({})},
      local: makeArea({[SETTINGS_KEY]: settings}),
      onChanged: {addListener: vi.fn()}
    },
    action: {
      onClicked: {addListener(listener) { clickedListeners.push(listener); }},
      setBadgeText: async (value) => badgeCalls.push(value),
      setTitle: async (value) => titleCalls.push(value),
      setIcon: async (value) => iconCalls.push(value)
    },
    runtime: {
      onMessage: {addListener(listener) { backgroundMessageListeners.push(listener); runtimeMessage = listener; }},
      openOptionsPage: async () => {}
    },
    tabs: {
      onUpdated: {addListener(listener) { updatedListeners.push(listener); }},
      onRemoved: {addListener(listener) { removedListeners.push(listener); }},
      query: async () => tabs,
      sendMessage: async (tabId, message) => {
        contentMessages.push({tabId, message});
        if (message.type === 'TRANSLATION_START') {
          statuses.forEach((status) => queueMicrotask(() => runtimeMessage?.({
            type: 'TRANSLATION_STATUS',
            status,
            generation: message.generation
          }, {tab: {id: tabId, url: 'https://example.com/page'}})));
        }
        return {ok: true};
      },
      get: async () => ({url: 'https://example.com/page'})
    }
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  vi.resetModules();
  delete globalThis.chrome;
  delete globalThis.__translight_test_harness__;
  backgroundMessageListeners.length = 0;
  updatedListeners.length = 0;
  removedListeners.length = 0;
  clickedListeners.length = 0;
  iconCalls.length = 0;
  badgeCalls.length = 0;
  titleCalls.length = 0;
  contentMessages.length = 0;
  runtimeMessage = null;
});

describe('background automatic translation status', () => {
  it('exposes a test-only toggle that follows the action handler state path', async () => {
    installChrome({autoTranslateSites: []});
    await import('../src/background/index.js?background-test-harness-toggle');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();
    globalThis.chrome.tabs.get = async () => ({id: 1, url: 'https://example.com/page'});

    const harness = globalThis.__translight_test_harness__;
    expect(harness).toBeTruthy();
    const started = await harness.toggle(1);
    await settle();
    const startMessage = contentMessages.find(({message}) => message.type === 'TRANSLATION_START')?.message;
    expect(startMessage).toMatchObject({
      type: 'TRANSLATION_START',
      activation: 'manual',
      documentToken: 'document-1'
    });
    expect(started.documentToken).toBe('document-1');

    const stopped = await harness.toggle(1);
    await settle();
    expect(contentMessages.at(-1)?.message).toMatchObject({
      type: 'TRANSLATION_STOP',
      generation: startMessage.generation,
      documentToken: 'document-1'
    });
    expect(stopped.status).toBe('OFF');
  });

  it('uses the active-tab injection fallback for a manual action', async () => {
    installChrome();
    const sendMessage = vi.spyOn(globalThis.chrome.tabs, 'sendMessage')
      .mockRejectedValueOnce(new Error('content script is not ready'))
      .mockResolvedValue({ok: true});
    const executeScript = vi.fn().mockResolvedValue([]);
    globalThis.chrome.scripting = {executeScript};

    await import('../src/background/index.js?background-manual-injection-fallback');
    await clickedListeners[0]({id: 1, url: 'https://example.com/page'});
    await settle();

    expect(executeScript).toHaveBeenCalledWith({
      target: {tabId: 1},
      files: ['content.js']
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not use the injection fallback for automatic translation', async () => {
    installChrome({tabs: [{id: 1, url: 'https://example.com/page'}]});
    const executeScript = vi.fn().mockResolvedValue([]);
    globalThis.chrome.scripting = {executeScript};
    vi.spyOn(globalThis.chrome.tabs, 'sendMessage')
      .mockRejectedValue(new Error('content script is not ready'));

    await import('../src/background/index.js?background-auto-no-injection-fallback');
    await settle();

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('shows a model-download tooltip while the model is downloading', async () => {
    installChrome({statuses: ['DOWNLOADING']});
    await import('../src/background/index.js?background-downloading-tooltip');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    expect(titleCalls.at(-1)?.title).toBe('Translight: The translation model is downloading.');
  });

  it('shows the active icon as soon as page blocks begin translating', async () => {
    installChrome({statuses: ['TRANSLATING']});
    await import('../src/background/index.js?background-translating-icon');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('keeps the active icon after an automatic site translation', async () => {
    installChrome();
    await import('../src/background/index.js?background-auto-site');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('turns off an automatic translation when the action is clicked', async () => {
    installChrome();
    await import('../src/background/index.js?background-auto-site-toggle');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/page'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');

    await clickedListeners[0]({id: 1, url: 'https://example.com/page'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('keeps an automatic translation off when content ready arrives after the action stop', async () => {
    installChrome({tabs: [{id: 1, url: 'https://example.com/page'}]});
    await import('../src/background/index.js?background-auto-site-late-ready');
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/page'});
    await settle();
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');

    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');

    await clickedListeners[0]({id: 1, url: 'https://example.com/page'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('keeps the active icon when a same-site navigation is processed after content is ready', async () => {
    installChrome({autoTranslateSites: []});
    await import('../src/background/index.js?background-late-loading');
    await clickedListeners[0]({id: 1, url: 'https://example.com/start'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');

    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-2',
      url: 'https://example.com/next'
    }, {tab: {id: 1, url: 'https://example.com/next'}});
    await settle();
    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/next'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('restarts a manual translation when a restored document has no live content session', async () => {
    installChrome({autoTranslateSites: []});
    await import('../src/background/index.js?background-bfcache-resume');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/questions'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/questions'});
    await settle();
    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(1);

    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/questions',
      resume: true,
      contentSessionActive: false
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(2);
  });

  it('adopts a live BFCache session without restarting it when continuation is enabled', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: true});
    await import('../src/background/index.js?background-bfcache-adopt-on');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/questions'});
    await settle();
    const startMessage = contentMessages.find(({message}) => message.type === 'TRANSLATION_START')?.message;
    expect(startMessage.documentToken).toBe('document-a');
    expect(startMessage.activation).toBe('manual');

    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/other'});
    await settle();
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions',
      resume: true,
      contentSessionActive: true,
      contentSessionGeneration: startMessage.generation,
      contentSessionStatus: 'ACTIVE',
      contentSessionActivation: 'manual'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(1);
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');

    await clickedListeners[0]({id: 1, url: 'https://example.com/questions'});
    await settle();
    expect(contentMessages.at(-1)?.message).toMatchObject({
      type: 'TRANSLATION_STOP',
      generation: startMessage.generation
    });
  });

  it('ignores a stale loading update after a BFCache document resumes', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: true});
    await import('../src/background/index.js?background-bfcache-stale-loading');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/questions'});
    await settle();
    const startMessage = contentMessages.find(({message}) => message.type === 'TRANSLATION_START')?.message;

    globalThis.chrome.tabs.get = async () => ({url: 'https://example.com/questions'});
    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/other'});
    await settle();
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions',
      resume: true,
      contentSessionActive: true,
      contentSessionGeneration: startMessage.generation,
      contentSessionStatus: 'ACTIVE',
      contentSessionActivation: 'manual'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');

    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/other'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_STOP')).toHaveLength(0);
  });

  it('processes a loading update without sending a tab-wide stop for a known document', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: true});
    await import('../src/background/index.js?background-current-loading');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/first'
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();
    await clickedListeners[0]({id: 1, url: 'https://example.com/first'});
    await settle();

    globalThis.chrome.tabs.get = async () => ({url: 'https://example.com/second'});
    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/second'});
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_STOP')).toHaveLength(0);
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');
  });

  it('ignores an older same-document route when back navigation has already won', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: true});
    await import('../src/background/index.js?background-stale-spa-route');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/first'
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();
    await clickedListeners[0]({id: 1, url: 'https://example.com/first'});
    await settle();

    runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      documentToken: 'document-a',
      url: 'https://other.example/second',
      routeGeneration: 1
    }, {tab: {id: 1, url: 'https://other.example/second'}});
    runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      documentToken: 'document-a',
      url: 'https://example.com/first',
      routeGeneration: 2
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(1);
    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_STOP')).toHaveLength(0);
    expect(contentMessages.at(-1)?.message).toMatchObject({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 2,
      continueTranslation: true,
      documentToken: 'document-a'
    });
  });

  it('stops a restored content session when same-site continuation is disabled', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: false});
    await import('../src/background/index.js?background-bfcache-adopt-off');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    await clickedListeners[0]({id: 1, url: 'https://example.com/questions'});
    await settle();
    const startMessage = contentMessages.find(({message}) => message.type === 'TRANSLATION_START')?.message;

    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/other'});
    await settle();
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-a',
      url: 'https://example.com/questions',
      resume: true,
      contentSessionActive: true,
      contentSessionGeneration: startMessage.generation,
      contentSessionStatus: 'ACTIVE',
      contentSessionActivation: 'manual'
    }, {tab: {id: 1, url: 'https://example.com/questions'}});
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(1);
    expect(contentMessages.at(-1)?.message).toMatchObject({
      type: 'TRANSLATION_STOP',
      generation: startMessage.generation
    });
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');
  });

  it('starts a registered-site translation when loading is handled before content is ready', async () => {
    installChrome();
    await import('../src/background/index.js?background-loading-first');
    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/page'});
    await settle();
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/page'
    }, {tab: {id: 1, url: 'https://example.com/page'}});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('tracks same-document automatic navigation before a late loading event', async () => {
    installChrome();
    await import('../src/background/index.js?background-spa-navigation');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/start'
    }, {tab: {id: 1, url: 'https://example.com/start'}});
    await settle();

    await runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      documentToken: 'document-1',
      url: 'https://example.com/next'
    }, {tab: {id: 1, url: 'https://example.com/next'}});
    await settle();
    await updatedListeners[0](1, {status: 'loading', url: 'https://example.com/next'});
    await settle();

    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('approves a same-origin SPA route without restarting an active manual session', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: true});
    await import('../src/background/index.js?background-spa-manual-allowed');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/first'
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();
    await clickedListeners[0]({id: 1, url: 'https://example.com/first'});
    await settle();

    await runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      previousUrl: 'https://example.com/first',
      currentUrl: 'https://example.com/second',
      url: 'https://example.com/second',
      documentToken: 'document-1',
      routeGeneration: 1
    }, {tab: {id: 1, url: 'https://example.com/second'}});
    await settle();

    expect(contentMessages.filter(({message}) => message.type === 'TRANSLATION_START')).toHaveLength(1);
    expect(contentMessages.at(-1)?.message).toMatchObject({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 1,
      continueTranslation: true
    });
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon-active16.png');
  });

  it('stops a manual SPA session when same-origin continuation is disabled', async () => {
    installChrome({autoTranslateSites: [], autoTranslateSameSite: false});
    await import('../src/background/index.js?background-spa-manual-disabled');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/first'
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();
    await clickedListeners[0]({id: 1, url: 'https://example.com/first'});
    await settle();

    await runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      previousUrl: 'https://example.com/first',
      currentUrl: 'https://example.com/second',
      url: 'https://example.com/second',
      documentToken: 'document-1',
      routeGeneration: 1
    }, {tab: {id: 1, url: 'https://example.com/second'}});
    await settle();

    expect(contentMessages.at(-2)?.message).toMatchObject({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 1,
      continueTranslation: false
    });
    expect(contentMessages.at(-1)?.message.type).toBe('TRANSLATION_STOP');
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');
  });

  it('stops automatic translation when an SPA route leaves the registered hostname', async () => {
    installChrome({autoTranslateSites: ['example.com']});
    await import('../src/background/index.js?background-spa-auto-escape');
    await runtimeMessage({
      type: 'CONTENT_READY',
      documentToken: 'document-1',
      url: 'https://example.com/first'
    }, {tab: {id: 1, url: 'https://example.com/first'}});
    await settle();

    await runtimeMessage({
      type: 'CONTENT_NAVIGATION',
      previousUrl: 'https://example.com/first',
      currentUrl: 'https://other.example/second',
      url: 'https://other.example/second',
      documentToken: 'document-1',
      routeGeneration: 1
    }, {tab: {id: 1, url: 'https://other.example/second'}});
    await settle();

    expect(contentMessages.at(-2)?.message).toMatchObject({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 1,
      continueTranslation: false
    });
    expect(contentMessages.at(-1)?.message.type).toBe('TRANSLATION_STOP');
    expect(iconCalls.at(-1)?.path?.[16]).toBe('icon16.png');
  });
});
