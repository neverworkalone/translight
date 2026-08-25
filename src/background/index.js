import {
  BUSY_STATUSES,
  createTabState,
  normalizeTabStates,
  removeTabState,
  TAB_ACTIVATION,
  TAB_STATUS,
  updateTabState
} from './tab-state.js';
import { t } from '../i18n/index.js';
import { loadSettings, hostnameForUrl, originForUrl } from '../settings.js';
import { classifyNavigation, createLoadingStatePatch } from './navigation.js';

const STORAGE_KEY = 'translight.tabStates';
const DEFAULT_ICON_PATHS = Object.freeze({
  16: 'icon16.png',
  32: 'icon32.png',
  48: 'icon48.png',
  128: 'icon128.png'
});

const ACTIVE_ICON_PATHS = Object.freeze({
  16: 'icon-active16.png',
  32: 'icon-active32.png',
  48: 'icon-active48.png',
  128: 'icon-active128.png'
});

const ERROR_ICON_PATHS = Object.freeze({
  16: 'icon-error16.png',
  32: 'icon-error32.png',
  48: 'icon-error48.png',
  128: 'icon-error128.png'
});

const ERROR_MESSAGE_KEYS = Object.freeze({
  AVAILABILITY_FAILED: 'errorAvailabilityFailed',
  CONTENT_SCRIPT_UNAVAILABLE: 'errorContentScriptUnavailable',
  DOWNLOAD_FAILED: 'errorModelDownloadFailed',
  NOT_READY: 'errorTranslatorNotReady',
  TRANSLATE_FAILED: 'errorTranslateFailed',
  TRANSLATION_FAILED: 'errorTranslationFailed',
  UNAVAILABLE: 'errorTranslatorUnavailable'
});

let tabStates = {};
let generationSequence = Date.now();
const tabOperationChains = new Map();

function getSessionStorage() {
  return globalThis.chrome?.storage?.session ?? null;
}

async function hydrate() {
  const storage = getSessionStorage();
  if (!storage?.get) return;
  try {
    const result = await storage.get(STORAGE_KEY);
    tabStates = normalizeTabStates(result?.[STORAGE_KEY]);
    await Promise.all(Object.keys(tabStates).map((tabId) => refreshAction(Number(tabId), tabStates[tabId])));
  } catch {
    tabStates = {};
  }
}

async function persist() {
  const storage = getSessionStorage();
  if (!storage?.set) return;
  await storage.set({ [STORAGE_KEY]: tabStates });
}

function nextGeneration() {
  generationSequence += 1;
  return generationSequence;
}

function getState(tabId) {
  return tabStates[String(tabId)] ?? createTabState();
}

function enqueueTabOperation(tabId, operation) {
  const key = String(tabId);
  const previous = tabOperationChains.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation).catch((error) => {
    console.error('Translight tab operation failed.', error);
  });
  tabOperationChains.set(key, current);
  void current.then(() => {
    if (tabOperationChains.get(key) === current) tabOperationChains.delete(key);
  }, () => {
    if (tabOperationChains.get(key) === current) tabOperationChains.delete(key);
  });
  return current;
}

function getLocalizedError(state) {
  return t(ERROR_MESSAGE_KEYS[state.errorCode] ?? 'errorTranslationFailed');
}

async function refreshAction(tabId, state) {
  if (!globalThis.chrome?.action) return;
  let title = t('actionStartTitle');

  if (BUSY_STATUSES.has(state.status)) {
    title = t('actionCancelTitle');
  } else if (state.status === TAB_STATUS.ACTIVE) {
    title = t('actionActiveTitle');
  } else if (state.status === TAB_STATUS.ERROR) {
    title = t('actionErrorTitle', getLocalizedError(state));
  }

  const operations = [
    chrome.action.setBadgeText({ tabId, text: '' }),
    chrome.action.setTitle({ tabId, title })
  ];
  if (chrome.action.setIcon) {
    operations.push(
      chrome.action.setIcon({
        tabId,
        path:
          state.status === TAB_STATUS.ACTIVE
            ? ACTIVE_ICON_PATHS
            : state.status === TAB_STATUS.ERROR
              ? ERROR_ICON_PATHS
              : DEFAULT_ICON_PATHS
      })
    );
  }
  await Promise.all(operations);
}

async function setState(tabId, patch) {
  tabStates = updateTabState(tabStates, tabId, patch);
  await persist();
  await refreshAction(tabId, tabStates[String(tabId)]);
  return tabStates[String(tabId)];
}

async function sendContentMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (cause) {
    const error = new Error('The current tab cannot run Translight.', {cause});
    error.code = 'CONTENT_SCRIPT_UNAVAILABLE';
    throw error;
  }
}

async function sendStopMessage(tabId, generation) {
  try {
    await chrome.tabs.sendMessage(tabId, {type: 'TRANSLATION_STOP', generation});
  } catch {
    // Navigation may have already destroyed the content page.
  }
}

function isBusyOrActive(state) {
  return state.status === TAB_STATUS.ACTIVE || BUSY_STATUSES.has(state.status);
}

async function startTranslation(tab, {
  activation = TAB_ACTIVATION.MANUAL,
  url = tab?.url,
  documentToken
} = {}) {
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return;

  const generation = nextGeneration();
  const current = getState(tabId);
  await setState(tabId, {
    status: TAB_STATUS.CHECKING,
    generation,
    activation,
    origin: originForUrl(url) || current.origin,
    hostname: hostnameForUrl(url) || current.hostname,
    documentToken: documentToken ?? current.documentToken,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null
  });

  try {
    await sendContentMessage(tabId, { type: 'TRANSLATION_START', generation });
  } catch (error) {
    await setState(tabId, {
      status: TAB_STATUS.ERROR,
      errorCode: error.code ?? 'CONTENT_SCRIPT_UNAVAILABLE',
      errorMessage: error.message
    });
  }
}

async function stopTranslation(tabId, state) {
  const invalidationGeneration = nextGeneration();
  await setState(tabId, {
    status: TAB_STATUS.OFF,
    generation: invalidationGeneration,
    activation: null,
    origin: null,
    hostname: null,
    progress: null,
    errorCode: null,
    errorMessage: null
  });

  try {
    await sendContentMessage(tabId, {
      type: 'TRANSLATION_STOP',
      generation: state.generation
    });
  } catch {
    // Keep the background state OFF when the page is gone or the content script cannot run.
  }
}

async function handleAction(tab) {
  await ready;
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return;
  const state = getState(tabId);
  if (isBusyOrActive(state)) {
    await stopTranslation(tabId, state);
  } else {
    await startTranslation(tab);
  }
}

async function handleTranslationStatus(message, sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number') return;
  const state = getState(tabId);
  if (message.generation !== state.generation) return;

  const patch = {
    status: message.status,
    origin: message.origin ?? state.origin,
    hostname: hostnameForUrl(message.origin ?? state.origin) || state.hostname,
    modelState: message.modelState ?? state.modelState,
    progress: message.progress ?? state.progress,
    errorCode: message.errorCode ?? null,
    errorMessage: message.errorMessage ?? null
  };
  await setState(tabId, patch);

  if (message.status === TAB_STATUS.ERROR && message.openOptions) {
    await chrome.runtime.openOptionsPage();
  }
}

async function handleContentReady(message, sender) {
  await ready;
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number' || !message.documentToken) return;

  const url = typeof message.url === 'string' ? message.url : '';
  if (!url) return;
  const initialState = getState(tabId);
  if (initialState.documentToken === message.documentToken) return;
  const settings = await loadSettings();
  const state = getState(tabId);
  const currentHost = hostnameForUrl(url);
  const navigation = classifyNavigation({
    state,
    url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });

  if (state.documentToken === message.documentToken) return;
  if (state.documentToken == null && BUSY_STATUSES.has(state.status)) {
    await setState(tabId, {
      documentToken: message.documentToken,
      origin: state.origin || originForUrl(url),
      hostname: state.hostname || currentHost
    });
    return;
  }

  if (!navigation.translate) {
    const previousGeneration = state.generation;
    const wasRunning = isBusyOrActive(state);
    const next = await setState(tabId, {
      status: TAB_STATUS.OFF,
      generation: nextGeneration(),
      activation: null,
      documentToken: message.documentToken,
      origin: null,
      hostname: currentHost || null,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
    if (wasRunning) await sendStopMessage(tabId, previousGeneration);
    void next;
    return;
  }

  await startTranslation(
    {id: tabId, url},
    {
      activation: navigation.activation,
      url,
      documentToken: message.documentToken
    }
  );
}

async function handleContentRulesChanged(message, sender) {
  await ready;
  const tabId = sender?.tab?.id;
  const url = typeof message.url === 'string' ? message.url : '';
  if (typeof tabId !== 'number' || !url) return;

  const settings = await loadSettings();
  const state = getState(tabId);
  const navigation = classifyNavigation({
    state,
    url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });

  if (navigation.translate) {
    if (isBusyOrActive(state)) return;
    if (state.activation === TAB_ACTIVATION.MANUAL && state.status !== TAB_STATUS.ERROR) return;
    await startTranslation(
      {id: tabId, url},
      {
        activation: navigation.activation,
        url,
        documentToken: message.documentToken
      }
    );
    return;
  }

  if (state.activation === TAB_ACTIVATION.AUTO && state.status !== TAB_STATUS.OFF) {
    await stopTranslation(tabId, state);
  }
}

async function handleContentNavigation(message, sender) {
  await ready;
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number' || !message.documentToken || !message.url) return;

  const state = getState(tabId);
  if (state.documentToken && state.documentToken !== message.documentToken) return;
  // SKIPPED only describes the last route. A SPA can replace a target-language
  // view with a foreign-language view without creating a new document.
  if (isBusyOrActive(state)) return;

  const settings = await loadSettings();
  const navigation = classifyNavigation({
    state,
    url: message.url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });
  if (!navigation.translate) return;

  await startTranslation(
    {id: tabId, url: message.url},
    {
      activation: navigation.activation,
      url: message.url,
      documentToken: message.documentToken
    }
  );
}

async function handleTabUpdated(tabId, changeInfo) {
  await ready;
  if (changeInfo.status !== 'loading') return;
  const state = getState(tabId);
  if (state.status === TAB_STATUS.OFF && state.documentToken == null) return;

  await setState(tabId, createLoadingStatePatch(state, nextGeneration()));
  await sendStopMessage(tabId, state.generation);
}

const ready = hydrate();

async function syncAutomaticTranslationRules() {
  if (!chrome.tabs?.query) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab?.id !== 'number') return;
    try {
      await sendContentMessage(tab.id, {type: 'TRANSLATION_RULES_CHANGED'});
    } catch {
      // Tabs without a Translight content script are not eligible for a refresh.
    }
  }));
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName && areaName !== 'local') return;
  if (!changes?.['translight.settings.v1']) return;
  void ready.then(() => syncAutomaticTranslationRules());
});

// Re-apply saved rules when the service worker wakes up after an extension
// reload or browser restart. CONTENT_READY handles new documents, while this
// pass also covers already-open tabs whose content script is still present.
void ready.then(() => syncAutomaticTranslationRules());

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  if (typeof tabId === 'number') void enqueueTabOperation(tabId, () => handleAction(tab));
  else void handleAction(tab);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender?.tab?.id;
  if (message?.type === 'TRANSLATION_STATUS' && typeof tabId === 'number') {
    void enqueueTabOperation(tabId, () => handleTranslationStatus(message, sender));
  }
  if (message?.type === 'CONTENT_READY' && typeof tabId === 'number') {
    void enqueueTabOperation(tabId, () => handleContentReady(message, sender));
  }
  if (message?.type === 'CONTENT_RULES_CHANGED' && typeof tabId === 'number') {
    void enqueueTabOperation(tabId, () => handleContentRulesChanged(message, sender));
  }
  if (message?.type === 'CONTENT_NAVIGATION' && typeof tabId === 'number') {
    void enqueueTabOperation(tabId, () => handleContentNavigation(message, sender));
  }
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  void enqueueTabOperation(tabId, () => handleTabUpdated(tabId, changeInfo));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates = removeTabState(tabStates, tabId);
  tabOperationChains.delete(String(tabId));
  void persist();
});
