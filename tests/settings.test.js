import {describe, expect, it} from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  TRANSLATION_MODES,
  TRANSLATION_STYLES,
  loadSettings,
  matchesAutoTranslateSite,
  normalizeHostname,
  normalizeHostnameList,
  normalizeSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  subscribeToSettings
} from '../src/settings.js';

describe('settings normalization', () => {
  it('normalizes URL and hostname entries into unique hostnames', () => {
    expect(normalizeHostnameList([
      ' HTTPS://WWW.Example.com/path/ ',
      'example.com',
      'https://news.example.com:443/a',
      'not a hostname',
      'https://example.com/#fragment'
    ])).toEqual(['example.com', 'news.example.com']);
    expect(matchesAutoTranslateSite('https://www.news.example.com/article', ['example.com'])).toBe(true);
    expect(normalizeHostname('https://example.com:443/path')).toBe('example.com');
  });

  it('rejects unsupported modes and styles while preserving safe defaults', () => {
    expect(normalizeSettings({
      translationMode: 'replace-the-page',
      displayStyle: 'inject-css',
      styleColor: 'red',
      textColor: '#112233',
      bold: 'true'
    })).toEqual({...DEFAULT_SETTINGS, textColor: '#112233', bold: true});
    expect(normalizeSettings({translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}).translationMode)
      .toBe(TRANSLATION_MODES.TRANSLATION_ONLY);
    expect(normalizeSettings({displayStyle: TRANSLATION_STYLES.SEPARATOR}).displayStyle)
      .toBe(TRANSLATION_STYLES.SEPARATOR);
  });

  it('uses chrome.storage.local and synchronizes local-area changes', async () => {
    let stored = {};
    let localListener;
    const storage = {
      local: {
        get(_key, callback) {
          callback(stored);
        },
        set(value, callback) {
          stored = value;
          callback?.();
        }
      },
      sync: {
        set() {
          throw new Error('sync storage should not be used');
        }
      },
      onChanged: {
        addListener(listener) {
          localListener = listener;
        },
        removeListener() {}
      }
    };

    const next = {...DEFAULT_SETTINGS, displayStyle: TRANSLATION_STYLES.BACKGROUND};
    await saveSettings(next, {storage});
    await expect(loadSettings({storage})).resolves.toMatchObject({
      displayStyle: TRANSLATION_STYLES.BACKGROUND
    });

    const changes = [];
    const unsubscribe = subscribeToSettings((value) => changes.push(value), {storage});
    localListener({["translight.settings.v1"]: {newValue: next}}, 'local');
    localListener({["translight.settings.v1"]: {newValue: DEFAULT_SETTINGS}}, 'sync');
    unsubscribe();
    expect(changes).toHaveLength(1);
    expect(changes[0].displayStyle).toBe(TRANSLATION_STYLES.BACKGROUND);
  });

  it('migrates legacy sync settings into local storage when local is empty', async () => {
    let localStored = {};
    let syncReads = 0;
    const storage = {
      local: {
        get(_key, callback) {
          callback(localStored);
        },
        set(value, callback) {
          localStored = value;
          callback?.();
        }
      },
      sync: {
        get(_key, callback) {
          syncReads += 1;
          callback({
            [SETTINGS_KEY]: {
              schemaVersion: 1,
              displayStyle: TRANSLATION_STYLES.BACKGROUND,
              autoTranslateSameSite: false
            }
          });
        }
      }
    };

    await expect(loadSettings({storage})).resolves.toMatchObject({
      displayStyle: TRANSLATION_STYLES.BACKGROUND,
      autoTranslateSameSite: false,
      schemaVersion: DEFAULT_SETTINGS.schemaVersion
    });
    expect(syncReads).toBe(1);
    expect(localStored[SETTINGS_KEY]).toMatchObject({
      displayStyle: TRANSLATION_STYLES.BACKGROUND,
      autoTranslateSameSite: false,
      schemaVersion: DEFAULT_SETTINGS.schemaVersion
    });
  });

  it('round-trips schema versions and rejects invalid import values', () => {
    const serialized = serializeSettings({
      ...DEFAULT_SETTINGS,
      autoTranslateSameSite: false,
      autoTranslateSites: ['https://www.example.com/path']
    });
    expect(parseSettings(serialized)).toMatchObject({
      autoTranslateSameSite: false,
      autoTranslateSites: ['example.com']
    });
    expect(parseSettings(JSON.stringify({
      schemaVersion: DEFAULT_SETTINGS.schemaVersion,
      displayStyle: TRANSLATION_STYLES.SEPARATOR
    }))).toMatchObject({
      displayStyle: TRANSLATION_STYLES.SEPARATOR,
      styleColor: DEFAULT_SETTINGS.styleColor
    });
    expect(() => parseSettings(JSON.stringify({
      schemaVersion: DEFAULT_SETTINGS.schemaVersion,
      styleColor: 'red'
    }))).toThrow();
    expect(() => parseSettings(JSON.stringify({
      schemaVersion: 999,
      displayStyle: TRANSLATION_STYLES.NONE
    }))).toThrow();
  });
});
