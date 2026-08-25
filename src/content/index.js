import { PageSession } from './page-session.js';

let currentSession = null;

function sendStatus(payload) {
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  void chrome.runtime.sendMessage({ type: 'TRANSLATION_STATUS', ...payload }).catch(() => {});
}

function startSession(message) {
  currentSession?.stop({ notify: false });
  currentSession = new PageSession({
    generation: message.generation,
    sendStatus
  });
  void currentSession.start();
}

function stopSession(message) {
  if (!currentSession) return;
  if (message.generation != null && currentSession.generation !== message.generation) return;
  currentSession.stop();
  currentSession = null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
