// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  HANGUL_SKIP_RATIO,
  LANGUAGE_MIN_LETTERS,
  classifyTextLanguage,
  isDocumentInLanguage,
  isStandaloneHandle,
  isTranslatableBlock,
  isTranslatableText,
  isTranslatableTitle,
  nearestContentLanguage,
  normalizeLanguageCode
} from '../src/content/language.js';

const BELOW_HANGUL_SKIP_RATIO = `${'a'.repeat(19)}가나`; // 2 Hangul / 21 letters.
const AT_HANGUL_SKIP_RATIO = `${'a'.repeat(18)}가나`; // 2 Hangul / 20 letters.
const SINGLE_HANGUL_AT_RATIO = `${'a'.repeat(9)}가`; // 1 Hangul / 10 letters.

describe('content language detection', () => {
  it('normalizes regional language tags', () => {
    expect(normalizeLanguageCode('ko-KR')).toBe('ko');
    expect(normalizeLanguageCode('en_US')).toBe('en');
    expect(normalizeLanguageCode('')).toBe('');
  });

  it('uses body text instead of trusting the root language declaration', () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = '<p>This page is written in English and should be translated.</p>';
    expect(isDocumentInLanguage(document, 'ko')).toBe(false);
    expect(isDocumentInLanguage(document, 'en')).toBe(true);
    document.documentElement.removeAttribute('lang');
  });

  it('classifies Korean and English text using character composition', () => {
    expect(classifyTextLanguage('한국어로 작성된 문장입니다.')).toBe('ko');
    expect(classifyTextLanguage('This page is written in English.')).toBe('en');
    expect(classifyTextLanguage('123 !? 🐈')).toBe('');
    expect(HANGUL_SKIP_RATIO).toBe(0.1);
    expect(LANGUAGE_MIN_LETTERS).toBe(3);
  });

  it('prefers an English local declaration for otherwise eligible text', () => {
    document.body.innerHTML = '<section lang="en-US"><p>This content is marked English.</p></section>';
    const block = document.querySelector('p');
    expect(nearestContentLanguage(block)).toBe('en');
    expect(isTranslatableBlock(block, block.textContent, 'ko')).toBe(true);
  });

  it('protects content-based Korean even under a local English declaration', () => {
    document.body.innerHTML = `<section lang="en-US"><p>${AT_HANGUL_SKIP_RATIO}</p></section>`;
    const block = document.querySelector('p');
    expect(nearestContentLanguage(block)).toBe('en');
    expect(isTranslatableBlock(block, block.textContent, 'ko')).toBe(false);
  });

  it('prefers a Korean local declaration', () => {
    document.body.innerHTML = '<section lang="ko-KR"><p>This English text is marked Korean.</p></section>';
    const block = document.querySelector('p');
    expect(nearestContentLanguage(block)).toBe('ko');
    expect(isTranslatableBlock(block, block.textContent, 'ko')).toBe(false);
  });

  it('does not apply the English heuristic to an explicit non-English local language', () => {
    document.body.innerHTML = '<section lang="fr"><p>This content is explicitly French.</p></section>';
    const block = document.querySelector('p');
    expect(nearestContentLanguage(block)).toBe('fr');
    expect(isTranslatableBlock(block, block.textContent, 'ko')).toBe(false);
  });

  it('ignores html and body language declarations for blocks', () => {
    document.documentElement.lang = 'ko-KR';
    document.body.lang = 'ko-KR';
    document.body.innerHTML = '<p id="english">This English post should be translated.</p>';
    const block = document.querySelector('#english');
    expect(nearestContentLanguage(block)).toBe('');
    expect(isTranslatableBlock(block, block.textContent, 'ko')).toBe(true);
  });

  it('does not translate Korean text with an English product name', () => {
    const text = '이 게시글은 Reddit에서 공유된 한국어 문장입니다.';
    expect(isTranslatableText(text, 'ko')).toBe(false);
  });

  it.each([
    '이후 MutationObserver가 새 영어 block을 발견합니다.',
    'mutation handler가 this.watchOnly = false를 먼저 설정한 뒤 start()를 호출합니다',
    'build 시 commit SHA를 BUILD_INFO에 포함시키세요.',
    'runner가 loaded commit과 checkout HEAD를 비교합니다.'
  ])('skips Korean technical prose from English-to-Korean translation: %s', (text) => {
    expect(isTranslatableText(text, 'ko')).toBe(false);
    expect(classifyTextLanguage(text)).toBe('ko');
  });

  it('keeps pure English text eligible for translation', () => {
    expect(isTranslatableText('This is a pure English technical review.', 'ko')).toBe(true);
  });

  it('keeps text immediately below the 10% Hangul skip boundary translatable', () => {
    expect(isTranslatableText(BELOW_HANGUL_SKIP_RATIO, 'ko')).toBe(true);
    expect(classifyTextLanguage(BELOW_HANGUL_SKIP_RATIO)).toBe('en');
  });

  it('skips text at the 10% Hangul boundary', () => {
    expect(isTranslatableText(AT_HANGUL_SKIP_RATIO, 'ko')).toBe(false);
    expect(classifyTextLanguage(AT_HANGUL_SKIP_RATIO)).toBe('ko');
  });

  it('does not apply the ratio rule when fewer than two Hangul letters are present', () => {
    expect(isTranslatableText(SINGLE_HANGUL_AT_RATIO, 'ko')).toBe(true);
    expect(classifyTextLanguage(SINGLE_HANGUL_AT_RATIO)).toBe('en');
  });

  it('translates English text containing a small amount of Korean', () => {
    expect(isTranslatableText('This English post contains 한글 in a quoted name.', 'ko')).toBe(true);
  });

  it('skips standalone handles while translating inline mentions', () => {
    expect(isStandaloneHandle('@dreyaleigh')).toBe(true);
    expect(isStandaloneHandle(' @PeetyMcFly8871 ')).toBe(true);
    expect(isStandaloneHandle('@dreyaleigh,')).toBe(false);
    expect(isStandaloneHandle('Thanks @dreyaleigh for sharing this.')).toBe(false);
    expect(isTranslatableText('@dreyaleigh', 'ko')).toBe(false);
    expect(isTranslatableText('Thanks @dreyaleigh for sharing this.', 'ko')).toBe(true);
  });

  it('rejects symbols and short text at the language boundary', () => {
    expect(isTranslatableText('123 !? 🐈', 'ko')).toBe(false);
    expect(isTranslatableText('Go', 'ko')).toBe(false);
    expect(isTranslatableText('Yes', 'ko')).toBe(true);
  });

  it('classifies titles independently from the root language', () => {
    document.documentElement.lang = 'ko-KR';
    document.title = 'An English post title';
    expect(isTranslatableTitle(document, 'ko')).toBe(true);
    document.title = '한국어 게시글 제목입니다.';
    expect(isTranslatableTitle(document, 'ko')).toBe(false);
  });
});
