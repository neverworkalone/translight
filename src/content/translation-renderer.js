import {
  DEFAULT_SETTINGS,
  TRANSLATION_MODES,
  TRANSLATION_STYLES,
  normalizeColor
} from '../settings.js';
import {hashSourceText} from './translation-queue.js';

export const TRANSLATION_TAG = 'translight-translation';
export const GENERATED_ATTRIBUTE = 'data-translight-generated';
export const SESSION_ATTRIBUTE = 'data-translight-session-id';
export const SOURCE_ATTRIBUTE = 'data-translight-source-id';
export const SOURCE_HASH_ATTRIBUTE = 'data-translight-source-hash';
export const PENDING_SOURCE_HASH_ATTRIBUTE = 'data-translight-pending-source-hash';
export const PRESENTATION_HASH_ATTRIBUTE = 'data-translight-presentation-hash';
export const TRANSLATED_ATTRIBUTE = 'data-translight-translated';
export const HIDDEN_ATTRIBUTE = 'data-translight-original-hidden';
export const HIDDEN_PLACEMENT_ATTRIBUTE = 'data-translight-hidden-placement';
export const REPLACED_ATTRIBUTE = 'data-translight-replaced';
export const STYLED_REPLACEMENT_ATTRIBUTE = 'data-translight-styled-replacement';

const GENERATED_VALUE = 'true';
const STYLE_ATTRIBUTE = 'data-translight-style';
const MODE_ATTRIBUTE = 'data-translight-mode';
const ROLE_ATTRIBUTE = 'data-translight-role';
const ROLE_TRANSLATION = 'translation';
const ROLE_ORIGINAL = 'original';
const TRANSLATION_TEXT_ATTRIBUTE = 'data-translight-text';
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const LAYOUT_DISPLAYS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const ATTRIBUTE_NAMES = [
  SOURCE_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  PENDING_SOURCE_HASH_ATTRIBUTE,
  PRESENTATION_HASH_ATTRIBUTE,
  TRANSLATED_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  REPLACED_ATTRIBUTE,
  STYLED_REPLACEMENT_ATTRIBUTE,
  STYLE_ATTRIBUTE,
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

function normalizeSourceText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n\f ]+/g, ' ')
    .trim();
}

function collectSourceTextNodes(element, mixedContent = false) {
  const nodes = [];
  const visit = (parent) => {
    for (const child of parent.childNodes ?? []) {
      if (child.nodeType === 3) {
        nodes.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.matches(EXCLUDED_CONTENT_SELECTOR) || child.matches(GENERATED_SELECTOR)) continue;
      if (mixedContent && child.matches(BLOCK_SELECTOR)) continue;
      visit(child);
    }
  };
  visit(element);
  return nodes;
}

function sourceTextFromNodes(nodes) {
  return Array.from(nodes ?? [], (node) => node.nodeValue ?? '').join('');
}

function setSourceTextNodes(nodes, value) {
  if (!nodes.length) return;
  nodes[0].nodeValue = String(value ?? '');
  for (const node of nodes.slice(1)) node.nodeValue = '';
}

function snapshotTextNodes(nodes) {
  return nodes.map((node) => node.nodeValue ?? '');
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
  const replacementSelector = `[${REPLACED_ATTRIBUTE}="${GENERATED_VALUE}"][${STYLED_REPLACEMENT_ATTRIBUTE}="${GENERATED_VALUE}"][${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const styledSelector = `${selector}:not([${ROLE_ATTRIBUTE}="${ROLE_ORIGINAL}"])`;
  const styleSelector = (style) =>
    `${styledSelector}[${STYLE_ATTRIBUTE}="${style}"], ${replacementSelector}[${STYLE_ATTRIBUTE}="${style}"]`;
  const hiddenSelector = `[${HIDDEN_ATTRIBUTE}="true"][${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const highlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const miniHighlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.MINI_HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const replacementHighlightSelector = `${replacementSelector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.HIGHLIGHT}"]`;
  const replacementMiniHighlightSelector = `${replacementSelector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.MINI_HIGHLIGHT}"]`;
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

    ${replacementSelector} {
      --translight-style-color: ${presentation.styleColor};
      --translight-text-color: ${presentation.textColor};
      --translight-font-weight: ${weight};
      --translight-font-style: ${fontStyle};
      color: var(--translight-text-color) !important;
      font-weight: var(--translight-font-weight) !important;
      font-style: var(--translight-font-style) !important;
    }
    ${selector}[${ROLE_ATTRIBUTE}="${ROLE_ORIGINAL}"] {
      color: inherit !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      font-style: inherit !important;
      line-height: inherit !important;
      margin: 0.45em 0 1em !important;
    }

    ${styleSelector(TRANSLATION_STYLES.LEFT_BORDER)} {
      border-left: 3px solid var(--translight-style-color) !important;
      padding-left: 0.7em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.DOTTED_BORDER)} {
      border: 1px dotted var(--translight-style-color) !important;
      padding: 0.35em 0.6em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.SOLID_BORDER)} {
      border: 1px solid var(--translight-style-color) !important;
      padding: 0.35em 0.6em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.DOTTED_UNDERLINE)} {
      text-decoration: underline dotted var(--translight-style-color) !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 0.2em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.SOLID_UNDERLINE)} {
      text-decoration: underline solid var(--translight-style-color) !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 0.2em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.SEPARATOR)} {
      border-top: 1px solid var(--translight-style-color) !important;
      padding-top: 0.55em !important;
    }
    ${styleSelector(TRANSLATION_STYLES.BACKGROUND)} {
      background: var(--translight-style-color) !important;
      padding: 0.3em 0.5em !important;
    }
    ${highlightTextSelector},
    ${miniHighlightTextSelector},
    ${replacementHighlightSelector},
    ${replacementMiniHighlightSelector} {
      -webkit-box-decoration-break: clone !important;
      box-decoration-break: clone !important;
      line-height: 1 !important;
    }
    ${highlightTextSelector},
    ${replacementHighlightSelector} {
      background: var(--translight-style-color) !important;
      border-radius: 0.12em !important;
      padding: 0 0.12em !important;
    }
    ${miniHighlightTextSelector},
    ${replacementMiniHighlightSelector} {
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

  currentSourceTextNodes(record) {
    const nodes = collectSourceTextNodes(record.element, record.mixedContent);
    record.sourceTextNodes = nodes;
    return nodes;
  }

  restoreSourceText(record) {
    if (!record.replaced) return;
    const nodes = collectSourceTextNodes(record.element, record.mixedContent);
    const expectedText = normalizeSourceText(record.presentedText ?? record.translatedText);
    if (normalizeSourceText(sourceTextFromNodes(nodes)) !== expectedText) {
      record.sourceTextNodes = nodes;
      record.originalTextNodeValues = snapshotTextNodes(nodes);
      record.originalText = normalizeSourceText(sourceTextFromNodes(nodes));
      record.replaced = false;
      record.presentedText = null;
      return;
    }

    const originalNodes = record.sourceTextNodes ?? [];
    const canRestoreExact = nodes.length === originalNodes.length &&
      nodes.every((node, index) => node === originalNodes[index]);
    if (canRestoreExact) {
      nodes.forEach((node, index) => {
        node.nodeValue = record.originalTextNodeValues?.[index] ?? '';
      });
    } else {
      setSourceTextNodes(nodes, record.originalText);
    }
    record.sourceTextNodes = nodes;
    record.replaced = false;
    record.presentedText = null;
  }

  replaceSourceText(record) {
    const nodes = this.currentSourceTextNodes(record);
    setSourceTextNodes(nodes, record.translatedText);
    record.replaced = true;
    record.presentedText = String(record.translatedText ?? '');
  }

  refreshOriginalSnapshot(record, sourceText) {
    if (record.replaced) {
      const nodes = this.currentSourceTextNodes(record);
      if (sourceText == null) this.restoreSourceText(record);
      else {
        setSourceTextNodes(nodes, sourceText);
        record.sourceTextNodes = nodes;
        record.replaced = false;
        record.presentedText = null;
      }
    }

    const nodes = this.currentSourceTextNodes(record);
    const currentText = sourceTextFromNodes(nodes);
    record.sourceTextNodes = nodes;
    record.originalTextNodeValues = snapshotTextNodes(nodes);
    record.originalText = normalizeSourceText(sourceText ?? currentText);
  }

  applyReplacementAttributes(record, {styled = false} = {}) {
    const {element} = record;
    element.setAttribute(REPLACED_ATTRIBUTE, GENERATED_VALUE);
    element.setAttribute(PRESENTATION_HASH_ATTRIBUTE, hashSourceText(normalizeSourceText(record.translatedText)));
    if (styled) {
      element.setAttribute(STYLED_REPLACEMENT_ATTRIBUTE, GENERATED_VALUE);
      element.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle);
    } else {
      restoreAttribute(element, STYLED_REPLACEMENT_ATTRIBUTE, record.originalAttributes?.[STYLED_REPLACEMENT_ATTRIBUTE]);
      restoreAttribute(element, STYLE_ATTRIBUTE, record.originalAttributes?.[STYLE_ATTRIBUTE]);
    }
    element.removeAttribute(HIDDEN_ATTRIBUTE);
    element.removeAttribute(HIDDEN_PLACEMENT_ATTRIBUTE);
  }

  clearReplacementAttributes(record) {
    const {element} = record;
    element.removeAttribute(REPLACED_ATTRIBUTE);
    element.removeAttribute(PRESENTATION_HASH_ATTRIBUTE);
    restoreAttribute(element, STYLED_REPLACEMENT_ATTRIBUTE, record.originalAttributes?.[STYLED_REPLACEMENT_ATTRIBUTE]);
    restoreAttribute(element, STYLE_ATTRIBUTE, record.originalAttributes?.[STYLE_ATTRIBUTE]);
    restoreAttribute(element, HIDDEN_ATTRIBUTE, record.originalAttributes?.[HIDDEN_ATTRIBUTE]);
    restoreAttribute(element, HIDDEN_PLACEMENT_ATTRIBUTE, record.originalAttributes?.[HIDDEN_PLACEMENT_ATTRIBUTE]);
  }

  applyRecordPresentation(record) {
    const {element, translation} = record;
    if (!element || !translation) return;
    const mode = this.presentation.translationMode;
    translation.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle);
    translation.setAttribute(MODE_ATTRIBUTE, mode);
    if (mode === TRANSLATION_MODES.ORIGINAL_TRANSLATION) {
      this.restoreSourceText(record);
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
      setTranslationText(translation, record.translatedText);
      restorePlacement(record);
      this.clearReplacementAttributes(record);
      return;
    }

    this.replaceSourceText(record);
    if (mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) {
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_ORIGINAL);
      setTranslationText(translation, record.originalText);
      restorePlacement(record);
    } else {
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
      setTranslationText(translation, record.translatedText);
      translation.parentNode?.removeChild(translation);
    }
    this.applyReplacementAttributes(record, {styled: mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL});
  }

  insert({element, sourceId, sourceHash, translatedText, text, mixedContent = false}) {
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
      const sourceChanged = Boolean(sourceHash && sourceHash !== existing.sourceHash) || Boolean(pendingHash);
      const structureChanged = existing.mixedContent !== nextMixedContent;
      if (existing.mixedContent !== nextMixedContent) {
        existing.translation.parentNode?.removeChild(existing.translation);
        existing.mixedContent = nextMixedContent;
        existing.placement = insertAtSafeLocation(element, existing.translation, nextMixedContent);
      }
      if (sourceChanged || structureChanged) {
        this.refreshOriginalSnapshot(existing, text);
      }
      existing.translatedText = String(translatedText ?? '');
      setTranslationText(existing.translation, translatedText);
      existing.sourceHash = sourceHash ?? existing.sourceHash;
      if (sourceHash) element.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
      element.removeAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
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
    translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
    const translationText = this.document.createElement('span');
    translationText.setAttribute(TRANSLATION_TEXT_ATTRIBUTE, GENERATED_VALUE);
    translationText.textContent = String(translatedText ?? '');
    translation.appendChild(translationText);
    const sourceTextNodes = collectSourceTextNodes(element, Boolean(mixedContent));
    const sourceText = text ?? sourceTextFromNodes(sourceTextNodes);
    const record = {
      element,
      translation,
      sourceId,
      sourceHash: sourceHash ?? '',
      mixedContent: Boolean(mixedContent),
      placement: null,
      originalAttributes: getOriginalAttributes(element),
      sourceTextNodes,
      originalTextNodeValues: snapshotTextNodes(sourceTextNodes),
      originalText: normalizeSourceText(sourceText),
      translatedText: String(translatedText ?? ''),
      replaced: false,
      presentedText: null
    };
    record.placement = insertAtSafeLocation(element, translation, mixedContent);

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
      this.restoreSourceText(record);
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
