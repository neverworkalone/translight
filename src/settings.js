export const SETTINGS_KEY = 'translight.settings.v1';
export const SETTINGS_SCHEMA_VERSION = 1;

export const TRANSLATION_MODES = Object.freeze({
  ORIGINAL_TRANSLATION: 'original-translation',
  TRANSLATION_ORIGINAL: 'translation-original',
  TRANSLATION_ONLY: 'translation-only'
});

export const TRANSLATION_STYLES = Object.freeze({
  NONE: 'none',
  LEFT_BORDER: 'left-border',
  DOTTED_BORDER: 'dotted-border',
  SOLID_BORDER: 'solid-border',
  DOTTED_UNDERLINE: 'dotted-underline',
  SOLID_UNDERLINE: 'solid-underline',
  SEPARATOR: 'separator',
  BACKGROUND: 'background',
  HIGHLIGHT: 'highlight',
  MINI_HIGHLIGHT: 'mini-highlight'
});

const MODE_VALUES = new Set(Object.values(TRANSLATION_MODES));
const STYLE_VALUES = new Set(Object.values(TRANSLATION_STYLES));
const DEFAULT_STYLE_COLOR = '#4DB6AC';
const DEFAULT_TEXT_COLOR = '#35515C';

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION,
  displayStyle: TRANSLATION_STYLES.NONE,
  styleColor: DEFAULT_STYLE_COLOR,
  textColor: DEFAULT_TEXT_COLOR,
  bold: false,
  italic: false,
  autoTranslateSites: []
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  return value;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

export function normalizeColor(value, fallback) {
  const normalized = normalizeString(value, fallback).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

/**
 * Convert a user-entered URL or hostname to the canonical host used by the
 * automatic-translation rules. Protocol, path, port, trailing dot, and the
 * conventional www. prefix are deliberately not persisted.
 */
export function normalizeHostname(value) {
  if (typeof value !== 'string') return '';
  let candidate = value.trim().toLowerCase();
  if (!candidate || /\s/.test(candidate)) return '';
  candidate = candidate.replace(/^\*:\/\//, '');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname || parsed.username || parsed.password) return '';
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!hostname || hostname.includes('..')) return '';
    if (hostname !== 'localhost' && !/^\[?[a-f0-9:.]+\]?$/i.test(hostname) &&
        !hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
      return '';
    }
    return hostname;
  } catch {
    return '';
  }
}

export function normalizeHostnameList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\r\n]+/);
  const seen = new Set();
  const result = [];

  for (const entry of values) {
    const hostname = normalizeHostname(entry);
    if (!hostname || seen.has(hostname)) continue;
    seen.add(hostname);
    result.push(hostname);
  }
  return result;
}

export function hostnameForUrl(value) {
  return normalizeHostname(value);
}

export function originForUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value);
    return parsed.origin === 'null' ? '' : parsed.origin;
  } catch {
    return '';
  }
}

export function isSameSite(left, right) {
  const leftHost = normalizeHostname(left);
  const rightHost = normalizeHostname(right);
  return Boolean(leftHost && rightHost && leftHost === rightHost);
}

export function isSameOrigin(left, right) {
  const leftOrigin = originForUrl(left);
  const rightOrigin = originForUrl(right);
  return Boolean(leftOrigin && rightOrigin && leftOrigin === rightOrigin);
}

export function matchesAutoTranslateSite(hostname, sites) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return normalizeHostnameList(sites).some((site) => host === site || host.endsWith(`.${site}`));
}

export function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  const mode = normalizeString(source.translationMode, DEFAULT_SETTINGS.translationMode);
  const style = normalizeString(source.displayStyle, DEFAULT_SETTINGS.displayStyle);

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    translationMode: MODE_VALUES.has(mode) ? mode : DEFAULT_SETTINGS.translationMode,
    displayStyle: STYLE_VALUES.has(style) ? style : DEFAULT_SETTINGS.displayStyle,
    styleColor: normalizeColor(source.styleColor, DEFAULT_SETTINGS.styleColor),
    textColor: normalizeColor(source.textColor, DEFAULT_SETTINGS.textColor),
    bold: normalizeBoolean(source.bold, DEFAULT_SETTINGS.bold),
    italic: normalizeBoolean(source.italic, DEFAULT_SETTINGS.italic),
    autoTranslateSites: normalizeHostnameList(source.autoTranslateSites)
  };
}

export function createDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

function storageArea(storage) {
  return storage?.sync ?? storage ?? null;
}

function readArea(area, key) {
  if (!area?.get) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const callback = (value) => {
      const lastError = globalThis.chrome?.runtime?.lastError;
      if (lastError?.message) {
        finish(reject, new Error(lastError.message));
        return;
      }
      finish(resolve, isRecord(value) ? value : {});
    };

    try {
      const pending = area.get(key, callback);
      if (pending?.then) pending.then(callback).catch((error) => finish(reject, error));
    } catch (error) {
      finish(reject, error);
    }
  });
}

function writeArea(area, value) {
  if (!area?.set) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      callback(result);
    };
    const callback = () => {
      const lastError = globalThis.chrome?.runtime?.lastError;
      if (lastError?.message) finish(reject, new Error(lastError.message));
      else finish(resolve);
    };

    try {
      const pending = area.set(value, callback);
      if (pending?.then) pending.then(callback).catch((error) => finish(reject, error));
    } catch (error) {
      finish(reject, error);
    }
  });
}

export async function loadSettings({ storage = globalThis.chrome?.storage } = {}) {
  const area = storageArea(storage);
  try {
    const values = await readArea(area, SETTINGS_KEY);
    return normalizeSettings(values[SETTINGS_KEY]);
  } catch {
    return createDefaultSettings();
  }
}

export async function saveSettings(settings, { storage = globalThis.chrome?.storage } = {}) {
  const normalized = normalizeSettings(settings);
  await writeArea(storageArea(storage), {[SETTINGS_KEY]: normalized});
  return normalized;
}

export function subscribeToSettings(callback, { storage = globalThis.chrome?.storage } = {}) {
  const listener = (changes, areaName) => {
    if (areaName && areaName !== 'sync') return;
    if (!changes?.[SETTINGS_KEY]) return;
    callback(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };
  storage?.onChanged?.addListener?.(listener);
  return () => storage?.onChanged?.removeListener?.(listener);
}

export function serializeSettings(settings) {
  return JSON.stringify(normalizeSettings(settings), null, 2);
}

export function parseSettings(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return normalizeSettings(parsed);
}
