import { PageSession } from './page-session.js';
import {
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  subscribeToSettings
} from '../settings.js';

export const CONTENT_CONTROLLER_KEY = '__translight_content_controller__';
export const DOCUMENT_TOKEN_KEY = '__translight_document_token__';
const NAVIGATION_POLL_MS = 500;

function getDocumentToken() {
  if (globalThis[DOCUMENT_TOKEN_KEY]) return globalThis[DOCUMENT_TOKEN_KEY];

  const href = globalThis.location?.href ?? '';
  const timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
  const token = `${href}::${timeOrigin}`;
  globalThis[DOCUMENT_TOKEN_KEY] = token;
  return token;
}

function sendRuntimeMessage(runtime, message) {
  try {
    const pending = runtime?.sendMessage?.(message);
    pending?.catch?.(() => {});
  } catch {
    // The page can disappear while a navigation is in progress.
  }
}

export function installContentController({
  runtime = globalThis.chrome?.runtime,
  createSession = (options) => new PageSession(options)
} = {}) {
  const existing = globalThis[CONTENT_CONTROLLER_KEY];
  if (existing) return existing;
  if (!runtime?.onMessage?.addListener) return null;

  const controller = {
    currentSession: null,
    documentToken: getDocumentToken(),
    settings: createDefaultSettings(),
    translationCache: new Map(),
    settingsReady: null,
    unsubscribeSettings: null,
    pageLifecycleHandler: null,
    pageShowHandler: null,
    navigationHandler: null,
    lastNavigationUrl: globalThis.location?.href ?? '',
    routeGeneration: 0,
    navigationTimer: null,
    navigationView: null
  };
  globalThis[CONTENT_CONTROLLER_KEY] = controller;

  controller.settingsReady = loadSettings()
    .then((settings) => {
      controller.settings = normalizeSettings(settings);
      controller.currentSession?.applySettings(controller.settings);
      return controller.settings;
    })
    .catch(() => controller.settings);
  controller.unsubscribeSettings = subscribeToSettings((settings) => {
    controller.settings = normalizeSettings(settings);
    controller.currentSession?.applySettings(controller.settings);
  });
  controller.pageLifecycleHandler = (event) => {
    // A history back/forward can restore this document from the back-forward
    // cache. Keep its live session and translated DOM intact until pageshow.
    if (event?.persisted) return;
    if (controller.navigationTimer != null) {
      const clearInterval = controller.navigationView?.clearInterval ?? globalThis.clearInterval;
      clearInterval?.(controller.navigationTimer);
      controller.navigationTimer = null;
    }
    controller.currentSession?.stop({notify: false});
    controller.currentSession = null;
  };
  controller.pageShowHandler = (event) => {
    if (!event?.persisted) return;
    const session = controller.currentSession;
    if (session) controller.startNavigationWatcher(session);
    sendRuntimeMessage(runtime, {
      type: 'CONTENT_READY',
      documentToken: controller.documentToken,
      url: globalThis.location?.href ?? '',
      origin: globalThis.location?.origin ?? '',
      resume: true,
      contentSessionActive: Boolean(session?.isNavigationWatching?.() ?? session?.running === true),
      contentSessionGeneration: Number.isInteger(session?.generation) ? session.generation : null,
      contentSessionStatus: session?.status ?? null,
      contentSessionActivation: session?.activation ?? null
    });
  };
  globalThis.addEventListener?.('pagehide', controller.pageLifecycleHandler);
  globalThis.addEventListener?.('pageshow', controller.pageShowHandler);
  controller.navigationHandler = () => {
    const session = controller.currentSession;
    const isWatching = session?.isNavigationWatching?.() ?? session?.running === true;
    if (!isWatching) return false;
    const url = globalThis.location?.href ?? '';
    if (!url || url === controller.lastNavigationUrl) return false;
    const previousUrl = controller.lastNavigationUrl;
    controller.lastNavigationUrl = url;
    const routeGeneration = ++controller.routeGeneration;
    const route = {
      previousUrl,
      currentUrl: url,
      url,
      documentToken: controller.documentToken,
      origin: globalThis.location?.origin ?? '',
      routeGeneration
    };
    if (session.beginRouteChange?.(route) === false) return false;
    sendRuntimeMessage(runtime, {
      type: 'CONTENT_NAVIGATION',
      ...route
    });
    return true;
  };
  const view = globalThis.window ?? globalThis;
  controller.navigationView = view;
  view?.addEventListener?.('popstate', controller.navigationHandler);
  view?.addEventListener?.('hashchange', controller.navigationHandler);

  controller.startNavigationWatcher = (session) => {
    const isWatching = session?.isNavigationWatching?.() ?? session?.running === true;
    if (!isWatching || controller.navigationTimer != null) return;
    const setInterval = view?.setInterval ?? globalThis.setInterval;
    if (typeof setInterval !== 'function') return;
    controller.navigationTimer = setInterval(() => {
      const currentSession = controller.currentSession;
      const currentIsWatching = currentSession?.isNavigationWatching?.() ?? currentSession?.running === true;
      if (!currentIsWatching) {
        const clearInterval = view?.clearInterval ?? globalThis.clearInterval;
        clearInterval?.(controller.navigationTimer);
        controller.navigationTimer = null;
        return;
      }
      controller.navigationHandler();
    }, NAVIGATION_POLL_MS);
  };

  controller.stopNavigationWatcher = () => {
    if (controller.navigationTimer == null) return;
    const clearInterval = view?.clearInterval ?? globalThis.clearInterval;
    clearInterval?.(controller.navigationTimer);
    controller.navigationTimer = null;
  };

  const sendStatus = (payload) => sendRuntimeMessage(runtime, {
    type: 'TRANSLATION_STATUS',
    ...payload
  });

  const sendContentRulesChanged = () => sendRuntimeMessage(runtime, {
    type: 'CONTENT_RULES_CHANGED',
    documentToken: controller.documentToken,
    url: globalThis.location?.href ?? '',
    origin: globalThis.location?.origin ?? ''
  });

  const startSession = (message) => {
    if (message.documentToken != null && message.documentToken !== controller.documentToken) return;
    controller.stopNavigationWatcher();
    controller.currentSession?.stop({ notify: false });
    // Navigation that happened while translation was OFF is the baseline for
    // this new session, not an SPA route inside it.
    controller.lastNavigationUrl = globalThis.location?.href ?? controller.lastNavigationUrl;
    controller.currentSession = createSession({
      generation: message.generation,
      activation: message.activation ?? null,
      sendStatus,
      settings: controller.settings,
      translationCache: controller.translationCache,
      isGenerationCurrent: (generation) => controller.currentSession?.generation === generation,
      initialRouteGeneration: Number.isInteger(message.routeGeneration)
        ? message.routeGeneration
        : controller.routeGeneration,
      onDomMutation: () => controller.navigationHandler()
    });
    void controller.currentSession.start();
    controller.startNavigationWatcher(controller.currentSession);
  };

  const stopSession = (message) => {
    if (message.documentToken != null && message.documentToken !== controller.documentToken) return;
    const session = controller.currentSession;
    if (!session) return;
    if (message.generation != null && session.generation !== message.generation) return;
    session.stop();
    controller.stopNavigationWatcher();
    controller.currentSession = null;
  };

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'TRANSLATION_START') {
      startSession(message);
      sendResponse?.({ ok: true });
      return false;
    }

    if (message?.type === 'TRANSLATION_STOP') {
      stopSession(message);
      sendResponse?.({ ok: true });
      return false;
    }

    if (message?.type === 'TRANSLATION_ROUTE') {
      if (message.documentToken != null && message.documentToken !== controller.documentToken) {
        sendResponse?.({ok: true});
        return false;
      }
      controller.currentSession?.applyRouteDecision?.(message);
      sendResponse?.({ok: true});
      return false;
    }

    if (message?.type === 'TRANSLATION_RULES_CHANGED') {
      sendContentRulesChanged();
      sendResponse?.({ok: true});
      return false;
    }

    return false;
  });

  sendRuntimeMessage(runtime, {
    type: 'CONTENT_READY',
    documentToken: controller.documentToken,
    url: globalThis.location?.href ?? '',
    origin: globalThis.location?.origin ?? ''
  });

  return controller;
}
