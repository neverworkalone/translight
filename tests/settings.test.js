import {describe, expect, it} from 'vitest';
import {
  DEFAULT_SETTINGS,
  TRANSLATION_MODES,
  TRANSLATION_STYLES,
  matchesAutoTranslateSite,
  normalizeHostname,
  normalizeHostnameList,
  normalizeSettings
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
});
