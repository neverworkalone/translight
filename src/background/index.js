import { BUSY_STATUSES, createTabState, normalizeTabStates, removeTabState, TAB_STATUS, updateTabState } from './tab-state.js';

const STORAGE_KEY = 'translight.tabStates';
const badgeColors = {
  busy: '#0b9ed1',
  active: '#18a96b',
  error: '#d94a4a'
};

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

async function refreshAction(tabId, state) {
  if (!globalThis.chrome?.action) return;
  let badgeText = '';
  let title = 'Translight: 번역 시작';
  let color = badgeColors.busy;

  if (BUSY_STATUSES.has(state.status)) {
    badgeText = '…';
    title = 'Translight: 번역 취소';
  } else if (state.status === TAB_STATUS.ACTIVE) {
    badgeText = 'ON';
    title = 'Translight: 번역 해제';
    color = badgeColors.active;
  } else if (state.status === TAB_STATUS.ERROR) {
    badgeText = '!';
    title = `Translight 오류: ${state.errorMessage ?? '번역 실패'}`;
    color = badgeColors.error;
  }

  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: badgeText }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setTitle({ tabId, title })
  ]);
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
      const error = new Error('현재 탭에서 Translight를 실행할 수 없습니다.', { cause: secondError ?? firstError });
      error.code = 'CONTENT_SCRIPT_UNAVAILABLE';
      throw error;
    }
  }
}

function isBusyOrActive(state) {
  return state.status === TAB_STATUS.ACTIVE || BUSY_STATUSES.has(state.status);
}

async function startTranslation(tab) {
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return;

  const generation = nextGeneration();
  await setState(tabId, {
    status: TAB_STATUS.CHECKING,
    generation,
    origin: null,
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
    // 페이지가 이미 닫혔거나 content script를 실행할 수 없는 경우에도
    // background 상태는 OFF로 남겨 다음 클릭에서 새 세션을 시작한다.
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

const ready = hydrate();

chrome.action.onClicked.addListener((tab) => {
  void handleAction(tab);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'TRANSLATION_STATUS') void handleTranslationStatus(message, sender);
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates = removeTabState(tabStates, tabId);
  void persist();
});
