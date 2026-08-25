// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isDocumentInLanguage, normalizeLanguageCode } from '../src/content/language.js';

describe('document language detection', () => {
  it('normalizes regional language tags', () => {
    expect(normalizeLanguageCode('ko-KR')).toBe('ko');
    expect(normalizeLanguageCode('en_US')).toBe('en');
    expect(normalizeLanguageCode('')).toBe('');
  });

  it('prefers the document language declaration', () => {
    document.documentElement.lang = 'ko-KR';
    expect(isDocumentInLanguage(document, 'ko')).toBe(true);
    expect(isDocumentInLanguage(document, 'en')).toBe(false);
    document.documentElement.removeAttribute('lang');
  });

  it('reads content-language metadata when html lang is missing', () => {
    document.head.innerHTML = '<meta http-equiv="Content-Language" content="ko">';
    expect(isDocumentInLanguage(document, 'ko')).toBe(true);
    document.head.innerHTML = '';
  });

  it('uses Korean text as a fallback when no language metadata exists', () => {
    document.body.innerHTML = '<p>한국어로 작성된 긴 문장입니다. 이 페이지의 본문은 대상 언어와 같은 한국어입니다.</p>';
    expect(isDocumentInLanguage(document, 'ko')).toBe(true);
    document.body.innerHTML = '<p>This page is written in English and should be translated.</p>';
    expect(isDocumentInLanguage(document, 'ko')).toBe(false);
  });
});
