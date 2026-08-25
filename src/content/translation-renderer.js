import {
  DEFAULT_SETTINGS,
  TRANSLATION_MODES,
  TRANSLATION_STYLES,
  normalizeColor
} from '../settings.js';

export const TRANSLATION_TAG = 'translight-translation';
export const GENERATED_ATTRIBUTE = 'data-translight-generated';
export const SESSION_ATTRIBUTE = 'data-translight-session-id';
export const SOURCE_ATTRIBUTE = 'data-translight-source-id';
export const SOURCE_HASH_ATTRIBUTE = 'data-translight-source-hash';
export const PENDING_SOURCE_HASH_ATTRIBUTE = 'data-translight-pending-source-hash';
export const TRANSLATED_ATTRIBUTE = 'data-translight-translated';
export const HIDDEN_ATTRIBUTE = 'data-translight-original-hidden';
export const HIDDEN_PLACEMENT_ATTRIBUTE = 'data-translight-hidden-placement';

const GENERATED_VALUE = 'true';
const STYLE_ATTRIBUTE = 'data-translight-style';
const MODE_ATTRIBUTE = 'data-translight-mode';
const TRANSLATION_TEXT_ATTRIBUTE = 'data-translight-text';
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div';
const LAYOUT_DISPLAYS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const ATTRIBUTE_NAMES = [
  SOURCE_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  PENDING_SOURCE_HASH_ATTRIBUTE,
  TRANSLATED_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  HIDDEN_ATTRIBUTE,
  HIDDEN_PLACEMENT_ATTRIBUTE
];

function escapeAttribute(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getDisplay(element) {
  const view = element?.ownerDocument?.defaultView;
  return view?.getComputedStyle?.(element)?.display || element?.style?.display || '';
}

function getDirectNestedList(element) {
  return Array.from(element.children ?? []).find((child) => {
    const tagName = child.tagName?.toLowerCase();
    return tagName === 'ul' || tagName === 'ol';
  });
}

function shouldInsertInside(element) {
  if (element.tagName?.toLowerCase() === 'li') return true;
  return LAYOUT_DISPLAYS.has(getDisplay(element.parentElement));
}

function insertAtSafeLocation(element, translation, mixedContent = false) {
  if (mixedContent) {
    if (element.tagName?.toLowerCase() === 'li') {
      const nestedList = getDirectNestedList(element);
      if (nestedList) {
        element.insertBefore(translation, nestedList);
        return 'inside-before-first-block';
      }
    }
    const firstNestedBlock = Array.from(element.children ?? []).find((child) =>
      child.matches?.(BLOCK_SELECTOR) || child.querySelector?.(BLOCK_SELECTOR)
    );
    if (firstNestedBlock) {
      element.insertBefore(translation, firstNestedBlock);
      return 'inside-before-first-block';
    }
  }

  if (!shouldInsertInside(element)) {
    element.parentNode.insertBefore(translation, element.nextSibling);
    return 'sibling';
  }

  if (element.tagName?.toLowerCase() === 'li') {
    const nestedList = getDirectNestedList(element);
    if (nestedList) {
      element.insertBefore(translation, nestedList);
      return 'inside-before-nested-list';
    }
  }

  element.appendChild(translation);
  return 'inside';
}

function restorePlacement(record) {
  const {element, translation, placement} = record;
  if (!element?.parentNode || !translation) return;
  if (placement === 'sibling') {
    element.parentNode.insertBefore(translation, element.nextSibling);
    return;
  }
  if (placement === 'inside-before-nested-list') {
    const nestedList = getDirectNestedList(element);
    if (nestedList) {
      element.insertBefore(translation, nestedList);
      return;
    }
  }
  if (placement === 'inside-before-first-block') {
    const firstNestedBlock = Array.from(element.children ?? []).find((child) =>
      child.matches?.(BLOCK_SELECTOR) || child.querySelector?.(BLOCK_SELECTOR)
    );
    if (firstNestedBlock) {
      element.insertBefore(translation, firstNestedBlock);
      return;
    }
  }
  element.appendChild(translation);
}

function getOriginalAttributes(element) {
  return Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, element.getAttribute(name)]));
}

function restoreAttribute(element, name, value) {
  if (value == null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function setTranslationText(translation, value) {
  const text = String(value ?? '');
  const textNode = translation.querySelector?.(`[${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`);
  if (textNode) {
    textNode.textContent = text;
    return;
  }
  translation.textContent = text;
}

function normalizePresentation(settings = {}) {
  const mode = Object.values(TRANSLATION_MODES).includes(settings.translationMode)
    ? settings.translationMode
    : DEFAULT_SETTINGS.translationMode;
  const style = Object.values(TRANSLATION_STYLES).includes(settings.displayStyle)
    ? settings.displayStyle
    : DEFAULT_SETTINGS.displayStyle;
  return {
    translationMode: mode,
    displayStyle: style,
    styleColor: normalizeColor(settings.styleColor, DEFAULT_SETTINGS.styleColor),
    textColor: normalizeColor(settings.textColor, DEFAULT_SETTINGS.textColor),
    bold: settings.bold === true,
    italic: settings.italic === true
  };
}

function styleText(sessionId, presentation) {
  const selector = `${TRANSLATION_TAG}[${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const hiddenSelector = `[${HIDDEN_ATTRIBUTE}="true"][${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const highlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const miniHighlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.MINI_HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const weight = presentation.bold ? '700' : '400';
  const fontStyle = presentation.italic ? 'italic' : 'normal';

  return `
    ${selector} {
      --translight-style-color: ${presentation.styleColor};
      --translight-text-color: ${presentation.textColor};
      --translight-font-weight: ${weight};
      --translight-font-style: ${fontStyle};
      box-sizing: border-box !important;
      display: block !important;
      width: auto !important;
      min-height: 0 !important;
      margin: 0.45em 0 1em !important;
      padding: 0 !important;
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      color: var(--translight-text-color) !important;
      font-family: inherit !important;
      font-size: 0.95em !important;
      font-weight: var(--translight-font-weight) !important;
      font-style: var(--translight-font-style) !important;
      line-height: inherit !important;
      letter-spacing: normal !important;
      text-align: inherit !important;
      text-decoration: none !important;
      text-transform: none !important;
      white-space: pre-wrap !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      visibility: visible !important;
    }

    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.LEFT_BORDER}"] {
      border-left: 3px solid var(--translight-style-color) !important;
      padding-left: 0.7em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.DOTTED_BORDER}"] {
      border: 1px dotted var(--translight-style-color) !important;
      padding: 0.35em 0.6em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.SOLID_BORDER}"] {
      border: 1px solid var(--translight-style-color) !important;
      padding: 0.35em 0.6em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.DOTTED_UNDERLINE}"] {
      text-decoration: underline dotted var(--translight-style-color) !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 0.2em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.SOLID_UNDERLINE}"] {
      text-decoration: underline solid var(--translight-style-color) !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 0.2em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.SEPARATOR}"] {
      border-top: 1px solid var(--translight-style-color) !important;
      padding-top: 0.55em !important;
    }
    ${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.BACKGROUND}"] {
      background: var(--translight-style-color) !important;
      padding: 0.3em 0.5em !important;
    }
    ${highlightTextSelector},
    ${miniHighlightTextSelector} {
      -webkit-box-decoration-break: clone !important;
      box-decoration-break: clone !important;
      line-height: 1 !important;
    }
    ${highlightTextSelector} {
      background: var(--translight-style-color) !important;
      border-radius: 0.12em !important;
      padding: 0 0.12em !important;
    }
    ${miniHighlightTextSelector} {
      background: linear-gradient(to bottom, transparent 50%, var(--translight-style-color) 50%) !important;
      border-radius: 0.1em !important;
      padding: 0 0.06em !important;
    }
    ${hiddenSelector} {
      display: none !important;
    }
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="inside"] {
      display: block !important;
      visibility: hidden !important;
    }
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="inside"] > ${TRANSLATION_TAG} {
      visibility: visible !important;
    }
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="mixed"] {
      display: block !important;
      visibility: hidden !important;
    }
  `;
}

export class TranslationRenderer {
  constructor({document = globalThis.document, sessionId, settings = DEFAULT_SETTINGS}) {
    if (!document) throw new Error('TranslationRenderer requires a document.');
    this.document = document;
    this.sessionId = sessionId;
    this.records = new Map();
    this.recordsByElement = new WeakMap();
    this.presentation = normalizePresentation(settings);
    this.style = document.createElement('style');
    this.style.setAttribute(GENERATED_ATTRIBUTE, GENERATED_VALUE);
    this.style.setAttribute(SESSION_ATTRIBUTE, sessionId);
    this.style.setAttribute(STYLE_ATTRIBUTE, GENERATED_VALUE);
    (document.head ?? document.documentElement ?? document.body).appendChild(this.style);
    this.updateStyleSheet();
  }

  updateStyleSheet() {
    this.style.textContent = styleText(this.sessionId, this.presentation);
  }

  updatePresentation(settings = {}) {
    this.presentation = normalizePresentation({...this.presentation, ...settings});
    this.updateStyleSheet();
    for (const record of this.records.values()) this.applyRecordPresentation(record);
  }

  applyRecordPresentation(record) {
    const {element, translation} = record;
    if (!element || !translation) return;
    const mode = this.presentation.translationMode;
    translation.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle);
    translation.setAttribute(MODE_ATTRIBUTE, mode);
    if (mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) {
      if (record.placement === 'sibling') {
        element.parentNode?.insertBefore(translation, element);
      } else {
        element.insertBefore(translation, element.firstChild);
      }
    } else {
      restorePlacement(record);
    }
    if (mode === TRANSLATION_MODES.TRANSLATION_ONLY) {
      if (!record.originalHiddenAttributeCaptured) {
        record.originalHiddenAttribute = element.getAttribute(HIDDEN_ATTRIBUTE);
        record.originalHiddenAttributeCaptured = true;
      }
      element.setAttribute(HIDDEN_ATTRIBUTE, GENERATED_VALUE);
      if (record.placement === 'sibling') element.removeAttribute(HIDDEN_PLACEMENT_ATTRIBUTE);
      else if (record.mixedContent) element.setAttribute(HIDDEN_PLACEMENT_ATTRIBUTE, 'mixed');
      else element.setAttribute(HIDDEN_PLACEMENT_ATTRIBUTE, 'inside');
    } else if (record.originalHiddenAttributeCaptured) {
      restoreAttribute(element, HIDDEN_ATTRIBUTE, record.originalHiddenAttribute);
      element.removeAttribute(HIDDEN_PLACEMENT_ATTRIBUTE);
    } else {
      element.removeAttribute(HIDDEN_ATTRIBUTE);
      element.removeAttribute(HIDDEN_PLACEMENT_ATTRIBUTE);
    }
  }

  insert({element, sourceId, sourceHash, translatedText, mixedContent = false}) {
    if (!element?.parentNode || !sourceId) return null;
    const existing = this.recordsByElement.get(element) ?? this.records.get(sourceId);
    const pendingHash = element.getAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
    if (pendingHash && sourceHash !== pendingHash) return null;
    const currentHash = element.getAttribute(SOURCE_HASH_ATTRIBUTE);
    if (existing && currentHash && sourceHash && currentHash !== sourceHash && !pendingHash) return null;
    if (existing) {
      if (existing.sourceId !== sourceId) {
        this.records.delete(existing.sourceId);
        existing.sourceId = sourceId;
        this.records.set(sourceId, existing);
      }
      element.setAttribute(SOURCE_ATTRIBUTE, sourceId);
      existing.translation.setAttribute(SOURCE_ATTRIBUTE, sourceId);
      const nextMixedContent = Boolean(mixedContent);
      if (existing.mixedContent !== nextMixedContent) {
        existing.translation.parentNode?.removeChild(existing.translation);
        existing.mixedContent = nextMixedContent;
        existing.placement = insertAtSafeLocation(element, existing.translation, nextMixedContent);
      }
      setTranslationText(existing.translation, translatedText);
      existing.sourceHash = sourceHash ?? existing.sourceHash;
      if (sourceHash) element.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
      element.removeAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
      if (!existing.translation.parentNode) restorePlacement(existing);
      this.applyRecordPresentation(existing);
      return existing.translation;
    }
    if (element.getAttribute(SOURCE_ATTRIBUTE) &&
        element.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) return null;

    const translation = this.document.createElement(TRANSLATION_TAG);
    translation.setAttribute('translate', 'no');
    translation.setAttribute(GENERATED_ATTRIBUTE, GENERATED_VALUE);
    translation.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    translation.setAttribute(SOURCE_ATTRIBUTE, sourceId);
    const translationText = this.document.createElement('span');
    translationText.setAttribute(TRANSLATION_TEXT_ATTRIBUTE, GENERATED_VALUE);
    translationText.textContent = String(translatedText ?? '');
    translation.appendChild(translationText);
    const record = {
      element,
      translation,
      sourceId,
      sourceHash: sourceHash ?? '',
      mixedContent: Boolean(mixedContent),
      placement: insertAtSafeLocation(element, translation, mixedContent),
      originalAttributes: getOriginalAttributes(element),
      originalHiddenAttributeCaptured: false,
      originalHiddenAttribute: null
    };

    element.setAttribute(SOURCE_ATTRIBUTE, sourceId);
    if (sourceHash) element.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
    element.removeAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
    element.setAttribute(TRANSLATED_ATTRIBUTE, GENERATED_VALUE);
    element.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    this.records.set(sourceId, record);
    this.recordsByElement.set(element, record);
    this.applyRecordPresentation(record);
    return translation;
  }

  pruneDisconnected() {
    for (const [sourceId, record] of this.records) {
      if (record.element?.isConnected !== false) continue;
      record.translation?.parentNode?.removeChild(record.translation);
      if (record.element?.getAttribute(SESSION_ATTRIBUTE) === this.sessionId) {
        for (const name of ATTRIBUTE_NAMES) restoreAttribute(record.element, name, record.originalAttributes[name]);
      }
      this.recordsByElement.delete(record.element);
      this.records.delete(sourceId);
    }
  }

  removeAll() {
    for (const record of this.records.values()) {
      const {element, translation, originalAttributes} = record;
      translation?.parentNode?.removeChild(translation);
      if (element?.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) continue;
      for (const name of ATTRIBUTE_NAMES) restoreAttribute(element, name, originalAttributes[name]);
      this.recordsByElement.delete(element);
    }

    const generatedNodes = this.document.querySelectorAll(`[${SESSION_ATTRIBUTE}]`);
    for (const node of generatedNodes) {
      if (node.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) continue;
      if (node.getAttribute(GENERATED_ATTRIBUTE) === GENERATED_VALUE) {
        node.parentNode?.removeChild(node);
      }
    }

    this.style?.parentNode?.removeChild(this.style);
    this.records.clear();
  }
}

export {normalizePresentation};
