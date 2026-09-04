const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?/i;
const HANGUL_CHARACTER = /[\uac00-\ud7af\u3130-\u318f]/u;
const LETTER_CHARACTER = /^\p{L}$/u;
const LATIN_CHARACTER = /^\p{Script=Latin}$/u;
const STANDALONE_HANDLE_PATTERN = /^@[\p{L}\p{N}._-]+$/u;
const WORD_PATTERN = /[\p{L}]+(?:['’][\p{L}]+)?/gu;
// These words are intentionally narrower than general English stopwords. They
// are useful lexical evidence because they are less likely to be shared
// verbatim by Spanish, French, or German. A word from this set is not enough
// for a long sentence on its own; repeated/common words must not manufacture
// confidence.
const ENGLISH_DISCRIMINATIVE_WORDS = new Set([
  'access', 'active', 'accommodations', 'added', 'article', 'arrived', 'around', 'away',
  'background', 'base', 'block', 'body', 'breaking', 'cached', 'carefully', 'cell',
  'change', 'changed', 'changes', 'checks', 'chrome', 'close', 'column', 'community',
  'contains', 'content', 'current', 'deeply', 'denied', 'difficulty', 'dining',
  'direct', 'docs', 'drama', 'else', 'enough', 'english', 'example', 'explains',
  'facilities', 'favorite', 'favourites', 'final', 'first', 'fresh', 'growing', 'guide',
  'generic', 'guests', 'heading', 'headline', 'hello', 'home', 'hours', 'important', 'independent',
  'initial', 'interactive', 'introduction', 'investigator', 'item', 'jump', 'keeps',
  'language', 'late', 'latest', 'lawsuit', 'leaf', 'list', 'long', 'meaningful', 'nested',
  'nerd', 'news', 'new', 'next', 'nominations', 'note', 'number', 'old', 'open', 'opening', 'overview',
  'paragraph', 'parent', 'phone', 'playthrough', 'post', 'preview', 'prime', 'provider',
  'pure', 'quoted', 'queue', 'read', 'remarkable', 'remains', 'rendered', 'results',
  'review', 'rooms', 'search', 'second', 'sentence', 'settles', 'sharing', 'short', 'spa',
  'stable', 'story', 'technical', 'team', 'teen', 'thanks', 'third', 'title', 'touch',
  'translatable',
  'translated', 'translation', 'trophy', 'untitled', 'user', 'value', 'visible',
  'visit', 'why', 'win', 'words', 'world', 'written', 'yes'
]);

// A single short label can be valid evidence when it is itself distinctive,
// but ambiguous labels such as "go", "text", or "page" remain undecided.
const ENGLISH_SHORT_LABEL_WORDS = new Set([
  'access', 'active', 'block', 'body', 'breaking', 'cached', 'cell', 'close',
  'added', 'base', 'denied', 'difficulty', 'direct', 'docs', 'else', 'english', 'facilities', 'first',
  'generic', 'guests', 'hello', 'heading', 'headline', 'home', 'hours', 'initial', 'investigator', 'item',
  'language', 'latest', 'list', 'news', 'nerd', 'new', 'nominations', 'old', 'open', 'paragraph',
  'phone', 'playthrough', 'preview', 'pure', 'read', 'results', 'search', 'second',
  'short', 'spa', 'stable', 'technical', 'thanks', 'third', 'title', 'user', 'value',
  'untitled', 'visible', 'why', 'win', 'world', 'yes'
]);

// Function words are supporting evidence only. They are deliberately not
// counted as English signals by themselves because words such as "no", "a",
// "in", and "text" also occur in other Latin-script languages.
const ENGLISH_FUNCTION_WORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'are', 'as', 'at', 'be',
  'been', 'before', 'between', 'both', 'but', 'by', 'can', 'could', 'did',
  'do', 'does', 'each', 'for', 'from', 'had', 'has', 'have', 'her', 'here',
  'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'more', 'most', 'my', 'new', 'no', 'not', 'now', 'of', 'on', 'one', 'only',
  'or', 'other', 'our', 'out', 'over', 'own', 'same', 'see', 'she', 'should',
  'so', 'some', 'somebody', 'such', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'up', 'use', 'used', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your'
]);

const ENGLISH_MORPHOLOGY_PATTERNS = [
  /(?:ing|ings)$/u,
  /(?:ed|edly)$/u,
  /(?:ly|ness|ship|ward|wise)$/u
];

export const LANGUAGE_MIN_LETTERS = 3;
export const LANGUAGE_MIN_LATIN_LETTERS = 2;
export const LANGUAGE_MIN_HANGUL_LETTERS = 2;
export const HANGUL_SKIP_RATIO = 0.1;

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

function hasEnglishSignal(value) {
  const words = String(value ?? '').toLowerCase().match(WORD_PATTERN) ?? [];
  const uniqueWords = new Set(words);
  const discriminativeWords = new Set(
    [...uniqueWords].filter((word) => ENGLISH_DISCRIMINATIVE_WORDS.has(word))
  );
  const morphologyWords = new Set(
    [...uniqueWords].filter((word) =>
      word.length >= 5 && ENGLISH_MORPHOLOGY_PATTERNS.some((pattern) => pattern.test(word))
    )
  );
  const evidenceWords = new Set([...discriminativeWords, ...morphologyWords]);
  if (evidenceWords.size === 0) return false;

  // Short labels do not have enough context for a confidence score. Accept
  // only a known high-confidence label or two separate pieces of evidence.
  if (words.length <= 3) {
    return [...discriminativeWords].some((word) => ENGLISH_SHORT_LABEL_WORDS.has(word)) ||
      evidenceWords.size >= 2;
  }

  // Longer text needs either two distinct lexical/morphological clues or one
  // clue supported by multiple English function words. Function words alone,
  // including repeated occurrences of one word, never qualify.
  if (evidenceWords.size >= 2) return true;

  const functionWords = new Set(
    [...uniqueWords].filter((word) => ENGLISH_FUNCTION_WORDS.has(word))
  );
  return evidenceWords.size === 1 && functionWords.size >= 2;
}

function hasHangulSkipRatio(stats) {
  return stats.hangulCount >= LANGUAGE_MIN_HANGUL_LETTERS &&
    stats.hangulCount / Math.max(stats.letterCount, 1) >= HANGUL_SKIP_RATIO;
}

/**
 * Classify only the languages that the built-in en-to-ko provider can act on.
 * A blank result means the text is too short, contains no useful letters, or
 * is not confidently English/Korean from its character composition. For
 * undeclared Latin text, character composition alone is not enough: a small
 * English lexical signal is required to avoid sending other Latin languages
 * to the provider's en source-language model.
 */
export function classifyTextLanguage(value) {
  const stats = analyzeText(value);
  if (!hasDetectableText(stats)) return '';
  if (hasHangulSkipRatio(stats)) return 'ko';
  if (stats.latinCount >= LANGUAGE_MIN_LATIN_LETTERS && hasEnglishSignal(value)) return 'en';
  return '';
}

export function isTextInLanguage(value, targetLanguage) {
  const target = normalizeLanguageCode(targetLanguage);
  return Boolean(target && classifyTextLanguage(value) === target);
}

/**
 * User handles are identifiers, not translatable content. Keep this exact so
 * mentions that appear inside a sentence remain eligible for translation.
 */
export function isStandaloneHandle(value) {
  return STANDALONE_HANDLE_PATTERN.test(String(value ?? '').trim());
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
 * Content-based Korean protection takes precedence over a local English
 * declaration. An explicit English declaration is sufficient; otherwise the
 * conservative English signal must also be present before en-to-ko translation
 * is allowed.
 */
export function isTranslatableBlock(element, text, targetLanguage = 'ko') {
  const target = normalizeLanguageCode(targetLanguage);
  if (isStandaloneHandle(text)) return false;
  const stats = analyzeText(text);
  if (!target || !hasDetectableText(stats)) return false;

  if (target === 'ko' && hasHangulSkipRatio(stats)) return false;

  const declared = nearestContentLanguage(element);
  if (declared === target) return false;
  if (declared === 'en') return true;
  if (declared) return false;

  return target === 'ko' &&
    stats.latinCount >= LANGUAGE_MIN_LATIN_LETTERS &&
    hasEnglishSignal(text);
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
