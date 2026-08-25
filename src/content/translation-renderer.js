export const TRANSLATION_TAG = 'translight-translation';
export const GENERATED_ATTRIBUTE = 'data-translight-generated';
export const SESSION_ATTRIBUTE = 'data-translight-session-id';
export const SOURCE_ATTRIBUTE = 'data-translight-source-id';
export const TRANSLATED_ATTRIBUTE = 'data-translight-translated';

const GENERATED_VALUE = 'true';
const STYLE_ATTRIBUTE = 'data-translight-style';

const TRANSLATION_STYLE = `
  ${TRANSLATION_TAG}[${GENERATED_ATTRIBUTE}="true"] {
    box-sizing: border-box !important;
    display: block !important;
    width: auto !important;
    min-height: 0 !important;
    margin: 0.45em 0 1em !important;
    padding: 0 !important;
    border: 0 !important;
    outline: 0 !important;
    background: transparent !important;
    color: inherit !important;
    font-family: inherit !important;
    font-size: 0.95em !important;
    font-weight: normal !important;
    font-style: normal !important;
    line-height: inherit !important;
    letter-spacing: normal !important;
    text-align: inherit !important;
    text-decoration: none !important;
    text-transform: none !important;
    white-space: pre-wrap !important;
    word-break: normal !important;
    overflow-wrap: anywhere !important;
  }
`;

function ensureStyle(document, sessionId) {
  const style = document.createElement('style');
  style.setAttribute(GENERATED_ATTRIBUTE, GENERATED_VALUE);
  style.setAttribute(SESSION_ATTRIBUTE, sessionId);
  style.setAttribute(STYLE_ATTRIBUTE, GENERATED_VALUE);
  style.textContent = TRANSLATION_STYLE;
  (document.head ?? document.documentElement ?? document.body).appendChild(style);
  return style;
}

export class TranslationRenderer {
  constructor({ document = globalThis.document, sessionId }) {
    if (!document) throw new Error('TranslationRenderer에는 document가 필요합니다.');
    this.document = document;
    this.sessionId = sessionId;
    this.records = new Map();
    this.style = ensureStyle(document, sessionId);
  }

  insert({ element, sourceId, translatedText }) {
    if (!element?.parentNode || !sourceId) return null;
    if (this.records.has(sourceId)) return this.records.get(sourceId).translation;
    if (element.getAttribute(SOURCE_ATTRIBUTE)) return null;

    const translation = this.document.createElement(TRANSLATION_TAG);
    translation.setAttribute('translate', 'no');
    translation.setAttribute(GENERATED_ATTRIBUTE, GENERATED_VALUE);
    translation.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    translation.setAttribute(SOURCE_ATTRIBUTE, sourceId);
    translation.textContent = String(translatedText ?? '');

    element.setAttribute(SOURCE_ATTRIBUTE, sourceId);
    element.setAttribute(TRANSLATED_ATTRIBUTE, GENERATED_VALUE);
    element.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    element.parentNode.insertBefore(translation, element.nextSibling);

    this.records.set(sourceId, { element, translation });
    return translation;
  }

  removeAll() {
    for (const { element, translation } of this.records.values()) {
      translation?.parentNode?.removeChild(translation);
      if (element?.getAttribute(SESSION_ATTRIBUTE) === this.sessionId) {
        element.removeAttribute(SOURCE_ATTRIBUTE);
        element.removeAttribute(TRANSLATED_ATTRIBUTE);
        element.removeAttribute(SESSION_ATTRIBUTE);
      }
    }

    const generatedNodes = this.document.querySelectorAll(`[${SESSION_ATTRIBUTE}]`);
    for (const node of generatedNodes) {
      if (node.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) continue;
      if (node.getAttribute(GENERATED_ATTRIBUTE) === GENERATED_VALUE) {
        node.parentNode?.removeChild(node);
      } else {
        node.removeAttribute(SOURCE_ATTRIBUTE);
        node.removeAttribute(TRANSLATED_ATTRIBUTE);
        node.removeAttribute(SESSION_ATTRIBUTE);
      }
    }

    this.style?.parentNode?.removeChild(this.style);
    this.records.clear();
  }
}
