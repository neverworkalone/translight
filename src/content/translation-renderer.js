import {
  DEFAULT_SETTINGS,
  TRANSLATION_MODES,
  TRANSLATION_STYLES,
  normalizeColor
} from '../settings.js';
import {
  SEGMENT_ATTRIBUTE,
  SEGMENT_ID_ATTRIBUTE,
  SEGMENT_SELECTOR,
  hasVisibleBlockDescendant,
  isExcluded,
  isHidden
} from './block-collector.js';
import {isTranslatableBlock} from './language.js';
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
export const REPLACEMENT_TEXT_ATTRIBUTE = 'data-translight-replacement-text';

const GENERATED_VALUE = 'true';
const STYLE_ATTRIBUTE = 'data-translight-style';
const MODE_ATTRIBUTE = 'data-translight-mode';
const ROLE_ATTRIBUTE = 'data-translight-role';
const ROLE_TRANSLATION = 'translation';
const ROLE_ORIGINAL = 'original';
const TRANSLATION_TEXT_ATTRIBUTE = 'data-translight-text';
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const LAYOUT_DISPLAYS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const TABLE_CELL_TAGS = new Set(['td', 'th']);
const MAX_RECOVERY_ATTEMPTS = 1;
const STABLE_LIST_SIBLING_PLACEMENT = 'stable-list-sibling';
const COLLAPSED_REVIEW_CARD_PLACEMENT = 'collapsed-review-card-sibling';
const COLLAPSED_REVIEW_TRANSLATION_AFTER_CARD = 'after-card';
const COLLAPSED_REVIEW_TRANSLATION_BEFORE_CARD = 'before-card';
const AMAZON_REVIEW_CONTENT_SELECTOR = '[data-hook="reviewRichContentContainer"]';
const AMAZON_REVIEW_CARD_SELECTOR = '[data-a-card-type="basic"]';
const DOCUMENT_POSITION_FOLLOWING = 4;
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
  HIDDEN_PLACEMENT_ATTRIBUTE,
  SEGMENT_ATTRIBUTE,
  SEGMENT_ID_ATTRIBUTE
];
const MIXED_CONTENT_AFTER_DIRECT_TEXT_PLACEMENT = 'inside-after-direct-text';

function escapeAttribute(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getDisplay(element) {
  const view = element?.ownerDocument?.defaultView;
  return view?.getComputedStyle?.(element)?.display || element?.style?.display || '';
}

const SOURCE_TYPOGRAPHY_PROPERTIES = ['font-size', 'line-height'];
const SOURCE_LAYOUT_PROPERTIES = [
  'width',
  'min-width',
  'max-width',
  'margin-left',
  'margin-right'
];
const MAIN_TEXT_RATIO = 0.5;

function getComputedStyleValue(element, property) {
  const view = element?.ownerDocument?.defaultView;
  const computedStyle = view?.getComputedStyle?.(element);
  if (!computedStyle) return '';
  return computedStyle.getPropertyValue?.(property) || computedStyle[property] || '';
}

function getSourceTypographyElement(record) {
  const {element, sourceTextNodes, originalTextNodeValues} = record;
  if (!element || !sourceTextNodes?.length) return element;

  const textWeights = new Map();
  let totalWeight = 0;
  for (const [index, node] of sourceTextNodes.entries()) {
    const value = originalTextNodeValues?.[index] ?? node.nodeValue ?? '';
    const weight = Array.from(String(value).replace(/\s/gu, '')).length;
    if (!weight) continue;
    totalWeight += weight;
    let depth = 1;
    for (let parent = node.parentElement; parent && parent !== element; parent = parent.parentElement) {
      const current = textWeights.get(parent) ?? {weight: 0, depth: Number.POSITIVE_INFINITY};
      current.weight += weight;
      current.depth = Math.min(current.depth, depth);
      textWeights.set(parent, current);
      depth += 1;
    }
  }
  if (!totalWeight) return element;

  let typographyElement = element;
  const minimumWeight = totalWeight * MAIN_TEXT_RATIO;
  let bestWeight = minimumWeight;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const [candidate, {weight, depth}] of textWeights) {
    if (weight <= minimumWeight || weight < bestWeight ||
        (weight === bestWeight && depth >= bestDepth)) continue;
    typographyElement = candidate;
    bestWeight = weight;
    bestDepth = depth;
  }
  return typographyElement;
}

function syncSourceTypography(record) {
  const {translation} = record;
  if (!record?.element || !translation?.style) return;
  const element = getSourceTypographyElement(record);
  for (const property of SOURCE_TYPOGRAPHY_PROPERTIES) {
    const value = getComputedStyleValue(element, property);
    if (value) translation.style.setProperty(property, value, 'important');
    else translation.style.removeProperty(property);
  }
}

function clearSourceLayout(translation) {
  if (!translation?.style) return;
  for (const property of SOURCE_LAYOUT_PROPERTIES) translation.style.removeProperty(property);
}

function syncSourceLayout(record) {
  const {element, translation, placement} = record ?? {};
  if (!element || !translation?.style) return;
  // A sibling translation does not receive the source block's width and
  // centering rules because host styles usually target the source class. The
  // other placements already share the source's containing block, so copying
  // a pixel width there would make nested/grid/table layouts less flexible.
  if (placement !== 'sibling') {
    clearSourceLayout(translation);
    return;
  }

  const view = element.ownerDocument?.defaultView;
  const computedStyle = view?.getComputedStyle?.(element);
  if (!computedStyle) return;

  const values = new Map(SOURCE_LAYOUT_PROPERTIES.map((property) => [
    property,
    computedStyle.getPropertyValue?.(property) || computedStyle[property] || ''
  ]));
  const renderedWidth = Number(element.getBoundingClientRect?.()?.width);
  if (Number.isFinite(renderedWidth) && renderedWidth > 0) {
    values.set('width', `${renderedWidth}px`);
  }

  for (const [property, value] of values) {
    if (value) translation.style.setProperty(property, value, 'important');
    else translation.style.removeProperty(property);
  }
}

function getDirectNestedList(element) {
  return Array.from(element.children ?? []).find((child) => {
    const tagName = child.tagName?.toLowerCase();
    return tagName === 'ul' || tagName === 'ol';
  });
}

function isNestedBlockNode(node) {
  return node?.nodeType === 1 && (
    node.matches?.(BLOCK_SELECTOR) ||
    Boolean(node.querySelector?.(BLOCK_SELECTOR))
  );
}

function getMixedContentDirectChildren(element, sourceTextNodes) {
  const directChildren = new Set();
  const nodes = sourceTextNodes ?? collectSourceTextNodes(element, true);
  for (const node of nodes) {
    if (!(node.nodeValue ?? '').trim()) continue;
    let child = node;
    while (child.parentNode && child.parentNode !== element) child = child.parentNode;
    if (child.parentNode === element) directChildren.add(child);
  }
  return directChildren;
}

function placeMixedContentTranslation(element, translation, sourceTextNodes) {
  const childNodes = Array.from(element.childNodes ?? []);
  const firstNestedBlockIndex = childNodes.findIndex(isNestedBlockNode);
  const directChildren = getMixedContentDirectChildren(element, sourceTextNodes);
  const directChildIndexes = childNodes
    .map((child, index) => directChildren.has(child) ? index : -1)
    .filter((index) => index >= 0);

  if (firstNestedBlockIndex >= 0 && directChildIndexes.length &&
      Math.max(...directChildIndexes) > firstNestedBlockIndex) {
    const nextSibling = childNodes[Math.max(...directChildIndexes) + 1] ?? null;
    element.insertBefore(translation, nextSibling);
    return MIXED_CONTENT_AFTER_DIRECT_TEXT_PLACEMENT;
  }

  const firstNestedBlock = childNodes[firstNestedBlockIndex];
  if (firstNestedBlock) {
    element.insertBefore(translation, firstNestedBlock);
    return 'inside-before-first-block';
  }

  element.appendChild(translation);
  return 'inside';
}

function getStableListItem(element) {
  // Responsive cards such as IMDb's Awards block put the translated text in
  // an inline list nested inside a replaceable card. A block translation in
  // that inline list becomes an extra flex row and is removed on every host
  // reconciliation. Keep it beside the containing card instead.
  if (element?.tagName?.toLowerCase() !== 'li') return null;
  const list = element.parentElement;
  const listTagName = list?.tagName?.toLowerCase();
  if (listTagName !== 'ul' && listTagName !== 'ol') return null;
  const listDisplay = getDisplay(list);
  if (!['inline', 'inline-block', 'inline-flex', 'flex'].includes(listDisplay)) return null;
  const containingListItem = list.parentElement?.closest?.('li');
  if (!containingListItem?.parentNode || containingListItem === element) return null;
  return containingListItem;
}

function shouldInsertInside(element) {
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'li' || TABLE_CELL_TAGS.has(tagName)) return true;
  return LAYOUT_DISPLAYS.has(getDisplay(element.parentElement));
}

function hasHiddenOverflow(element) {
  const view = element?.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  if (!style) return false;
  return [style.overflow, style.overflowX, style.overflowY]
    .some((value) => value === 'hidden' || value === 'clip');
}

const collapsedReviewTranslationSources = new WeakMap();
const collapsedReviewTranslationRegions = new WeakMap();

function getCollapsedReviewCard(element) {
  const reviewContent = element.closest?.(AMAZON_REVIEW_CONTENT_SELECTOR);
  if (!reviewContent) return null;
  const card = reviewContent.closest?.(AMAZON_REVIEW_CARD_SELECTOR);
  if (!card?.parentNode || !hasHiddenOverflow(card)) return null;
  return card;
}

function getCollapsedReviewTranslations(card, currentTranslation, region) {
  return Array.from(card?.parentElement?.children ?? [])
    .filter((sibling) => {
      if (sibling === currentTranslation || !sibling.matches?.(TRANSLATION_TAG)) return false;
      const source = collapsedReviewTranslationSources.get(sibling);
      return source?.closest?.(AMAZON_REVIEW_CARD_SELECTOR) === card &&
        collapsedReviewTranslationRegions.get(sibling) === region;
    });
}

function placeCollapsedReviewTranslation(card, element, translation) {
  const translations = getCollapsedReviewTranslations(
    card,
    translation,
    COLLAPSED_REVIEW_TRANSLATION_AFTER_CARD
  );
  const nextTranslation = translations.find((candidate) => {
    const source = collapsedReviewTranslationSources.get(candidate);
    return Boolean(source && (element.compareDocumentPosition(source) & DOCUMENT_POSITION_FOLLOWING));
  });
  const insertionReference = nextTranslation ?? translations.at(-1) ?? card;
  insertionReference.parentNode?.insertBefore(
    translation,
    nextTranslation ?? insertionReference.nextSibling
  );
}

function placeCollapsedReviewTranslationBeforeCard(card, element, translation) {
  const translations = getCollapsedReviewTranslations(
    card,
    translation,
    COLLAPSED_REVIEW_TRANSLATION_BEFORE_CARD
  );
  const nextTranslation = translations.find((candidate) => {
    const source = collapsedReviewTranslationSources.get(candidate);
    return Boolean(source && (element.compareDocumentPosition(source) & DOCUMENT_POSITION_FOLLOWING));
  });
  const insertionReference = nextTranslation ?? card;
  insertionReference.parentNode?.insertBefore(translation, insertionReference);
}

function insertAtSafeLocation(element, translation, mixedContent = false, sourceTextNodes) {
  const stableListItem = getStableListItem(element);
  if (stableListItem) {
    stableListItem.parentNode.insertBefore(translation, stableListItem.nextSibling);
    return {
      kind: STABLE_LIST_SIBLING_PLACEMENT,
      anchor: stableListItem
    };
  }

  const collapsedReviewCard = getCollapsedReviewCard(element);
  if (collapsedReviewCard) {
    collapsedReviewTranslationSources.set(translation, element);
    collapsedReviewTranslationRegions.set(translation, COLLAPSED_REVIEW_TRANSLATION_AFTER_CARD);
    placeCollapsedReviewTranslation(collapsedReviewCard, element, translation);
    return {
      kind: COLLAPSED_REVIEW_CARD_PLACEMENT,
      anchor: collapsedReviewCard
    };
  }

  if (mixedContent) {
    return placeMixedContentTranslation(element, translation, sourceTextNodes);
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

function hasNestedBlocks(element) {
  return hasVisibleBlockDescendant(element);
}

function restorePlacement(record) {
  const {element, translation, placement} = record;
  if (!translation) return;
  if (placement?.kind === STABLE_LIST_SIBLING_PLACEMENT) {
    const anchor = placement.anchor;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(translation, anchor.nextSibling);
    return;
  }
  if (placement?.kind === COLLAPSED_REVIEW_CARD_PLACEMENT) {
    const anchor = placement.anchor;
    if (anchor?.parentNode) {
      collapsedReviewTranslationRegions.set(translation, COLLAPSED_REVIEW_TRANSLATION_AFTER_CARD);
      placeCollapsedReviewTranslation(anchor, element, translation);
    }
    return;
  }
  if (!element?.parentNode) return;
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
  if (placement === MIXED_CONTENT_AFTER_DIRECT_TEXT_PLACEMENT) {
    placeMixedContentTranslation(element, translation, record.sourceTextNodes);
    return;
  }
  element.appendChild(translation);
}

function placeTranslationAfterSource(record) {
  if (record?.placement === 'inside-before-first-block') {
    const {element, translation} = record;
    if (element?.parentNode && translation) element.appendChild(translation);
    return;
  }
  restorePlacement(record);
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

function collectSourceTextNodes(element, mixedContent = false, {includeReplacementText = false} = {}) {
  const nodes = [];
  const visit = (parent) => {
    for (const child of parent.childNodes ?? []) {
      if (child.nodeType === 3) {
        nodes.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (isHidden(child, {includeAncestors: false})) continue;
      if (child.matches(EXCLUDED_CONTENT_SELECTOR)) continue;
      if (child.matches(GENERATED_SELECTOR)) {
        if (includeReplacementText && child.matches(`[${REPLACEMENT_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`)) {
          visit(child);
        }
        continue;
      }
      if (child.matches(SEGMENT_SELECTOR)) continue;
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

function setSourceTextNodes(nodes, values) {
  if (!nodes.length) return;
  const nextValues = Array.isArray(values) ? values : [values];
  nodes.forEach((node, index) => {
    node.nodeValue = String(nextValues[index] ?? '');
  });
}

function textNodeShape(value) {
  const text = String(value ?? '');
  const leading = text.match(/^\s*/u)?.[0] ?? '';
  const trailing = text.match(/\s*$/u)?.[0] ?? '';
  const coreEnd = Math.max(leading.length, text.length - trailing.length);
  return {
    leading,
    trailing,
    core: text.slice(leading.length, coreEnd),
    raw: text
  };
}

function distributeReplacementText(text, weights) {
  const characters = Array.from(String(text ?? ''));
  if (!weights.length) return [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const parts = [];
  let offset = 0;
  let accumulatedWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    accumulatedWeight += weights[index];
    const isLast = index === weights.length - 1;
    const idealEnd = Math.round(characters.length * accumulatedWeight / totalWeight);
    const minimumEnd = characters.length >= weights.length ? offset + 1 : offset;
    const remainingSlots = weights.length - index - 1;
    const maximumEnd = characters.length - remainingSlots;
    const end = isLast
      ? characters.length
      : Math.min(maximumEnd, Math.max(minimumEnd, idealEnd));
    parts.push(characters.slice(offset, end).join(''));
    offset = end;
  }
  return parts;
}

function replacementValuesForNodes(nodes, translatedText) {
  const shapes = nodes.map((node) => textNodeShape(node.nodeValue));
  const replacementNodeIndices = [];
  const weights = [];
  shapes.forEach((shape, index) => {
    if (!shape.core) return;
    replacementNodeIndices.push(index);
    weights.push(Math.max(1, Array.from(shape.core).length));
  });
  const characters = Array.from(String(translatedText ?? ''));
  if (!replacementNodeIndices.length || characters.length < replacementNodeIndices.length) {
    return {fallback: true, values: [], replacementNodeIndices: []};
  }
  const parts = distributeReplacementText(characters.join(''), weights);
  const partByNode = new Map(replacementNodeIndices.map((index, partIndex) => [index, parts[partIndex] ?? '']));
  const values = shapes.map((shape, index) => {
    if (!partByNode.has(index)) return '';
    return partByNode.get(index);
  });
  return {fallback: false, values, replacementNodeIndices};
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
  const replacementTextSelector = `[${REPLACEMENT_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"][${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const styledSelector = `${selector}:not([${ROLE_ATTRIBUTE}="${ROLE_ORIGINAL}"])`;
  const styleSelector = (style) =>
    `${styledSelector}[${STYLE_ATTRIBUTE}="${style}"], ${replacementTextSelector}[${STYLE_ATTRIBUTE}="${style}"]`;
  const tableCellSelector = `td > ${selector}, th > ${selector}`;
  const translationTextSelector = `${selector} > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const styledTranslationTextSelector = `${styledSelector} > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const textStyleSelector = (style) =>
    `${styledSelector}[${STYLE_ATTRIBUTE}="${style}"], ${replacementTextSelector}[${STYLE_ATTRIBUTE}="${style}"]`;
  const hiddenSelector = `[${HIDDEN_ATTRIBUTE}="true"][${SESSION_ATTRIBUTE}="${escapeAttribute(sessionId)}"]`;
  const highlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const miniHighlightTextSelector = `${selector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.MINI_HIGHLIGHT}"] > [${TRANSLATION_TEXT_ATTRIBUTE}="${GENERATED_VALUE}"]`;
  const replacementHighlightSelector = `${replacementTextSelector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.HIGHLIGHT}"]`;
  const replacementMiniHighlightSelector = `${replacementTextSelector}[${STYLE_ATTRIBUTE}="${TRANSLATION_STYLES.MINI_HIGHLIGHT}"]`;
  const weight = presentation.bold ? '700' : '400';
  const fontStyle = presentation.italic ? 'italic' : 'normal';

  return `
    ${selector} {
      --translight-style-color: ${presentation.styleColor};
      --translight-text-color: ${presentation.textColor};
      --translight-font-weight: ${weight};
      --translight-font-style: ${fontStyle};
      overflow-anchor: none !important;
      box-sizing: border-box !important;
      display: block !important;
      position: static !important;
      inset: auto !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      min-height: 0 !important;
      max-height: none !important;
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
      font-synthesis: style !important;
      line-height: inherit !important;
      letter-spacing: normal !important;
      text-align: inherit !important;
      text-decoration: none !important;
      text-transform: none !important;
      white-space: pre-wrap !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      overflow: visible !important;
      text-overflow: clip !important;
      float: none !important;
      clear: none !important;
      vertical-align: baseline !important;
      visibility: visible !important;
    }

    ${translationTextSelector},
    ${replacementTextSelector} {
      box-sizing: border-box !important;
      display: inline !important;
      position: static !important;
      inset: auto !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      font-style: inherit !important;
      font-synthesis: inherit !important;
      line-height: inherit !important;
      letter-spacing: inherit !important;
      text-align: inherit !important;
      text-decoration: inherit !important;
      text-transform: inherit !important;
      white-space: inherit !important;
      word-break: normal !important;
      overflow-wrap: inherit !important;
      overflow: visible !important;
      text-overflow: clip !important;
      float: none !important;
      clear: none !important;
      vertical-align: baseline !important;
    }

    ${replacementTextSelector} {
      --translight-style-color: ${presentation.styleColor};
      --translight-text-color: ${presentation.textColor};
      --translight-font-weight: ${weight};
      --translight-font-style: ${fontStyle};
      overflow-anchor: none !important;
      box-sizing: border-box !important;
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      color: var(--translight-text-color) !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: var(--translight-font-weight) !important;
      font-style: var(--translight-font-style) !important;
      font-synthesis: style !important;
      line-height: inherit !important;
    }
    ${styledTranslationTextSelector},
    ${replacementTextSelector} {
      color: var(--translight-text-color) !important;
      font-weight: var(--translight-font-weight) !important;
      font-style: var(--translight-font-style) !important;
      font-synthesis: style !important;
    }
    ${selector}[${ROLE_ATTRIBUTE}="${ROLE_ORIGINAL}"] {
      color: inherit !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      font-style: inherit !important;
      font-synthesis: inherit !important;
      line-height: inherit !important;
      margin: 0.45em 0 1em !important;
    }

    ${tableCellSelector} {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0.25em 0 0 !important;
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
    ${textStyleSelector(TRANSLATION_STYLES.DOTTED_UNDERLINE)} {
      text-decoration: underline dotted var(--translight-style-color) !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 0.2em !important;
    }
    ${textStyleSelector(TRANSLATION_STYLES.SOLID_UNDERLINE)} {
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
    const ResizeObserverClass = document.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
    this.layoutObserver = typeof ResizeObserverClass === 'function'
      ? new ResizeObserverClass((entries) => {
        for (const entry of entries) {
          const record = this.recordsByElement.get(entry.target);
          if (record) syncSourceLayout(record);
        }
      })
      : null;
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

  observeSourceLayout(element) {
    this.layoutObserver?.observe?.(element);
  }

  unobserveSourceLayout(element) {
    this.layoutObserver?.unobserve?.(element);
  }

  currentSourceTextNodes(record) {
    const nodes = collectSourceTextNodes(record.element, record.mixedContent);
    record.sourceTextNodes = nodes;
    return nodes;
  }

  isSourceHashCurrent({element, sourceHash, mixedContent = false} = {}) {
    if (!element?.isConnected) return false;
    if (!sourceHash) return true;
    const nodes = collectSourceTextNodes(element, Boolean(mixedContent));
    const sourceText = normalizeSourceText(sourceTextFromNodes(nodes));
    return hashSourceText(sourceText) === sourceHash;
  }

  unwrapReplacementText(record) {
    const wrappers = record.replacementWrappers?.length
      ? record.replacementWrappers
      : record.replacementWrapper
        ? [record.replacementWrapper]
        : [];
    for (const wrapper of wrappers) {
      if (!wrapper?.parentNode) continue;
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
    }
    record.replacementWrappers = [];
    record.replacementWrapper = null;
  }

  wrapReplacementText(record, node) {
    if (!node?.parentNode) return null;
    const wrapper = this.document.createElement('span');
    wrapper.setAttribute('translate', 'no');
    wrapper.setAttribute(REPLACEMENT_TEXT_ATTRIBUTE, GENERATED_VALUE);
    wrapper.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    node.parentNode.insertBefore(wrapper, node);
    wrapper.appendChild(node);
    record.replacementWrappers ??= [];
    record.replacementWrappers.push(wrapper);
    record.replacementWrapper ??= wrapper;
    return wrapper;
  }

  unwrapSegment(record) {
    const segment = record?.element;
    if (!segment?.matches?.(SEGMENT_SELECTOR) || !segment.parentNode) return;
    const parent = segment.parentNode;
    while (segment.firstChild) parent.insertBefore(segment.firstChild, segment);
    segment.remove();
  }

  restoreSourceText(record, {onlyIfChanged = false} = {}) {
    if (!record.replaced) return false;
    const currentNodes = collectSourceTextNodes(record.element, record.mixedContent, {
      includeReplacementText: record.replaced
    });
    const presentedValues = record.presentedTextNodeValues ?? [record.presentedText ?? record.translatedText];
    const originalValues = record.originalTextNodeValues ?? [];
    const siteChanged = currentNodes.length !== presentedValues.length ||
      currentNodes.some((node, index) => (node.nodeValue ?? '') !== (presentedValues[index] ?? ''));
    if (onlyIfChanged && !siteChanged) return false;
    this.unwrapReplacementText(record);
    const nodes = collectSourceTextNodes(record.element, record.mixedContent);
    const restoredValues = nodes.map((node, index) => {
      if (!siteChanged || (node.nodeValue ?? '') === (presentedValues[index] ?? '')) {
        return originalValues[index] ?? '';
      }
      return node.nodeValue ?? '';
    });
    setSourceTextNodes(nodes, restoredValues);
    record.sourceTextNodes = nodes;
    record.originalTextNodeValues = snapshotTextNodes(nodes);
    record.originalText = normalizeSourceText(sourceTextFromNodes(nodes));
    record.replaced = false;
    record.presentedText = null;
    record.presentedTextNodeValues = null;
    return true;
  }

  replaceSourceText(record, {styled = false} = {}) {
    if (record.replaced) this.restoreSourceText(record);
    this.unwrapReplacementText(record);
    const nodes = this.currentSourceTextNodes(record);
    const {fallback, values: presentedValues, replacementNodeIndices} = replacementValuesForNodes(
      nodes,
      record.translatedText
    );
    if (fallback) {
      record.replaced = false;
      record.presentedText = null;
      record.presentedTextNodeValues = null;
      record.replacementNodeIndices = [];
      record.replacementNodeIndex = null;
      return false;
    }
    setSourceTextNodes(nodes, presentedValues);
    const shouldWrap = styled && this.presentation.displayStyle !== TRANSLATION_STYLES.NONE;
    if (shouldWrap) {
      for (const index of replacementNodeIndices) this.wrapReplacementText(record, nodes[index]);
    }
    record.replaced = true;
    record.replacementNodeIndices = replacementNodeIndices;
    record.replacementNodeIndex = replacementNodeIndices[0] ?? null;
    record.presentedTextNodeValues = snapshotTextNodes(nodes);
    record.presentedText = record.presentedTextNodeValues.join('');
    return true;
  }

  clearFallbackPresentation(record) {
    if (!record.fallbackMode) return;
    if (record.fallbackMode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) {
      restorePlacement(record);
    }
    record.fallbackMode = null;
    this.clearReplacementAttributes(record);
  }

  placeTranslationBeforeSource(record) {
    const {element, translation} = record;
    if (!element?.parentNode || !translation) return;
    if (record.placement === 'sibling') {
      element.parentNode.insertBefore(translation, element);
      return;
    }
    if (record.placement === MIXED_CONTENT_AFTER_DIRECT_TEXT_PLACEMENT) {
      const directChild = [...getMixedContentDirectChildren(element, record.sourceTextNodes)][0];
      if (directChild) {
        element.insertBefore(translation, directChild);
        return;
      }
    }
    if (record.placement?.kind === COLLAPSED_REVIEW_CARD_PLACEMENT) {
      const anchor = record.placement.anchor;
      if (anchor?.parentNode) {
        collapsedReviewTranslationRegions.set(translation, COLLAPSED_REVIEW_TRANSLATION_BEFORE_CARD);
        placeCollapsedReviewTranslationBeforeCard(anchor, element, translation);
      }
      return;
    }
    element.insertBefore(translation, element.firstChild);
  }

  applyFallbackPresentation(record, mode) {
    const {element} = record;
    this.clearReplacementAttributes(record);
    if (mode === TRANSLATION_MODES.TRANSLATION_ONLY) {
      restorePlacement(record);
      element.setAttribute(HIDDEN_ATTRIBUTE, GENERATED_VALUE);
      const hasExternalPlacement = record.placement === 'sibling' ||
        record.placement?.kind === COLLAPSED_REVIEW_CARD_PLACEMENT;
      if (!hasExternalPlacement) {
        element.setAttribute(
          HIDDEN_PLACEMENT_ATTRIBUTE,
          record.mixedContent ? 'mixed' : 'inside'
        );
      }
    } else if (mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) {
      this.placeTranslationBeforeSource(record);
    } else {
      placeTranslationAfterSource(record);
    }
    record.fallbackMode = mode;
  }

  restoreChangedSources() {
    for (const record of this.records.values()) {
      if (!record.replaced || !this.restoreSourceText(record, {onlyIfChanged: true})) continue;
      record.translation.parentNode?.removeChild(record.translation);
      this.clearReplacementAttributes(record);
    }
  }

  pruneMissingTranslations() {
    const missing = [];
    for (const record of this.records.values()) {
      // Translation-only replacement intentionally removes the generated
      // translation node, so the replaced source text is the live result in
      // that mode. Every other presentation needs its generated node to stay
      // connected; hosts such as SPA renderers may remove it while reusing
      // the source element for a new route.
      const hasLivePresentation = record.replaced || this.getConnectedTranslation(record);
      if (record.element?.isConnected !== false && !hasLivePresentation) {
        missing.push(record.element);
      }
    }
    for (const element of missing) this.remove(element);
    return missing;
  }

  refreshOriginalSnapshot(record, sourceText) {
    const wasReplaced = record.replaced;
    if (wasReplaced) this.restoreSourceText(record);

    const nodes = this.currentSourceTextNodes(record);
    const currentText = sourceTextFromNodes(nodes);
    record.sourceTextNodes = nodes;
    record.originalTextNodeValues = snapshotTextNodes(nodes);
    record.originalText = normalizeSourceText(wasReplaced ? currentText : (sourceText ?? currentText));
    record.recoveryAttempts = 0;
  }

  applyReplacementAttributes(record, {styled = false} = {}) {
    const {element} = record;
    element.setAttribute(REPLACED_ATTRIBUTE, GENERATED_VALUE);
    element.setAttribute(
      PRESENTATION_HASH_ATTRIBUTE,
      hashSourceText(normalizeSourceText(record.presentedText ?? record.translatedText))
    );
    const replacementWrappers = record.replacementWrappers?.length
      ? record.replacementWrappers
      : record.replacementWrapper
        ? [record.replacementWrapper]
        : [];
    if (styled) {
      element.setAttribute(STYLED_REPLACEMENT_ATTRIBUTE, GENERATED_VALUE);
      restoreAttribute(element, STYLE_ATTRIBUTE, record.originalAttributes?.[STYLE_ATTRIBUTE]);
      replacementWrappers.forEach((wrapper) => wrapper.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle));
    } else {
      restoreAttribute(element, STYLED_REPLACEMENT_ATTRIBUTE, record.originalAttributes?.[STYLED_REPLACEMENT_ATTRIBUTE]);
      restoreAttribute(element, STYLE_ATTRIBUTE, record.originalAttributes?.[STYLE_ATTRIBUTE]);
      replacementWrappers.forEach((wrapper) => wrapper.removeAttribute(STYLE_ATTRIBUTE));
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
    syncSourceLayout(record);
    syncSourceTypography(record);
    this.clearFallbackPresentation(record);
    translation.setAttribute(MODE_ATTRIBUTE, mode);
    if (mode === TRANSLATION_MODES.ORIGINAL_TRANSLATION) {
      this.restoreSourceText(record);
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
      translation.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle);
      setTranslationText(translation, record.translatedText);
      placeTranslationAfterSource(record);
      this.clearReplacementAttributes(record);
      return;
    }

    const styledReplacement = mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL;
    const replacementApplied = this.replaceSourceText(record, {styled: styledReplacement});
    if (!replacementApplied) {
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
      if (mode === TRANSLATION_MODES.TRANSLATION_ONLY) translation.removeAttribute(STYLE_ATTRIBUTE);
      else translation.setAttribute(STYLE_ATTRIBUTE, this.presentation.displayStyle);
      setTranslationText(translation, record.translatedText);
      this.applyFallbackPresentation(record, mode);
      return;
    }
    if (mode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) {
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_ORIGINAL);
      translation.removeAttribute(STYLE_ATTRIBUTE);
      setTranslationText(translation, record.originalText);
      placeTranslationAfterSource(record);
    } else {
      translation.setAttribute(ROLE_ATTRIBUTE, ROLE_TRANSLATION);
      translation.removeAttribute(STYLE_ATTRIBUTE);
      setTranslationText(translation, record.translatedText);
      translation.parentNode?.removeChild(translation);
    }
    this.applyReplacementAttributes(record, {styled: styledReplacement});
  }

  hasRecord(element) {
    return Boolean(element && this.recordsByElement.has(element));
  }

  resetRecoveryAttempts() {
    for (const record of this.records.values()) record.recoveryAttempts = 0;
  }

  getConnectedTranslation(record) {
    if (record?.translation?.isConnected) return record.translation;
    const isMatchingTranslation = (candidate) => candidate?.isConnected &&
      candidate.matches?.(TRANSLATION_TAG) &&
      candidate.getAttribute?.(SOURCE_ATTRIBUTE) === record?.sourceId &&
      candidate.getAttribute?.(SESSION_ATTRIBUTE) === this.sessionId;
    const descendant = Array.from(record?.element?.querySelectorAll?.(TRANSLATION_TAG) ?? [])
      .find(isMatchingTranslation);
    if (descendant) return descendant;
    const sourceSibling = Array.from(record?.element?.parentElement?.children ?? []).find(isMatchingTranslation);
    if (sourceSibling) return sourceSibling;
    return Array.from(record?.placement?.anchor?.parentElement?.children ?? []).find(isMatchingTranslation) ?? null;
  }

  rebindDisconnectedRecord(record) {
    if (record?.placement?.kind !== STABLE_LIST_SIBLING_PLACEMENT) return null;
    const anchor = record.placement.anchor;
    if (!anchor?.isConnected) return null;
    const candidates = Array.from(anchor.querySelectorAll(`${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`));
    const replacement = candidates.find((candidate) => {
      if (candidate === record.element || this.recordsByElement.has(candidate) ||
          candidate.matches?.(GENERATED_SELECTOR) || !candidate.isConnected) {
        return false;
      }
      if (isExcluded(candidate) || isHidden(candidate)) return false;
      if (!this.isSourceHashCurrent({
        element: candidate,
        sourceHash: record.sourceHash,
        mixedContent: record.mixedContent
      })) return false;
      return hasNestedBlocks(candidate) === Boolean(record.mixedContent);
    });
    if (!replacement) return null;

    const originalAttributes = getOriginalAttributes(replacement);
    this.unobserveSourceLayout(record.element);
    this.recordsByElement.delete(record.element);
    record.element = replacement;
    record.originalAttributes = originalAttributes;
    record.sourceTextNodes = collectSourceTextNodes(replacement, record.mixedContent);
    record.originalTextNodeValues = snapshotTextNodes(record.sourceTextNodes);
    replacement.setAttribute(SOURCE_ATTRIBUTE, record.sourceId);
    replacement.setAttribute(TRANSLATED_ATTRIBUTE, GENERATED_VALUE);
    replacement.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    if (record.sourceHash) replacement.setAttribute(SOURCE_HASH_ATTRIBUTE, record.sourceHash);
    replacement.removeAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
    this.recordsByElement.set(replacement, record);
    this.observeSourceLayout(replacement);
    return replacement;
  }

  getRecoveryState(record, targetLanguage = 'ko') {
    if (!record || record.replaced) return 'not-recoverable';
    if (!record.element?.isConnected) return 'disconnected';
    const connectedTranslation = this.getConnectedTranslation(record);
    if (connectedTranslation) {
      record.translation = connectedTranslation;
      return 'connected';
    }
    if (isExcluded(record.element) || isHidden(record.element)) return 'invalid';

    const sourceTextNodes = collectSourceTextNodes(record.element, record.mixedContent);
    const sourceText = normalizeSourceText(sourceTextFromNodes(sourceTextNodes));
    if (!sourceText || !isTranslatableBlock(record.element, sourceText, targetLanguage)) return 'invalid';
    if (record.sourceHash) {
      if (hashSourceText(sourceText) !== record.sourceHash) return 'changed';
    } else if (normalizeSourceText(record.originalText) !== sourceText) {
      return 'changed';
    }
    if (hasNestedBlocks(record.element) !== Boolean(record.mixedContent)) return 'changed';
    record.sourceTextNodes = sourceTextNodes;
    if ((record.recoveryAttempts ?? 0) >= MAX_RECOVERY_ATTEMPTS) return 'exhausted';
    return 'ready';
  }

  getMissingTranslations({targetLanguage = 'ko'} = {}) {
    const missing = [];
    for (const record of this.records.values()) {
      const state = this.getRecoveryState(record, targetLanguage);
      if (state === 'ready' || state === 'invalid' || state === 'changed') {
        missing.push(record.element);
      }
    }
    return missing;
  }

  restoreMissingTranslations({elements, targetLanguage = 'ko'} = {}) {
    const restored = [];
    const invalid = [];
    const candidates = elements ?? this.getMissingTranslations({targetLanguage});
    for (const element of candidates) {
      const record = this.recordsByElement.get(element);
      const state = this.getRecoveryState(record, targetLanguage);
      if (state === 'connected') continue;
      if (state === 'ready') {
        record.recoveryAttempts = (record.recoveryAttempts ?? 0) + 1;
        restorePlacement(record);
        if (record.translation?.isConnected) restored.push(element);
        continue;
      }
      if (state === 'invalid' || state === 'changed') invalid.push(element);
    }
    return {restored, invalid};
  }

  insert({element, sourceId, sourceHash, translatedText, text, mixedContent = false}) {
    if (!element?.parentNode || !sourceId) return null;
    const existing = this.recordsByElement.get(element);
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
      element.setAttribute(TRANSLATED_ATTRIBUTE, GENERATED_VALUE);
      element.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
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
      if (sourceChanged || structureChanged) {
        existing.sourceHash = hashSourceText(existing.originalText);
      } else {
        existing.sourceHash = sourceHash ?? existing.sourceHash;
      }
      if (existing.sourceHash) element.setAttribute(SOURCE_HASH_ATTRIBUTE, existing.sourceHash);
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
      presentedText: null,
      presentedTextNodeValues: null,
      replacementNodeIndex: null,
      replacementNodeIndices: [],
      fallbackMode: null,
      replacementWrappers: [],
      recoveryAttempts: 0
    };
    record.placement = insertAtSafeLocation(element, translation, mixedContent, sourceTextNodes);

    element.setAttribute(SOURCE_ATTRIBUTE, sourceId);
    if (sourceHash) element.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
    element.removeAttribute(PENDING_SOURCE_HASH_ATTRIBUTE);
    element.setAttribute(TRANSLATED_ATTRIBUTE, GENERATED_VALUE);
    element.setAttribute(SESSION_ATTRIBUTE, this.sessionId);
    this.records.set(sourceId, record);
    this.recordsByElement.set(element, record);
    this.observeSourceLayout(element);
    this.applyRecordPresentation(record);
    return translation;
  }

  remove(element) {
    const record = this.recordsByElement.get(element);
    if (!record) return false;

    this.unobserveSourceLayout(element);
    record.translation?.parentNode?.removeChild(record.translation);
    if (element?.getAttribute(SESSION_ATTRIBUTE) === this.sessionId) {
      this.restoreSourceText(record);
      for (const name of ATTRIBUTE_NAMES) restoreAttribute(element, name, record.originalAttributes[name]);
    }
    this.unwrapSegment(record);
    this.recordsByElement.delete(element);
    this.records.delete(record.sourceId);
    return true;
  }

  pruneDisconnected() {
    for (const [sourceId, record] of this.records) {
      if (record.element?.isConnected !== false) continue;
      if (this.rebindDisconnectedRecord(record)) continue;
      this.unobserveSourceLayout(record.element);
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
      this.unobserveSourceLayout(element);
      translation?.parentNode?.removeChild(translation);
      if (element?.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) continue;
      this.restoreSourceText(record);
      for (const name of ATTRIBUTE_NAMES) restoreAttribute(element, name, originalAttributes[name]);
      this.unwrapSegment(record);
      this.recordsByElement.delete(element);
    }

    this.layoutObserver?.disconnect?.();
    this.layoutObserver = null;
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
