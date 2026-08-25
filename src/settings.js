export const SETTINGS_KEY = 'translight.settings.v1';
export const SETTINGS_SCHEMA_VERSION = 2;
export const SUPPORTED_SETTINGS_SCHEMA_VERSIONS = Object.freeze([1, SETTINGS_SCHEMA_VERSION]);

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

export const TRANSLATION_PROVIDERS = Object.freeze({
  CHROME: 'chrome'
});

export const TARGET_LANGUAGES = Object.freeze({
  KOREAN: 'ko'
});

const MODE_VALUES = new Set(Object.values(TRANSLATION_MODES));
const STYLE_VALUES = new Set(Object.values(TRANSLATION_STYLES));
const PROVIDER_VALUES = new Set(Object.values(TRANSLATION_PROVIDERS));
const TARGET_LANGUAGE_VALUES = new Set(Object.values(TARGET_LANGUAGES));
const DEFAULT_STYLE_COLOR = '#F0F6FF';
const DEFAULT_TEXT_COLOR = '#111827';
const SETTINGS_FIELDS = new Set([
  'schemaVersion',
  'translationMode',
  'displayStyle',
  'styleColor',
  'textColor',
  'bold',
  'italic',
  'targetLanguage',
  'translationProvider',
  'autoTranslateSameSite',
  'translatePageTitle',
  'autoTranslateSites'
]);

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION,
  displayStyle: TRANSLATION_STYLES.NONE,
  styleColor: DEFAULT_STYLE_COLOR,
  textColor: DEFAULT_TEXT_COLOR,
  bold: false,
  italic: false,
  targetLanguage: TARGET_LANGUAGES.KOREAN,
  translationProvider: TRANSLATION_PROVIDERS.CHROME,
  autoTranslateSameSite: true,
  translatePageTitle: false,
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

export function isValidColor(value) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim());
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

function sourceSchemaVersion(source) {
  return Number.isInteger(source?.schemaVersion) ? source.schemaVersion : SETTINGS_SCHEMA_VERSION;
}

export function migrateSettings(value) {
  if (!isRecord(value)) return createDefaultSettings();
  const version = sourceSchemaVersion(value);
  if (version === 1) {
    return {
      ...value,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      targetLanguage: value.targetLanguage ?? TARGET_LANGUAGES.KOREAN,
      translationProvider: value.translationProvider ?? TRANSLATION_PROVIDERS.CHROME,
      autoTranslateSameSite: value.autoTranslateSameSite ?? true,
      translatePageTitle: value.translatePageTitle ?? true
    };
  }
  return {...value, schemaVersion: SETTINGS_SCHEMA_VERSION};
}

export function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  const mode = normalizeString(source.translationMode, DEFAULT_SETTINGS.translationMode);
  const style = normalizeString(source.displayStyle, DEFAULT_SETTINGS.displayStyle);
  const schemaVersion = sourceSchemaVersion(source);

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    translationMode: MODE_VALUES.has(mode) ? mode : DEFAULT_SETTINGS.translationMode,
    displayStyle: STYLE_VALUES.has(style) ? style : DEFAULT_SETTINGS.displayStyle,
    styleColor: normalizeColor(source.styleColor, DEFAULT_SETTINGS.styleColor),
    textColor: normalizeColor(source.textColor, DEFAULT_SETTINGS.textColor),
    bold: normalizeBoolean(source.bold, DEFAULT_SETTINGS.bold),
    italic: normalizeBoolean(source.italic, DEFAULT_SETTINGS.italic),
    targetLanguage: TARGET_LANGUAGE_VALUES.has(source.targetLanguage)
      ? source.targetLanguage
      : DEFAULT_SETTINGS.targetLanguage,
    translationProvider: PROVIDER_VALUES.has(source.translationProvider)
      ? source.translationProvider
      : DEFAULT_SETTINGS.translationProvider,
    autoTranslateSameSite: normalizeBoolean(
      source.autoTranslateSameSite ?? source.sameSiteAutoTranslate,
      DEFAULT_SETTINGS.autoTranslateSameSite
    ),
    translatePageTitle: normalizeBoolean(
      source.translatePageTitle ?? source.translateTitle,
      schemaVersion < SETTINGS_SCHEMA_VERSION ? true : DEFAULT_SETTINGS.translatePageTitle
    ),
    autoTranslateSites: normalizeHostnameList(source.autoTranslateSites)
  };
}

export function createDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

function invalidField(field, message) {
  const error = new Error(`${field}: ${message}`);
  error.code = 'INVALID_SETTINGS';
  error.field = field;
  return error;
}

/**
 * Validate an imported/exported settings document without changing the
 * current settings. Missing settings fields are completed from defaults.
 */
export function validateSettingsDocument(value) {
  if (!isRecord(value)) throw invalidField('root', 'settings must be an object');

  const unknownFields = Object.keys(value).filter((key) => !SETTINGS_FIELDS.has(key));
  if (unknownFields.length) throw invalidField(unknownFields[0], 'unsupported field');

  if (value.schemaVersion != null &&
      (!Number.isInteger(value.schemaVersion) || !SUPPORTED_SETTINGS_SCHEMA_VERSIONS.includes(value.schemaVersion))) {
    throw invalidField('schemaVersion', 'unsupported schema version');
  }
  if (value.translationMode != null && !MODE_VALUES.has(value.translationMode)) {
    throw invalidField('translationMode', 'unsupported translation mode');
  }
  if (value.displayStyle != null && !STYLE_VALUES.has(value.displayStyle)) {
    throw invalidField('displayStyle', 'unsupported display style');
  }
  for (const field of ['styleColor', 'textColor']) {
    if (value[field] != null && !isValidColor(value[field])) {
      throw invalidField(field, 'expected a six-digit hex color');
    }
  }
  for (const field of ['bold', 'italic', 'autoTranslateSameSite', 'translatePageTitle']) {
    if (value[field] != null && typeof value[field] !== 'boolean') {
      throw invalidField(field, 'expected a boolean');
    }
  }
  if (value.targetLanguage != null && !TARGET_LANGUAGE_VALUES.has(value.targetLanguage)) {
    throw invalidField('targetLanguage', 'unsupported target language');
  }
  if (value.translationProvider != null && !PROVIDER_VALUES.has(value.translationProvider)) {
    throw invalidField('translationProvider', 'unsupported translation provider');
  }
  if (value.autoTranslateSites != null) {
    if (!Array.isArray(value.autoTranslateSites)) {
      throw invalidField('autoTranslateSites', 'expected an array');
    }
    for (const entry of value.autoTranslateSites) {
      if (typeof entry !== 'string' || !normalizeHostname(entry)) {
        throw invalidField('autoTranslateSites', 'contains an invalid hostname');
      }
    }
  }

  return normalizeSettings(value);
}

function storageArea(storage) {
  if (!storage) return null;
  if (storage.local || storage.sync) return storage.local ?? null;
  return storage;
}

function legacyStorageArea(storage) {
  return storage?.sync ?? null;
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
  let values = {};
  try {
    values = await readArea(area, SETTINGS_KEY);
  } catch {
    values = {};
  }

  if (isRecord(values[SETTINGS_KEY])) {
    return normalizeSettings(migrateSettings(values[SETTINGS_KEY]));
  }

  const legacyArea = legacyStorageArea(storage);
  if (legacyArea && legacyArea !== area) {
    try {
      const legacyValues = await readArea(legacyArea, SETTINGS_KEY);
      if (isRecord(legacyValues[SETTINGS_KEY])) {
        const migrated = normalizeSettings(migrateSettings(legacyValues[SETTINGS_KEY]));
        // Stage 2 stored this key in sync. Keep the migration one-way so all
        // later reads and storage change events use the local-area contract.
        try {
          await writeArea(area, {[SETTINGS_KEY]: migrated});
        } catch {
          // Keep the migrated value for this session even if persistence fails.
        }
        return migrated;
      }
    } catch {
      // Fall through to defaults when neither storage area is readable.
    }
  }

  return createDefaultSettings();
}

export async function saveSettings(settings, { storage = globalThis.chrome?.storage } = {}) {
  const normalized = validateSettingsDocument(settings);
  await writeArea(storageArea(storage), {[SETTINGS_KEY]: normalized});
  return normalized;
}

export function subscribeToSettings(callback, { storage = globalThis.chrome?.storage } = {}) {
  const listener = (changes, areaName) => {
    if (areaName && areaName !== 'local') return;
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
  return validateSettingsDocument(parsed);
}

export function settingsFingerprint(settings) {
  return JSON.stringify(normalizeSettings(settings));
}
