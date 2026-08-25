const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?/i;
const HANGUL_CHARACTER = /[\uac00-\ud7af\u3130-\u318f]/u;

export function normalizeLanguageCode(value) {
  const match = String(value ?? '').trim().match(LANGUAGE_CODE_PATTERN);
  return match ? match[0].split(/[-_]/)[0].toLowerCase() : '';
}

function declaredLanguage(document) {
  const root = document?.documentElement;
  const rootLanguage = root?.getAttribute?.('lang') || root?.lang;
  if (rootLanguage) return rootLanguage;

  for (const meta of document?.querySelectorAll?.('meta') ?? []) {
    const name = (meta.getAttribute('http-equiv') || meta.getAttribute('name') || '').toLowerCase();
    if (name === 'content-language' || name === 'language') {
      const content = meta.getAttribute('content');
      if (content) return content;
    }
  }
  return '';
}

function isKoreanTextDominant(document) {
  const text = String(document?.body?.innerText || document?.body?.textContent || '');
  let letterCount = 0;
  let hangulCount = 0;

  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    letterCount += 1;
    if (HANGUL_CHARACTER.test(character)) hangulCount += 1;
  }

  return hangulCount >= 20 && hangulCount / Math.max(letterCount, 1) >= 0.5;
}

export function isDocumentInLanguage(document, targetLanguage) {
  const target = normalizeLanguageCode(targetLanguage);
  if (!target) return false;

  const declared = normalizeLanguageCode(declaredLanguage(document));
  if (declared) return declared === target;

  return target === 'ko' && isKoreanTextDominant(document);
}
