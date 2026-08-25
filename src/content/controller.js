import { PageSession } from './page-session.js';
import {
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  subscribeToSettings
} from '../settings.js';

export const CONTENT_CONTROLLER_KEY = '__translight_content_controller__';
export const DOCUMENT_TOKEN_KEY = '__translight_document_token__';

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
    pageLifecycleHandler: null
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
  controller.pageLifecycleHandler = () => {
    controller.currentSession?.stop({notify: false});
    controller.currentSession = null;
  };
  globalThis.addEventListener?.('pagehide', controller.pageLifecycleHandler);

  const sendStatus = (payload) => sendRuntimeMessage(runtime, {
    type: 'TRANSLATION_STATUS',
    ...payload
  });

  const startSession = (message) => {
    controller.currentSession?.stop({ notify: false });
    controller.currentSession = createSession({
      generation: message.generation,
      sendStatus,
      settings: controller.settings,
      translationCache: controller.translationCache,
      isGenerationCurrent: (generation) => controller.currentSession?.generation === generation
    });
    void controller.currentSession.start();
  };

  const stopSession = (message) => {
    const session = controller.currentSession;
    if (!session) return;
    if (message.generation != null && session.generation !== message.generation) return;
    session.stop();
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
