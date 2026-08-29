import { describe, expect, it } from 'vitest';
import englishMessages from '../_locales/en/messages.json';
import koreanMessages from '../_locales/ko/messages.json';
import { FALLBACK_LANGUAGE, t } from '../src/i18n/index.js';

describe('Chrome i18n messages', () => {
  it('keeps English and Korean message keys in sync', () => {
    expect(Object.keys(koreanMessages).sort()).toEqual(Object.keys(englishMessages).sort());
    expect(Object.keys(englishMessages)).not.toHaveLength(0);
  });

  it('uses Chrome i18n when it is available', () => {
    const previousChrome = globalThis.chrome;
    globalThis.chrome = {
      i18n: {
        getMessage: (key) => (key === 'optionsPageTitle' ? 'Localized title' : '')
      }
    };

    try {
      expect(t('optionsPageTitle')).toBe('Localized title');
    } finally {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  });

  it('falls back to English and handles missing keys', () => {
    expect(FALLBACK_LANGUAGE).toBe('en');
    expect(t('optionsPageTitle')).toBe(englishMessages.optionsPageTitle.message);
    expect(t('actionErrorTitle', 'Example error')).toBe('Translight error: Example error');
    expect(t('missingMessageKey')).toBe('missingMessageKey');
  });

  it('uses English when a localized key is missing', () => {
    const previousChrome = globalThis.chrome;
    globalThis.chrome = {
      i18n: {
        getMessage: () => ''
      }
    };

    try {
      expect(t('optionsPageTitle')).toBe(englishMessages.optionsPageTitle.message);
    } finally {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  });
});
