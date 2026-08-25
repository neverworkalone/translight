export const TAB_STATUS = Object.freeze({
  OFF: 'OFF',
  CHECKING: 'CHECKING',
  DOWNLOADING: 'DOWNLOADING',
  TRANSLATING: 'TRANSLATING',
  ACTIVE: 'ACTIVE',
  ERROR: 'ERROR'
});

export const BUSY_STATUSES = new Set([
  TAB_STATUS.CHECKING,
  TAB_STATUS.DOWNLOADING,
  TAB_STATUS.TRANSLATING
]);

export function createTabState(patch = {}) {
  return {
    status: TAB_STATUS.OFF,
    generation: 0,
    origin: null,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: 0,
    ...patch
  };
}

export function normalizeTabStates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([tabId, state]) => [
      String(tabId),
      createTabState(state && typeof state === 'object' ? state : {})
    ])
  );
}

export function updateTabState(states, tabId, patch) {
  const key = String(tabId);
  const next = {
    ...states,
    [key]: createTabState({ ...(states[key] ?? {}), ...patch, updatedAt: Date.now() })
  };
  return next;
}

export function removeTabState(states, tabId) {
  const next = { ...states };
  delete next[String(tabId)];
  return next;
}
