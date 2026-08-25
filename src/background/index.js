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
import { loadSettings, hostnameForUrl, matchesAutoTranslateSite, originForUrl } from '../settings.js';
import { shouldContinueManualTranslation as shouldContinueAfterNavigation } from './navigation.js';

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
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (secondError) {
      const error = new Error('The current tab cannot run Translight.', { cause: secondError ?? firstError });
      error.code = 'CONTENT_SCRIPT_UNAVAILABLE';
      throw error;
    }
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

async function startTranslation(tab, {activation = TAB_ACTIVATION.MANUAL, url = tab?.url, documentToken} = {}) {
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

  const state = getState(tabId);
  const url = message.url || sender?.tab?.url || '';
  const settings = await loadSettings();
  const currentHost = hostnameForUrl(url);
  const sameManualSite = shouldContinueAfterNavigation(state, url);
  const autoSite = matchesAutoTranslateSite(currentHost, settings.autoTranslateSites);

  if (state.documentToken === message.documentToken) return;
  if (state.documentToken == null && BUSY_STATUSES.has(state.status)) {
    await setState(tabId, {
      documentToken: message.documentToken,
      origin: state.origin || originForUrl(url),
      hostname: state.hostname || currentHost
    });
    return;
  }

  if (!sameManualSite && !autoSite) {
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
    void next;
    return;
  }

  const activation = sameManualSite ? TAB_ACTIVATION.MANUAL : TAB_ACTIVATION.AUTO;
  await startTranslation(
    {id: tabId, url},
    {activation, url, documentToken: message.documentToken}
  );
}

const ready = hydrate();

chrome.action.onClicked.addListener((tab) => {
  void handleAction(tab);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'TRANSLATION_STATUS') void handleTranslationStatus(message, sender);
  if (message?.type === 'CONTENT_READY') void handleContentReady(message, sender);
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  void (async () => {
    await ready;
    const state = getState(tabId);
    if (state.activation == null && state.status === TAB_STATUS.OFF && state.documentToken == null) return;
    let url = changeInfo.url || '';
    if (!url && chrome.tabs?.get) {
      try {
        url = (await chrome.tabs.get(tabId))?.url || '';
      } catch {
        url = '';
      }
    }
    const settings = await loadSettings();
    const sameManualSite = shouldContinueAfterNavigation(state, url);
    const autoSite = matchesAutoTranslateSite(hostnameForUrl(url), settings.autoTranslateSites);
    if (!sameManualSite && !autoSite) {
      await setState(tabId, {
        status: TAB_STATUS.OFF,
        generation: nextGeneration(),
        activation: null,
        documentToken: null,
        origin: null,
        hostname: hostnameForUrl(url) || null,
        modelState: null,
        progress: null,
        errorCode: null,
        errorMessage: null
      });
      await sendStopMessage(tabId, state.generation);
      return;
    }
    await setState(tabId, {
      status: TAB_STATUS.OFF,
      generation: nextGeneration(),
      documentToken: null,
      activation: sameManualSite ? TAB_ACTIVATION.MANUAL : TAB_ACTIVATION.AUTO,
      origin: state.origin || originForUrl(url),
      hostname: hostnameForUrl(url) || state.hostname,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
    await sendStopMessage(tabId, state.generation);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates = removeTabState(tabStates, tabId);
  void persist();
});
