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
import {
  classifyNavigation,
  createLoadingStatePatch,
  documentUrlForUrl,
  isNavigationStateCurrent
} from './navigation.js';

const STORAGE_KEY = 'translight.tabStates';
export const TEST_HARNESS_KEY = '__translight_test_harness__';
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

const ACTIVE_ICON_STATUSES = new Set([TAB_STATUS.TRANSLATING, TAB_STATUS.ACTIVE]);

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
// Full document URLs are only needed to identify a late loading event. Keep
// them out of persisted tab state because URLs may contain private paths or
// query parameters.
const documentUrls = new Map();
// Route messages can be queued while the user goes back/forward again. Keep
// only the newest generation for the current document so an older route
// cannot stop or restart the live session after a newer route has won.
const latestContentRoutes = new Map();

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

function rememberDocumentUrl(tabId, url) {
  const documentUrl = documentUrlForUrl(url);
  if (documentUrl) documentUrls.set(String(tabId), documentUrl);
  return documentUrl;
}

function rememberContentRoute(tabId, message) {
  if (!Number.isInteger(message?.routeGeneration) || !message?.documentToken) return;
  const state = getState(tabId);
  if (state.documentToken && state.documentToken !== message.documentToken) return;
  const key = String(tabId);
  const current = latestContentRoutes.get(key);
  if (!current || current.documentToken !== message.documentToken ||
      message.routeGeneration > current.routeGeneration) {
    latestContentRoutes.set(key, {
      documentToken: message.documentToken,
      routeGeneration: message.routeGeneration
    });
  }
}

function isLatestContentRoute(tabId, message) {
  if (!Number.isInteger(message?.routeGeneration)) return true;
  const current = latestContentRoutes.get(String(tabId));
  return !current || current.documentToken !== message.documentToken ||
    message.routeGeneration >= current.routeGeneration;
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
    title = state.status === TAB_STATUS.DOWNLOADING
      ? t('actionDownloadingTitle')
      : t('actionCancelTitle');
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
          ACTIVE_ICON_STATUSES.has(state.status)
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

async function sendContentMessage(tabId, message, {allowInjection = false} = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    if (!allowInjection) throw firstError;
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

async function sendStopMessage(tabId, generation, documentToken) {
  try {
    const message = {type: 'TRANSLATION_STOP'};
    if (Number.isInteger(generation)) message.generation = generation;
    if (documentToken != null) message.documentToken = documentToken;
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Navigation may have already destroyed the content page.
  }
}

async function sendRouteDecision(tabId, routeGeneration, continueTranslation, documentToken) {
  if (!Number.isInteger(routeGeneration)) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'TRANSLATION_ROUTE',
      routeGeneration,
      continueTranslation: continueTranslation === true,
      ...(documentToken != null ? {documentToken} : {})
    });
  } catch {
    // The content page may disappear while the background is deciding policy.
  }
}

function isBusyOrActive(state) {
  return state.status === TAB_STATUS.ACTIVE || BUSY_STATUSES.has(state.status);
}

const RESUMABLE_CONTENT_STATUSES = new Set([
  TAB_STATUS.CHECKING,
  TAB_STATUS.DOWNLOADING,
  TAB_STATUS.TRANSLATING,
  TAB_STATUS.ACTIVE,
  TAB_STATUS.SKIPPED
]);

function resumedContentStatus(message) {
  return RESUMABLE_CONTENT_STATUSES.has(message.contentSessionStatus)
    ? message.contentSessionStatus
    : TAB_STATUS.ACTIVE;
}

function resumedContentActivation(message, fallback) {
  return message.contentSessionActivation === TAB_ACTIVATION.MANUAL ||
    message.contentSessionActivation === TAB_ACTIVATION.AUTO
    ? message.contentSessionActivation
    : fallback;
}

async function startTranslation(tab, {
  activation = TAB_ACTIVATION.MANUAL,
  url = tab?.url,
  documentToken,
  routeGeneration
} = {}) {
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return;

  const current = getState(tabId);
  const targetDocumentToken = documentToken ?? current.documentToken;
  const isNewDocument = targetDocumentToken != null &&
    current.documentToken != null &&
    current.documentToken !== targetDocumentToken;
  const autoTranslateSuppressed = isNewDocument ? false : current.autoTranslateSuppressed;
  if (activation === TAB_ACTIVATION.AUTO && autoTranslateSuppressed) return;
  const generation = nextGeneration();
  rememberDocumentUrl(tabId, url);
  await setState(tabId, {
    status: TAB_STATUS.CHECKING,
    generation,
    activation,
    origin: originForUrl(url) || current.origin,
    hostname: hostnameForUrl(url) || current.hostname,
    documentToken: targetDocumentToken,
    autoTranslateSuppressed: activation === TAB_ACTIVATION.MANUAL
      ? false
      : autoTranslateSuppressed,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null
  });

  try {
    await sendContentMessage(
      tabId,
      {
        type: 'TRANSLATION_START',
        generation,
        activation,
        ...(targetDocumentToken != null ? {documentToken: targetDocumentToken} : {}),
        ...(Number.isInteger(routeGeneration) ? {routeGeneration} : {})
      },
      {allowInjection: activation === TAB_ACTIVATION.MANUAL}
    );
  } catch (error) {
    await setState(tabId, {
      status: TAB_STATUS.ERROR,
      errorCode: error.code ?? 'CONTENT_SCRIPT_UNAVAILABLE',
      errorMessage: error.message
    });
  }
}

async function stopTranslation(tabId, state, {suppressAutomatic = false} = {}) {
  const invalidationGeneration = nextGeneration();
  await setState(tabId, {
    status: TAB_STATUS.OFF,
    generation: invalidationGeneration,
    activation: null,
    origin: null,
    hostname: null,
    autoTranslateSuppressed: suppressAutomatic,
    progress: null,
    errorCode: null,
    errorMessage: null
  });

  try {
    await sendContentMessage(tabId, {
      type: 'TRANSLATION_STOP',
      generation: state.generation,
      ...(state.documentToken != null ? {documentToken: state.documentToken} : {})
    });
  } catch {
    // Keep the background state OFF when the page is gone or the content script cannot run.
  }
}

async function handleAction(tab) {
  await ready;
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return null;
  const state = getState(tabId);
  if (isBusyOrActive(state)) {
    await stopTranslation(tabId, state, {suppressAutomatic: true});
  } else {
    await startTranslation(tab);
  }
  return {...getState(tabId)};
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

  const url = message.url || sender?.tab?.url || '';
  const initialState = getState(tabId);
  const isResume = message.resume === true;
  if (initialState.documentToken === message.documentToken && !isResume) {
    rememberDocumentUrl(tabId, url);
    return;
  }
  const settings = await loadSettings();
  let state = getState(tabId);
  const currentHost = hostnameForUrl(url);
  const documentUrl = documentUrlForUrl(url);
  const knownDocumentUrl = documentUrls.get(String(tabId));
  const isDifferentDocument = (state.documentToken &&
      state.documentToken !== message.documentToken) ||
    (!state.documentToken && documentUrl && knownDocumentUrl && documentUrl !== knownDocumentUrl);
  if (state.autoTranslateSuppressed && isDifferentDocument) {
    state = await setState(tabId, {autoTranslateSuppressed: false});
  }
  const navigation = classifyNavigation({
    state,
    url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });

  if (state.documentToken === message.documentToken && !isResume) {
    rememberDocumentUrl(tabId, url);
    return;
  }
  if (!isResume && state.documentToken === message.documentToken && message.contentSessionActive === true &&
      (isBusyOrActive(state) || state.status === TAB_STATUS.SKIPPED)) {
    rememberDocumentUrl(tabId, url);
    return;
  }
  const hasResumedContentSession = isResume && message.contentSessionActive === true;
  const resumedGeneration = Number.isInteger(message.contentSessionGeneration)
    ? message.contentSessionGeneration
    : null;
  if (hasResumedContentSession && !navigation.translate) {
    rememberDocumentUrl(tabId, url);
    await setState(tabId, {
      status: TAB_STATUS.OFF,
      generation: nextGeneration(),
      activation: null,
      documentToken: message.documentToken,
      origin: null,
      hostname: currentHost || null,
      autoTranslateSuppressed: false,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
    await sendStopMessage(tabId, resumedGeneration, message.documentToken);
    return;
  }
  if (hasResumedContentSession && navigation.translate && resumedGeneration != null) {
    rememberDocumentUrl(tabId, url);
    await setState(tabId, {
      status: resumedContentStatus(message),
      generation: resumedGeneration,
      activation: resumedContentActivation(message, navigation.activation),
      origin: originForUrl(url) || state.origin,
      hostname: currentHost || state.hostname,
      documentToken: message.documentToken,
      autoTranslateSuppressed: false,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
    return;
  }
  if (state.autoTranslateSuppressed && navigation.translate) {
    rememberDocumentUrl(tabId, url);
    await setState(tabId, {
      status: TAB_STATUS.OFF,
      activation: null,
      documentToken: message.documentToken,
      origin: null,
      hostname: currentHost || null,
      autoTranslateSuppressed: true,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
    return;
  }
  if (state.documentToken == null && BUSY_STATUSES.has(state.status)) {
    rememberDocumentUrl(tabId, url);
    await setState(tabId, {
      documentToken: message.documentToken,
      origin: state.origin || originForUrl(url),
      hostname: state.hostname || currentHost
    });
    return;
  }

  if (!navigation.translate) {
    rememberDocumentUrl(tabId, url);
    const next = await setState(tabId, {
      status: TAB_STATUS.OFF,
      generation: nextGeneration(),
      activation: null,
      documentToken: message.documentToken,
      origin: null,
      hostname: currentHost || null,
      autoTranslateSuppressed: false,
      modelState: null,
      progress: null,
      errorCode: null,
      errorMessage: null
    });
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
  let state = getState(tabId);
  if (state.autoTranslateSuppressed &&
      state.documentToken &&
      message.documentToken &&
      state.documentToken !== message.documentToken) {
    state = await setState(tabId, {autoTranslateSuppressed: false});
  }
  const navigation = classifyNavigation({
    state,
    url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });

  if (navigation.translate) {
    if (isBusyOrActive(state)) return;
    if (state.autoTranslateSuppressed) return;
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

  let state = getState(tabId);
  if (state.documentToken && state.documentToken !== message.documentToken) return;
  if (!isLatestContentRoute(tabId, message)) return;
  if (state.autoTranslateSuppressed) {
    const currentUrl = documentUrlForUrl(message.url);
    const suppressedUrl = documentUrls.get(String(tabId));
    if (!suppressedUrl || currentUrl === suppressedUrl) {
      await sendRouteDecision(tabId, message.routeGeneration, false, message.documentToken);
      return;
    }
    state = await setState(tabId, {autoTranslateSuppressed: false});
  }
  rememberDocumentUrl(tabId, message.url);

  const settings = await loadSettings();
  const navigation = classifyNavigation({
    state,
    url: message.url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });

  if (!navigation.translate) {
    await sendRouteDecision(tabId, message.routeGeneration, false, message.documentToken);
    if (state.status !== TAB_STATUS.OFF || state.activation != null || state.documentToken != null) {
      await stopTranslation(tabId, state);
    }
    return;
  }

  // SKIPPED is a live watch-only PageSession. Keep it alive so the content
  // layer can prepare the provider only when the new route yields English.
  if (isBusyOrActive(state) || state.status === TAB_STATUS.SKIPPED) {
    await sendRouteDecision(tabId, message.routeGeneration, true, message.documentToken);
    return;
  }

  await startTranslation(
    {id: tabId, url: message.url},
    {
      activation: navigation.activation,
      url: message.url,
      documentToken: message.documentToken,
      routeGeneration: message.routeGeneration
    }
  );
}

async function handleTabUpdated(tabId, changeInfo) {
  await ready;
  let state = getState(tabId);
  const initialGeneration = state.generation;
  const initialDocumentToken = state.documentToken;
  const eventUrl = changeInfo.url || '';
  let url = eventUrl;
  if (state.documentToken && chrome.tabs?.get) {
    try {
      const currentTabUrl = (await chrome.tabs.get(tabId))?.url || '';
      if (eventUrl && currentTabUrl &&
          documentUrlForUrl(eventUrl) !== documentUrlForUrl(currentTabUrl)) return;
      if (!url) url = currentTabUrl;
    } catch {
      // Fall back to the event URL when the tab disappears during navigation.
    }
  } else if (!url && chrome.tabs?.get) {
    try {
      url = (await chrome.tabs.get(tabId))?.url || '';
    } catch {
      url = '';
    }
  }
  if (!url) return;
  const settings = await loadSettings();
  const latestState = getState(tabId);
  if (!isNavigationStateCurrent(
    {generation: initialGeneration, documentToken: initialDocumentToken},
    latestState
  )) return;
  state = latestState;

  if (state.documentToken &&
      documentUrls.get(String(tabId)) === documentUrlForUrl(url)) {
    // The current document already reported this URL. The loading event is a
    // late duplicate, including hash-only updates, so CONTENT_READY and the
    // content route watcher remain the owners of the live session.
    return;
  }

  const navigation = classifyNavigation({
    state,
    url,
    autoTranslateSites: settings.autoTranslateSites,
    autoTranslateSameSite: settings.autoTranslateSameSite
  });
  if (navigation.translate) {
    if (state.activation == null && state.status === TAB_STATUS.OFF &&
        state.documentToken == null && !state.autoTranslateSuppressed) return;

    const loadingState = createLoadingStatePatch(state, nextGeneration());
    await setState(tabId, {
      ...loadingState,
      activation: navigation.activation,
      origin: state.origin || originForUrl(url),
      hostname: navigation.hostname || state.hostname
    });
    documentUrls.delete(String(tabId));
    if (initialDocumentToken == null) await sendStopMessage(tabId, state.generation, state.documentToken);
    return;
  }
  const loadingState = createLoadingStatePatch(state, nextGeneration());
  if (state.activation == null && state.status === TAB_STATUS.OFF &&
      state.documentToken == null && !state.autoTranslateSuppressed) return;
  await setState(tabId, {
    ...loadingState,
    activation: null,
    origin: null,
    hostname: hostnameForUrl(url) || null
  });
  documentUrls.delete(String(tabId));
  if (initialDocumentToken == null) await sendStopMessage(tabId, state.generation, state.documentToken);
}

const ready = hydrate();

// The Chrome runner uses this service-worker-only seam to invoke the same
// queued action path as a toolbar click. It is not visible to page or content
// script realms and exposes no operation other than toggling one tab and
// reading its resulting state.
Object.defineProperty(globalThis, TEST_HARNESS_KEY, {
  configurable: true,
  value: Object.freeze({
    toggle: (tabId) => enqueueTabOperation(tabId, async () => {
      const tab = await chrome.tabs.get(tabId);
      return handleAction(tab);
    }),
    getState: (tabId) => ({...getState(tabId)})
  })
});

async function syncAutomaticTranslationRules() {
  if (!chrome.tabs?.query) return;
  const settings = await loadSettings();
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (typeof tab?.id !== 'number' || typeof tab.url !== 'string') continue;
    const state = getState(tab.id);
    const shouldTranslate = matchesAutoTranslateSite(hostnameForUrl(tab.url), settings.autoTranslateSites);
    if (shouldTranslate && !state.autoTranslateSuppressed && !isBusyOrActive(state) &&
        (state.activation !== TAB_ACTIVATION.MANUAL || state.status === TAB_STATUS.ERROR)) {
      void enqueueTabOperation(tab.id, () => startTranslation(tab, {
        activation: TAB_ACTIVATION.AUTO,
        url: tab.url
      }));
      continue;
    }
    if (!shouldTranslate && state.activation === TAB_ACTIVATION.AUTO && state.status !== TAB_STATUS.OFF) {
      void enqueueTabOperation(tab.id, () => stopTranslation(tab.id, state));
    }
  }
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
    rememberContentRoute(tabId, message);
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
  documentUrls.delete(String(tabId));
  latestContentRoutes.delete(String(tabId));
  void persist();
});
