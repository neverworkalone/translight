export const TAB_STATUS = Object.freeze({
  OFF: 'OFF',
  CHECKING: 'CHECKING',
  DOWNLOADING: 'DOWNLOADING',
  TRANSLATING: 'TRANSLATING',
  ACTIVE: 'ACTIVE',
  ERROR: 'ERROR'
});

export const TAB_ACTIVATION = Object.freeze({
  MANUAL: 'manual',
  AUTO: 'auto'
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
    activation: null,
    origin: null,
    hostname: null,
    documentToken: null,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: 0,
    ...patch,
    activation: normalizeActivation(patch.activation),
    origin: typeof patch.origin === 'string' ? patch.origin : null,
    hostname: typeof patch.hostname === 'string' ? patch.hostname : null
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

export function normalizeActivation(value) {
  return value === TAB_ACTIVATION.MANUAL || value === TAB_ACTIVATION.AUTO ? value : null;
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

export function reconcileDocumentState(states, tabId, documentToken, generation) {
  if (!documentToken) return states;

  const key = String(tabId);
  const current = states[key] ?? createTabState();
  if (current.documentToken === documentToken) return states;

  // A content script may be dynamically injected into a document whose
  // static script has not reported ready yet. Associate that first token
  // without cancelling the action that is already in flight.
  if (current.documentToken == null) {
    return updateTabState(states, tabId, { documentToken });
  }

  return updateTabState(states, tabId, {
    status: TAB_STATUS.OFF,
    generation,
    documentToken,
    origin: null,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null
  });
}
