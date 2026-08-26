import {
  hostnameForUrl,
  isSameOrigin,
  matchesAutoTranslateSite,
  normalizeHostnameList
} from '../settings.js';
import {TAB_ACTIVATION, TAB_STATUS} from './tab-state.js';

export function createLoadingStatePatch(state = {}, generation) {
  return {
    status: TAB_STATUS.OFF,
    generation,
    documentToken: null,
    // Keep the activation context until CONTENT_READY can classify the new
    // document. This is what lets a manual same-site translation continue
    // across a full-page navigation.
    activation: state.activation ?? null,
    origin: state.origin ?? null,
    hostname: state.hostname ?? null,
    modelState: null,
    progress: null,
    errorCode: null,
    errorMessage: null
  };
}

export function documentUrlForUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return value.split('#', 1)[0];
  }
}

export function isNavigationStateCurrent(before, after) {
  return before?.generation === after?.generation &&
    before?.documentToken === after?.documentToken;
}

export function shouldContinueManualTranslation(state, url, enabled = true) {
  return enabled !== false &&
    state?.activation === TAB_ACTIVATION.MANUAL &&
    Boolean(state.origin) &&
    isSameOrigin(state.origin, url);
}

export function shouldAutoTranslate(url, sites) {
  const hostname = hostnameForUrl(url);
  return Boolean(hostname && matchesAutoTranslateSite(hostname, normalizeHostnameList(sites)));
}

export function classifyNavigation({state, url, autoTranslateSites = [], autoTranslateSameSite = true} = {}) {
  const hostname = hostnameForUrl(url);
  if (!hostname) return {translate: false, activation: null, hostname: ''};
  if (shouldContinueManualTranslation(state, url, autoTranslateSameSite)) {
    return {translate: true, activation: TAB_ACTIVATION.MANUAL, hostname};
  }
  if (shouldAutoTranslate(url, autoTranslateSites)) {
    return {translate: true, activation: TAB_ACTIVATION.AUTO, hostname};
  }
  return {translate: false, activation: null, hostname};
}
