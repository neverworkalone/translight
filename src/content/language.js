const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?/i;
const HANGUL_CHARACTER = /[\uac00-\ud7af\u3130-\u318f]/u;
const LETTER_CHARACTER = /^\p{L}$/u;
const LATIN_CHARACTER = /^\p{Script=Latin}$/u;

export const LANGUAGE_MIN_LETTERS = 3;
export const LANGUAGE_MIN_LATIN_LETTERS = 2;
export const LANGUAGE_MIN_HANGUL_LETTERS = 2;
export const HANGUL_DOMINANCE_RATIO = 0.5;

export function normalizeLanguageCode(value) {
  const match = String(value ?? '').trim().match(LANGUAGE_CODE_PATTERN);
  return match ? match[0].split(/[-_]/)[0].toLowerCase() : '';
}

function analyzeText(value) {
  const stats = {
    letterCount: 0,
    latinCount: 0,
    hangulCount: 0
  };

  for (const character of String(value ?? '')) {
    if (!LETTER_CHARACTER.test(character)) continue;
    stats.letterCount += 1;
    if (LATIN_CHARACTER.test(character)) stats.latinCount += 1;
    if (HANGUL_CHARACTER.test(character)) stats.hangulCount += 1;
  }

  return stats;
}

function hasDetectableText(stats) {
  return stats.letterCount >= LANGUAGE_MIN_LETTERS &&
    (stats.latinCount > 0 || stats.hangulCount > 0);
}

function isHangulDominant(stats) {
  return stats.hangulCount >= LANGUAGE_MIN_HANGUL_LETTERS &&
    stats.hangulCount / Math.max(stats.letterCount, 1) >= HANGUL_DOMINANCE_RATIO;
}

/**
 * Classify only the languages that the built-in en-to-ko provider can act on.
 * A blank result means the text is too short, contains no useful letters, or
 * is not confidently English/Korean from its character composition.
 */
export function classifyTextLanguage(value) {
  const stats = analyzeText(value);
  if (!hasDetectableText(stats)) return '';
  if (isHangulDominant(stats)) return 'ko';
  if (stats.latinCount >= LANGUAGE_MIN_LATIN_LETTERS) return 'en';
  return '';
}

export function isTextInLanguage(value, targetLanguage) {
  const target = normalizeLanguageCode(targetLanguage);
  return Boolean(target && classifyTextLanguage(value) === target);
}

/**
 * Return the nearest language declaration that applies to a content element.
 * html and body are intentionally skipped because localized sites commonly
 * use those elements for UI language rather than the language of each post.
 */
export function nearestContentLanguage(element) {
  let current = element;
  while (current?.nodeType === 1) {
    const tagName = current.tagName?.toLowerCase();
    if (tagName === 'html' || tagName === 'body') break;

    const declared = current.getAttribute?.('lang');
    if (declared != null) {
      const normalized = normalizeLanguageCode(declared);
      if (normalized) return normalized;
      if (!declared.trim()) return '';
    }
    current = current.parentElement;
  }
  return '';
}

/**
 * Decide whether a collected content block should be sent to the provider.
 * Explicit local declarations take precedence over the character heuristic;
 * the heuristic intentionally recognizes English only for the current
 * en-to-ko product scope.
 */
export function isTranslatableBlock(element, text, targetLanguage = 'ko') {
  const target = normalizeLanguageCode(targetLanguage);
  const stats = analyzeText(text);
  if (!target || !hasDetectableText(stats)) return false;

  const declared = nearestContentLanguage(element);
  if (declared === target) return false;
  if (declared === 'en') return true;
  if (declared) return false;

  return target === 'ko' &&
    stats.latinCount >= LANGUAGE_MIN_LATIN_LETTERS &&
    !isHangulDominant(stats);
}

export function isTranslatableText(text, targetLanguage = 'ko') {
  return isTranslatableBlock(null, text, targetLanguage);
}

export function isTranslatableTitle(document, targetLanguage = 'ko') {
  const title = String(document?.title ?? '');
  return isTranslatableBlock(document?.querySelector?.('title'), title, targetLanguage);
}

/**
 * Kept as a compatibility helper for callers that need a document-level
 * answer. It now uses body text only; a root lang declaration is never a
 * conclusive signal.
 */
export function isDocumentInLanguage(document, targetLanguage) {
  const text = String(document?.body?.innerText || document?.body?.textContent || '');
  return isTextInLanguage(text, targetLanguage);
}
