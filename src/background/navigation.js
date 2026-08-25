import {
  hostnameForUrl,
  isSameOrigin,
  matchesAutoTranslateSite,
  normalizeHostnameList
} from '../settings.js';
import {TAB_ACTIVATION} from './tab-state.js';

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
