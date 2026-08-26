import {afterEach, describe, expect, it, vi} from 'vitest';
import {SETTINGS_KEY} from '../src/settings.js';

const backgroundMessageListeners = [];
const updatedListeners = [];
const removedListeners = [];
const clickedListeners = [];
const iconCalls = [];
const badgeCalls = [];
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

function installChrome({autoTranslateSites = ['example.com']} = {}) {
  settings = {
    autoTranslateSameSite: true,
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
      setTitle: async () => {},
      setIcon: async (value) => iconCalls.push(value)
    },
    runtime: {
      onMessage: {addListener(listener) { backgroundMessageListeners.push(listener); runtimeMessage = listener; }},
      openOptionsPage: async () => {}
    },
    tabs: {
      onUpdated: {addListener(listener) { updatedListeners.push(listener); }},
      onRemoved: {addListener(listener) { removedListeners.push(listener); }},
      query: async () => [],
      sendMessage: async (tabId, message) => {
        if (message.type === 'TRANSLATION_START') {
          queueMicrotask(() => runtimeMessage?.({
            type: 'TRANSLATION_STATUS',
            status: 'ACTIVE',
            generation: message.generation
          }, {tab: {id: tabId, url: 'https://example.com/page'}}));
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
  backgroundMessageListeners.length = 0;
  updatedListeners.length = 0;
  removedListeners.length = 0;
  clickedListeners.length = 0;
  iconCalls.length = 0;
  badgeCalls.length = 0;
  runtimeMessage = null;
});

describe('background automatic translation status', () => {
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
});
