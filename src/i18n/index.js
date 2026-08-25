import englishMessages from '../../_locales/en/messages.json';

export const FALLBACK_LANGUAGE = 'en';

function normalizeSubstitutions(substitutions) {
  if (substitutions == null) return [];
  return (Array.isArray(substitutions) ? substitutions : [substitutions]).map((value) => String(value));
}

function applyFallbackSubstitutions(message, placeholders, substitutions) {
  let result = message;
  for (const [name, placeholder] of Object.entries(placeholders ?? {})) {
    const match = String(placeholder.content ?? '').match(/^\$(\d+)$/);
    const index = match ? Number(match[1]) - 1 : -1;
    if (index >= 0 && substitutions[index] !== undefined) {
      result = result.replaceAll(`$${name}$`, substitutions[index]);
    }
  }
  return result;
}

function getEnglishFallback(key, substitutions) {
  const message = englishMessages[key];
  if (!message?.message) return key;
  return applyFallbackSubstitutions(message.message, message.placeholders, substitutions);
}

export function t(key, substitutions) {
  const normalizedSubstitutions = normalizeSubstitutions(substitutions);
  const getMessage = globalThis.chrome?.i18n?.getMessage;

  if (typeof getMessage === 'function') {
    try {
      const localizedMessage = getMessage.call(globalThis.chrome.i18n, key, normalizedSubstitutions);
      if (localizedMessage) return localizedMessage;
    } catch {
      // Fall through to the bundled English messages.
    }
  }

  return getEnglishFallback(key, normalizedSubstitutions);
}
