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
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const LAYOUT_DISPLAYS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const TABLE_CELL_TAGS = new Set(['td', 'th']);
const MAX_RECOVERY_ATTEMPTS = 1;
const STABLE_LIST_SIBLING_PLACEMENT = 'stable-list-sibling';
const GRID_LAYOUT_ANCHORED_PLACEMENT = 'grid-layout-anchored';
const GRID_LAYOUT_ANCHORED_HIDDEN_PLACEMENT = 'anchored';
const GRID_LAYOUT_EXTERNAL_PLACEMENT = 'grid-layout-external';
const GRID_LAYOUT_EXTERNAL_HIDDEN_PLACEMENT = 'grid-external';
const COLLAPSED_REVIEW_CARD_PLACEMENT = 'collapsed-review-card-sibling';
const COLLAPSED_REVIEW_TRANSLATION_AFTER_CARD = 'after-card';
const COLLAPSED_REVIEW_TRANSLATION_BEFORE_CARD = 'before-card';
const AMAZON_REVIEW_CONTENT_SELECTOR = '[data-hook="reviewRichContentContainer"]';
const AMAZON_REVIEW_CARD_SELECTOR = '[data-a-card-type="basic"]';
const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;
const gridLayoutReservations = new WeakMap();
const gridLayoutSafetyCache = new WeakMap();
const gridLayoutExternalSources = new WeakMap();
const gridLayoutExternalGroups = new WeakMap();
const gridLayoutExternalObservers = new WeakMap();
const GRID_LAYOUT_SAFETY_STYLE_PROPERTIES = [
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-auto-flow',
  'grid-auto-columns',
  'grid-auto-rows',
  'grid-column-gap',
  'grid-row-gap',
  'column-gap',
  'row-gap'
];
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

function isGridLayoutPlacement(placement) {
  return placement?.kind === GRID_LAYOUT_ANCHORED_PLACEMENT ||
    placement?.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT;
}

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
  'margin-left',
  'margin-right'
];
const SOURCE_LAYOUT_CONSTRAINT_PROPERTIES = ['min-width', 'max-width'];
const MAIN_TEXT_RATIO = 0.5;

function getComputedStyleValue(element, property) {
  const view = element?.ownerDocument?.defaultView;
  const computedStyle = view?.getComputedStyle?.(element);
  if (!computedStyle) return '';
  return computedStyle.getPropertyValue?.(property) || computedStyle[property] || '';
}

function getStyleValue(style, property) {
  return style?.getPropertyValue?.(property) || style?.[property] || '';
}

function setStyleValue(style, property, value) {
  const currentValue = style?.getPropertyValue?.(property) || '';
  const currentPriority = style?.getPropertyPriority?.(property) || '';
  if (value) {
    if (currentValue !== value || currentPriority !== 'important') {
      style.setProperty(property, value, 'important');
    }
    return;
  }
  if (currentValue) style.removeProperty(property);
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
  for (const property of [...SOURCE_LAYOUT_PROPERTIES, ...SOURCE_LAYOUT_CONSTRAINT_PROPERTIES]) {
    setStyleValue(translation.style, property, '');
  }
}

function getSourceLayoutWidth(element, computedStyle) {
  const offsetWidth = Number(element.offsetWidth);
  if (Number.isFinite(offsetWidth) && offsetWidth > 0) return `${offsetWidth}px`;

  const width = Number.parseFloat(getStyleValue(computedStyle, 'width'));
  if (!Number.isFinite(width)) return '';
  if (getStyleValue(computedStyle, 'box-sizing') === 'border-box') return `${width}px`;

  const horizontalExtras = [
    'padding-left',
    'padding-right',
    'border-left-width',
    'border-right-width'
  ].reduce((sum, property) => {
    const value = Number.parseFloat(getStyleValue(computedStyle, property));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return `${width + horizontalExtras}px`;
}

function syncSourceLayout(record, {
  deferGridReservation = false,
  reservationParents
} = {}) {
  const {element, translation, placement} = record ?? {};
  if (!element || !translation?.style) return;
  let isGridOwnedLayout = isGridLayoutPlacement(placement);
  let sourceIsLayout = null;
  if (!isGridOwnedLayout && placement === 'inside') {
    const parentDisplay = getDisplay(element.parentElement);
    if (['grid', 'inline-grid'].includes(parentDisplay)) {
      isGridOwnedLayout = LAYOUT_DISPLAYS.has(getDisplay(element));
    }
  } else if (!isGridOwnedLayout && placement === 'sibling') {
    sourceIsLayout = LAYOUT_DISPLAYS.has(getDisplay(element));
    if (sourceIsLayout) isGridOwnedLayout = LAYOUT_DISPLAYS.has(getDisplay(element.parentElement));
  }
  // A layout control that owns a grid cell must not inherit paragraph
  // spacing from the generated-node stylesheet; that spacing would enlarge
  // the grid row even though the source control itself is unchanged.
  setStyleValue(translation.style, 'margin', isGridOwnedLayout ? '0' : '');
  if (placement?.kind === GRID_LAYOUT_ANCHORED_PLACEMENT) {
    const parent = syncGridLayoutReservation(record, {defer: deferGridReservation});
    if (deferGridReservation && parent) reservationParents?.add(parent);
    return;
  }
  if (placement?.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT) {
    clearSourceLayout(translation);
    return;
  }
  // A sibling translation does not receive the source block's width and
  // centering rules because host styles usually target the source class. A
  // source that is itself a flex/grid container is kept content-sized so its
  // constrained children do not force the translation into a narrow column.
  // The other placements already share the source's containing block, so
  // copying a pixel width there would make nested/grid/table layouts less
  // flexible.
  if (placement !== 'sibling') {
    clearSourceLayout(translation);
    return;
  }

  if (sourceIsLayout ?? LAYOUT_DISPLAYS.has(getDisplay(element))) {
    clearSourceLayout(translation);
    return;
  }

  const view = element.ownerDocument?.defaultView;
  const computedStyle = view?.getComputedStyle?.(element);
  if (!computedStyle) return;

  const values = new Map(SOURCE_LAYOUT_PROPERTIES.map((property) => [
    property,
    getStyleValue(computedStyle, property)
  ]));
  const layoutWidth = getSourceLayoutWidth(element, computedStyle);
  if (layoutWidth) values.set('width', layoutWidth);

  for (const [property, value] of values) {
    setStyleValue(translation.style, property, value);
  }
  // The generated node is always border-box. Its measured width already
  // includes the source's padding and border, so copying content-box
  // min/max constraints would clamp it in a different coordinate space.
  for (const property of SOURCE_LAYOUT_CONSTRAINT_PROPERTIES) {
    setStyleValue(translation.style, property, '');
  }
}

function getResizeObserverInlineSize(entry) {
  const boxSizes = [entry?.borderBoxSize, entry?.contentBoxSize];
  for (const boxSize of boxSizes) {
    const size = Array.isArray(boxSize) ? boxSize[0] : boxSize;
    const inlineSize = Number(size?.inlineSize);
    if (Number.isFinite(inlineSize)) return inlineSize;
  }
  const contentWidth = Number(entry?.contentRect?.width);
  if (Number.isFinite(contentWidth)) return contentWidth;
  const offsetWidth = Number(entry?.target?.offsetWidth);
  return Number.isFinite(offsetWidth) ? offsetWidth : null;
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

function splitCssTrackList(value) {
  const source = String(value ?? '').trim();
  if (!source || source === 'none') return [];
  const tokens = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (/\s/u.test(character) && depth === 0) {
      if (index > start) tokens.push(source.slice(start, index));
      start = index + 1;
    }
  }
  if (start < source.length) tokens.push(source.slice(start));
  return tokens;
}

function countGridTracks(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'none') return 1;
  const tokens = splitCssTrackList(normalized);
  if (!tokens.length) return null;
  let count = 0;
  for (const token of tokens) {
    const repeat = token.match(/^repeat\(\s*(\d+)\s*,/iu);
    if (repeat) {
      count += Number(repeat[1]);
      continue;
    }
    if (/^repeat\(/iu.test(token)) return null;
    count += 1;
  }
  return count || null;
}

function gridLineNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'auto') return null;
  const match = normalized.match(/^-?\d+/u);
  return match ? Number(match[0]) : null;
}

function gridChildIsInFirstRow(element) {
  const view = element?.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  if (!style) return true;
  const rowStart = getStyleValue(style, 'grid-row-start');
  const rowEnd = getStyleValue(style, 'grid-row-end');
  for (const [property, value] of [
    ['grid-row-start', rowStart],
    ['grid-row-end', rowEnd]
  ]) {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized === 'auto') continue;
    const span = normalized.match(/^span\s+(\d+)/iu);
    if (span) {
      if (Number(span[1]) > 1) return false;
      continue;
    }
    const line = gridLineNumber(normalized);
    if (line == null) return false;
    if (property === 'grid-row-start' && line > 1) return false;
    if (property === 'grid-row-end' && line > 2) return false;
  }
  return true;
}

function visualGridRowCount(parent, children) {
  const rects = children.map((child) => child.getBoundingClientRect?.());
  if (!rects.length || rects.some((rect) => {
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    return !Number.isFinite(rect?.top) || (!Number.isFinite(width) || !Number.isFinite(height)) ||
      (width <= 0 && height <= 0);
  })) return null;
  const firstTop = Number(rects[0].top);
  return rects.every((rect) => Math.abs(Number(rect.top) - firstTop) <= 1) ? 1 : 2;
}

function gridLayoutSafetySignature(parent, style) {
  const childCount = Number.isFinite(Number(parent?.childElementCount))
    ? Number(parent.childElementCount)
    : parent?.children?.length ?? 0;
  return {
    childCount,
    styleValues: GRID_LAYOUT_SAFETY_STYLE_PROPERTIES.map((property) =>
      getStyleValue(style, property)
    )
  };
}

function gridLayoutSafetySignatureMatches(cached, signature) {
  return cached?.childCount === signature.childCount &&
    cached.styleValues?.length === signature.styleValues.length &&
    signature.styleValues.every((value, index) => value === cached.styleValues[index]);
}

function invalidateGridLayoutSafety(parent) {
  if (parent) gridLayoutSafetyCache.delete(parent);
}

function gridTemplateHasMultipleTracks(value) {
  const source = String(value ?? '').trim();
  if (!source || source === 'none') return false;
  let depth = 0;
  let start = 0;
  let tokenCount = 0;
  const inspectToken = (end) => {
    if (end <= start) return false;
    tokenCount += 1;
    const token = source.slice(start, end);
    const repeat = token.match(/^repeat\(\s*(\d+)\s*,/iu);
    return tokenCount > 1 || (repeat && Number(repeat[1]) > 1);
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (/\s/u.test(character) && depth === 0) {
      if (inspectToken(index)) return true;
      start = index + 1;
    }
  }
  return inspectToken(source.length);
}

function gridHasSingleRow(parent) {
  const view = parent?.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(parent);
  const signature = gridLayoutSafetySignature(parent, style);
  const cached = gridLayoutSafetyCache.get(parent);
  if (gridLayoutSafetySignatureMatches(cached, signature)) return cached.result;

  const rowTemplate = getStyleValue(style, 'grid-template-rows');
  // An explicit multi-row template is enough to reject anchoring. Keep this
  // before any child enumeration because long grids take this path often.
  if (gridTemplateHasMultipleTracks(rowTemplate)) {
    gridLayoutSafetyCache.set(parent, {...signature, result: false});
    return false;
  }
  const rowCount = countGridTracks(rowTemplate);
  if (rowCount != null && rowCount > 1) {
    gridLayoutSafetyCache.set(parent, {...signature, result: false});
    return false;
  }

  const children = Array.from(parent?.children ?? [])
    .filter((child) => !child.matches?.(GENERATED_SELECTOR));
  let result;
  if (children.some((child) => !gridChildIsInFirstRow(child))) {
    result = false;
    gridLayoutSafetyCache.set(parent, {...signature, result});
    return result;
  }

  const visualRows = visualGridRowCount(parent, children);
  if (visualRows != null) {
    result = visualRows === 1;
  } else if (children.length <= 1) {
    result = true;
  } else {
    const columnCount = countGridTracks(getStyleValue(style, 'grid-template-columns'));
    if (columnCount == null) {
      result = false;
    } else {
      const autoFlow = getStyleValue(style, 'grid-auto-flow');
      result = /\bcolumn\b/iu.test(autoFlow) || children.length <= columnCount;
    }
  }
  gridLayoutSafetyCache.set(parent, {...signature, result});
  return result;
}

function isGridLayoutSource(element) {
  if (!LAYOUT_DISPLAYS.has(getDisplay(element))) return false;
  return ['grid', 'inline-grid'].includes(getDisplay(element.parentElement));
}

function shouldAnchorGridLayoutSource(element) {
  if (!isGridLayoutSource(element)) return false;
  const parent = element.parentElement;
  return gridHasSingleRow(parent) && !hasHiddenOverflowBetween(element, parent);
}

function placeGridLayoutTranslation(element, translation) {
  const view = element.ownerDocument?.defaultView;
  const sourcePosition = view?.getComputedStyle?.(element)?.position;
  const inlinePosition = {
    value: element.style.getPropertyValue('position'),
    priority: element.style.getPropertyPriority('position')
  };
  const sourcePositionChanged = !sourcePosition || sourcePosition === 'static';
  if (sourcePositionChanged) element.style.setProperty('position', 'relative', 'important');

  // Keep the source as the host's direct grid item. The generated label is an
  // absolutely positioned child, so it can be painted below the source
  // without becoming another grid item and moving the host's following
  // controls. Reparenting the source would break host selectors and explicit
  // grid placement.
  translation.style.setProperty('position', 'absolute', 'important');
  translation.style.setProperty('top', '100%', 'important');
  translation.style.setProperty('left', '0', 'important');
  translation.style.setProperty('width', 'max-content', 'important');
  translation.style.setProperty('max-width', 'none', 'important');
  translation.style.setProperty('white-space', 'nowrap', 'important');
  translation.style.setProperty('margin', '0', 'important');
  element.appendChild(translation);
  return {
    kind: GRID_LAYOUT_ANCHORED_PLACEMENT,
    anchor: element,
    reservationParent: element.parentElement,
    sourcePositionChanged,
    inlinePosition
  };
}

function resetGridLayoutTranslationStyles(translation) {
  if (!translation?.style) return;
  for (const property of [
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'width',
    'max-width',
    'white-space',
    'margin'
  ]) {
    translation.style.removeProperty(property);
  }
}

function getGridExternalInsertionPoint(gridParent) {
  let container = gridParent;
  let host = container?.parentNode;
  while (host && LAYOUT_DISPLAYS.has(getDisplay(host))) {
    container = host;
    host = container.parentNode;
  }
  if (!container?.parentNode || !host) return null;
  return {container, host};
}

function createGridExternalGroup(host, gridParent, anchor, beforeAnchor) {
  return {
    host,
    gridParent,
    anchor,
    beforeAnchor,
    root: null,
    nodes: new Map(),
    orderDirty: false,
    observerEntry: null
  };
}

function getGridExternalGroup(host, gridParent, anchor, beforeAnchor, {create = true} = {}) {
  if (!host || !gridParent || !anchor) return null;
  let groupsByAnchor = gridLayoutExternalGroups.get(host);
  if (!groupsByAnchor) {
    if (!create) return null;
    groupsByAnchor = new WeakMap();
    gridLayoutExternalGroups.set(host, groupsByAnchor);
  }
  let groupsByGridParent = groupsByAnchor.get(anchor);
  if (!groupsByGridParent) {
    if (!create) return null;
    groupsByGridParent = new WeakMap();
    groupsByAnchor.set(anchor, groupsByGridParent);
  }
  let groupPair = groupsByGridParent.get(gridParent);
  if (!groupPair) {
    if (!create) return null;
    groupPair = {before: null, after: null};
    groupsByGridParent.set(gridParent, groupPair);
  }
  const key = beforeAnchor ? 'before' : 'after';
  if (!groupPair[key] && create) {
    groupPair[key] = createGridExternalGroup(host, gridParent, anchor, beforeAnchor);
    observeGridExternalGroup(groupPair[key]);
  } else if (groupPair[key] && !groupPair[key].observerEntry) {
    observeGridExternalGroup(groupPair[key]);
  }
  return groupPair[key] ?? null;
}

function mutationIncludesGridExternalSource(record, group) {
  if (record?.type !== 'childList' || record.target !== group?.gridParent) return false;
  for (const node of record.addedNodes ?? []) {
    if (group.nodes.has(node)) return true;
  }
  for (const node of record.removedNodes ?? []) {
    if (group.nodes.has(node)) return true;
  }
  return false;
}

function markGridExternalOrderChanges(entry, records) {
  if (!entry || !records?.length) return;
  for (const group of entry.groups) {
    if (group.orderDirty || !group.nodes.size) continue;
    for (const record of records) {
      if (!mutationIncludesGridExternalSource(record, group)) continue;
      group.orderDirty = true;
      break;
    }
  }
}

function observeGridExternalGroup(group) {
  if (!group?.gridParent || group.observerEntry) return;
  const MutationObserverClass = group.gridParent.ownerDocument?.defaultView?.MutationObserver ??
    globalThis.MutationObserver;
  if (typeof MutationObserverClass !== 'function') return;
  let entry = gridLayoutExternalObservers.get(group.gridParent);
  if (!entry) {
    entry = {groups: new Set(), observer: null};
    entry.observer = new MutationObserverClass((records) => {
      // The observer only invalidates source order. Presentation and DOM
      // placement are applied by the renderer on its normal reconciliation
      // path, which also knows whether a translation is currently visible.
      markGridExternalOrderChanges(entry, records);
    });
    entry.observer.observe(group.gridParent, {childList: true});
    gridLayoutExternalObservers.set(group.gridParent, entry);
  }
  entry.groups.add(group);
  group.observerEntry = entry;
}

function unobserveGridExternalGroup(group) {
  const entry = group?.observerEntry;
  if (!entry) return;
  entry.groups.delete(group);
  if (!entry.groups.size) {
    entry.observer.disconnect();
    gridLayoutExternalObservers.delete(group.gridParent);
  }
  group.observerEntry = null;
}

function releaseGridExternalGroup(group) {
  if (!group?.host || group.nodes.size) return;
  unobserveGridExternalGroup(group);
  const groupsByAnchor = gridLayoutExternalGroups.get(group.host);
  const groupsByGridParent = groupsByAnchor?.get(group.anchor);
  const groupPair = groupsByGridParent?.get(group.gridParent);
  if (!groupPair) return;
  const key = group.beforeAnchor ? 'before' : 'after';
  if (groupPair[key] === group) groupPair[key] = null;
  if (!groupPair.before && !groupPair.after) groupsByGridParent.delete(group.gridParent);
}

function compareGridExternalSources(first, second) {
  if (first === second) return 0;
  const position = first?.compareDocumentPosition?.(second) ?? 0;
  if (position & DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

// Keep source order in a per-anchor index instead of rediscovering generated
// siblings from the outer host. A translation may arrive out of order, so the
// index provides its nearest translated neighbors without touching unrelated
// host children.
function gridExternalNodeHeight(node) {
  return node?.height ?? 0;
}

function updateGridExternalNodeHeight(node) {
  if (node) {
    node.height = 1 + Math.max(
      gridExternalNodeHeight(node.left),
      gridExternalNodeHeight(node.right)
    );
  }
  return node;
}

function rebuildGridExternalGroupOrder(group) {
  if (!group?.orderDirty) return;
  let root = null;
  for (const [source, node] of group.nodes) {
    node.left = null;
    node.right = null;
    node.height = 1;
    if (source?.parentNode !== group.gridParent || node.translation?.parentNode !== group.host) continue;
    root = insertGridExternalNode(root, node);
  }
  group.root = root;
  group.orderDirty = false;
}

function forEachGridExternalNode(root, callback) {
  if (!root) return;
  forEachGridExternalNode(root.left, callback);
  callback(root);
  forEachGridExternalNode(root.right, callback);
}

function reconcileGridExternalGroupOrder(group) {
  rebuildGridExternalGroupOrder(group);
  const {host, anchor} = group ?? {};
  if (!host || anchor?.parentNode !== host) return;
  let reference = group.beforeAnchor ? anchor : anchor.nextSibling;
  forEachGridExternalNode(group.root, (node) => {
    if (node.translation !== reference) host.insertBefore(node.translation, reference ?? null);
    reference = node.translation.nextSibling;
  });
}

function consumeGridExternalOrderChanges(group) {
  const entry = group?.observerEntry;
  const records = entry?.observer?.takeRecords?.() ?? [];
  markGridExternalOrderChanges(entry, records);
  if (!group?.orderDirty) return;
  reconcileGridExternalGroupOrder(group);
}

function rotateGridExternalLeft(node) {
  const pivot = node.right;
  node.right = pivot.left;
  pivot.left = updateGridExternalNodeHeight(node);
  return updateGridExternalNodeHeight(pivot);
}

function rotateGridExternalRight(node) {
  const pivot = node.left;
  node.left = pivot.right;
  pivot.right = updateGridExternalNodeHeight(node);
  return updateGridExternalNodeHeight(pivot);
}

function rebalanceGridExternalNode(node) {
  updateGridExternalNodeHeight(node);
  const balance = gridExternalNodeHeight(node.left) - gridExternalNodeHeight(node.right);
  if (balance > 1) {
    if (gridExternalNodeHeight(node.left.left) < gridExternalNodeHeight(node.left.right)) {
      node.left = rotateGridExternalLeft(node.left);
    }
    return rotateGridExternalRight(node);
  }
  if (balance < -1) {
    if (gridExternalNodeHeight(node.right.right) < gridExternalNodeHeight(node.right.left)) {
      node.right = rotateGridExternalRight(node.right);
    }
    return rotateGridExternalLeft(node);
  }
  return node;
}

function insertGridExternalNode(root, node) {
  if (!root) return node;
  const comparison = compareGridExternalSources(node.source, root.source);
  if (comparison < 0) root.left = insertGridExternalNode(root.left, node);
  else if (comparison > 0) root.right = insertGridExternalNode(root.right, node);
  else return root;
  return rebalanceGridExternalNode(root);
}

function getMinimumGridExternalNode(root) {
  let node = root;
  while (node?.left) node = node.left;
  return node;
}

function getMaximumGridExternalNode(root) {
  let node = root;
  while (node?.right) node = node.right;
  return node;
}

function removeGridExternalRoot(root) {
  if (!root.left) return root.right;
  if (!root.right) return root.left;
  const successor = getMinimumGridExternalNode(root.right);
  successor.right = removeGridExternalNode(root.right, successor.source);
  successor.left = root.left;
  return rebalanceGridExternalNode(successor);
}

function removeGridExternalNode(root, source) {
  if (!root) return null;
  const comparison = compareGridExternalSources(source, root.source);
  if (comparison < 0) {
    root.left = removeGridExternalNode(root.left, source);
    return rebalanceGridExternalNode(root);
  }
  if (comparison > 0) {
    root.right = removeGridExternalNode(root.right, source);
    return rebalanceGridExternalNode(root);
  }
  return removeGridExternalRoot(root);
}

function removeGridExternalNodeByIdentity(root, target) {
  if (!root) return null;
  if (root === target) return removeGridExternalRoot(root);
  const previousLeft = root.left;
  root.left = removeGridExternalNodeByIdentity(root.left, target);
  if (root.left !== previousLeft) return rebalanceGridExternalNode(root);
  const previousRight = root.right;
  root.right = removeGridExternalNodeByIdentity(root.right, target);
  if (root.right !== previousRight) return rebalanceGridExternalNode(root);
  return root;
}

function getGridExternalNeighbors(root, source) {
  let predecessor = null;
  let successor = null;
  let node = root;
  while (node) {
    const comparison = compareGridExternalSources(source, node.source);
    if (comparison < 0) {
      successor = node;
      node = node.left;
    } else if (comparison > 0) {
      predecessor = node;
      node = node.right;
    } else {
      predecessor = getMaximumGridExternalNode(node.left) ?? predecessor;
      successor = getMinimumGridExternalNode(node.right) ?? successor;
      break;
    }
  }
  return {predecessor, successor};
}

function removeGridLayoutExternalTranslation(translation) {
  const metadata = gridLayoutExternalSources.get(translation);
  if (!metadata) return false;
  const {group, source} = metadata;
  consumeGridExternalOrderChanges(group);
  const node = group?.nodes.get(source);
  if (node) {
    group.root = source.parentNode === group.gridParent
      ? removeGridExternalNode(group.root, source)
      : removeGridExternalNodeByIdentity(group.root, node);
    group.nodes.delete(source);
    releaseGridExternalGroup(group);
  }
  gridLayoutExternalSources.delete(translation);
  return true;
}

function insertGridLayoutExternalTranslation({
  source,
  translation,
  gridParent,
  anchor,
  beforeAnchor = false
}) {
  const host = anchor?.parentNode;
  if (!host || !source || !translation) return false;
  removeGridLayoutExternalTranslation(translation);
  const group = getGridExternalGroup(host, gridParent, anchor, beforeAnchor);
  if (!group) return false;
  consumeGridExternalOrderChanges(group);
  const {predecessor, successor} = getGridExternalNeighbors(group.root, source);
  const insertionReference = beforeAnchor
    ? successor?.translation ?? anchor
    : successor?.translation ?? (predecessor ? predecessor.translation.nextSibling : anchor.nextSibling);
  if (insertionReference !== translation) host.insertBefore(translation, insertionReference ?? null);
  const node = {
    source,
    translation,
    height: 1,
    left: null,
    right: null
  };
  group.root = insertGridExternalNode(group.root, node);
  group.nodes.set(source, node);
  gridLayoutExternalSources.set(translation, {source, gridParent, anchor, beforeAnchor, group});
  return true;
}

function placeGridLayoutExternalTranslation(element, translation) {
  const gridParent = element?.parentElement;
  const insertionPoint = getGridExternalInsertionPoint(gridParent);
  if (!gridParent || !insertionPoint) {
    element?.parentNode?.insertBefore(translation, element.nextSibling);
    return 'sibling';
  }

  resetGridLayoutTranslationStyles(translation);
  const {container, host} = insertionPoint;
  insertGridLayoutExternalTranslation({
    source: element,
    translation,
    gridParent,
    anchor: container
  });
  return {
    kind: GRID_LAYOUT_EXTERNAL_PLACEMENT,
    gridParent,
    anchor: container
  };
}

function shouldInsertInside(element) {
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'li' || TABLE_CELL_TAGS.has(tagName)) return true;
  if (LAYOUT_DISPLAYS.has(getDisplay(element))) return false;
  return LAYOUT_DISPLAYS.has(getDisplay(element.parentElement));
}

function hasHiddenOverflow(element) {
  const view = element?.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  if (!style) return false;
  return [style.overflow, style.overflowX, style.overflowY]
    .some((value) => value === 'hidden' || value === 'clip');
}

function hasHiddenOverflowBetween(element, stopAt) {
  for (let current = element; current; current = current.parentElement) {
    if (hasHiddenOverflow(current)) return true;
    if (current === stopAt) break;
  }
  return false;
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

  if (isGridLayoutSource(element)) {
    if (shouldAnchorGridLayoutSource(element)) {
      return placeGridLayoutTranslation(element, translation);
    }
    return placeGridLayoutExternalTranslation(element, translation);
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

function markTranslationAttached(record) {
  if (record) record.translationSuppressed = false;
}

function detachTranslationForPresentation(record) {
  const translation = record?.translation;
  if (!translation) return;
  // A translation-only replacement is intentionally represented by the
  // source text. Remove its external order entry along with the DOM node so a
  // later grid mutation cannot infer that it should be visible again.
  removeGridLayoutExternalTranslation(translation);
  translation.parentNode?.removeChild(translation);
  record.translationSuppressed = true;
}

function restorePlacement(record) {
  const {element, translation, placement} = record;
  if (!translation) return;
  markTranslationAttached(record);
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
  if (placement?.kind === GRID_LAYOUT_ANCHORED_PLACEMENT) {
    const anchor = placement.anchor ?? element;
    if (anchor?.parentNode && translation.parentNode !== anchor) anchor.appendChild(translation);
    return;
  }
  if (placement?.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT) {
    const anchor = placement.anchor;
    insertGridLayoutExternalTranslation({
      source: element,
      translation,
      gridParent: placement.gridParent,
      anchor
    });
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
    markTranslationAttached(record);
    if (element?.parentNode && translation) element.appendChild(translation);
    return;
  }
  restorePlacement(record);
}

function updateGridLayoutReservation(parent, entry) {
  if (!parent || !entry) return;
  if (!entry.dirty) return;
  entry.dirty = false;
  let reservedHeight = 0;
  for (const height of entry.heights.values()) reservedHeight = Math.max(reservedHeight, height);
  if (reservedHeight > 0) {
    const value = `${entry.baseMarginBottom + Math.ceil(reservedHeight)}px`;
    if (parent.style.getPropertyValue('margin-bottom') !== value ||
        parent.style.getPropertyPriority('margin-bottom') !== 'important') {
      parent.style.setProperty('margin-bottom', value, 'important');
    }
    return;
  }
  const {value, priority} = entry.inlineMarginBottom;
  if (value) {
    if (parent.style.getPropertyValue('margin-bottom') !== value ||
        parent.style.getPropertyPriority('margin-bottom') !== priority) {
      parent.style.setProperty('margin-bottom', value, priority);
    }
  } else if (parent.style.getPropertyValue('margin-bottom')) {
    parent.style.removeProperty('margin-bottom');
  }
  gridLayoutReservations.delete(parent);
}

function syncGridLayoutReservation(record, {defer = false} = {}) {
  if (record?.placement?.kind !== GRID_LAYOUT_ANCHORED_PLACEMENT) return null;
  const {translation} = record;
  const parent = record.placement.reservationParent;
  if (!parent) return null;
  let entry = gridLayoutReservations.get(parent);
  if (!translation?.isConnected || translation.parentNode !== record.placement.anchor) {
    if (entry?.heights.delete(record)) entry.dirty = true;
    if (!defer) updateGridLayoutReservation(parent, entry);
    return parent;
  }
  if (!entry) {
    const view = parent.ownerDocument?.defaultView;
    const computedStyle = view?.getComputedStyle?.(parent);
    entry = {
      heights: new Map(),
      baseMarginBottom: Number.parseFloat(getStyleValue(computedStyle, 'margin-bottom')) || 0,
      inlineMarginBottom: {
        value: parent.style.getPropertyValue('margin-bottom'),
        priority: parent.style.getPropertyPriority('margin-bottom')
      },
      dirty: true
    };
    gridLayoutReservations.set(parent, entry);
  }
  const rect = translation.getBoundingClientRect?.();
  const height = Number(rect?.height) || Number(translation.offsetHeight) || 0;
  if (height > 0) {
    if (entry.heights.get(record) !== height) {
      entry.heights.set(record, height);
      entry.dirty = true;
    }
  } else if (entry.heights.delete(record)) {
    entry.dirty = true;
  }
  if (!defer) updateGridLayoutReservation(parent, entry);
  return parent;
}

function flushGridLayoutReservations(parents) {
  for (const parent of parents ?? []) {
    updateGridLayoutReservation(parent, gridLayoutReservations.get(parent));
  }
}

function cleanupGridLayoutPlacement(record) {
  if (!isGridLayoutPlacement(record?.placement)) return;
  const {element, translation} = record;
  if (record.placement.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT) {
    removeGridLayoutExternalTranslation(translation);
  } else {
    resetGridLayoutTranslationStyles(translation);
  }
  translation?.parentNode?.removeChild(translation);
  if (record.placement.kind === GRID_LAYOUT_ANCHORED_PLACEMENT) {
    syncGridLayoutReservation(record);
  }
  restoreGridLayoutFallbackDisplay(record);
  if (record.placement.kind !== GRID_LAYOUT_ANCHORED_PLACEMENT ||
      !record.placement.sourcePositionChanged || !element?.style) return;
  const {value, priority} = record.placement.inlinePosition ?? {};
  if (value) element.style.setProperty('position', value, priority);
  else element.style.removeProperty('position');
}

function preserveGridLayoutFallbackDisplay(record) {
  const placement = record?.placement;
  const element = record?.element;
  if (!isGridLayoutPlacement(placement) || !element?.style ||
      placement.fallbackDisplay) return;
  const display = getDisplay(element);
  if (!display || display === 'none') return;
  placement.fallbackDisplay = {
    appliedValue: display,
    value: element.style.getPropertyValue('display'),
    priority: element.style.getPropertyPriority('display')
  };
  element.style.setProperty('display', display, 'important');
}

function restoreGridLayoutFallbackDisplay(record) {
  const placement = record?.placement;
  const element = record?.element;
  const fallbackDisplay = placement?.fallbackDisplay;
  if (!fallbackDisplay || !element?.style) return;
  if (element.style.getPropertyValue('display') === fallbackDisplay.appliedValue &&
      element.style.getPropertyPriority('display') === 'important') {
    if (fallbackDisplay.value) element.style.setProperty('display', fallbackDisplay.value, fallbackDisplay.priority);
    else element.style.removeProperty('display');
  }
  placement.fallbackDisplay = null;
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
      if (isExcluded(child)) continue;
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
      flex: 0 0 auto !important;
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
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="${GRID_LAYOUT_ANCHORED_HIDDEN_PLACEMENT}"] {
      visibility: hidden !important;
    }
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="${GRID_LAYOUT_ANCHORED_HIDDEN_PLACEMENT}"] > ${TRANSLATION_TAG} {
      visibility: visible !important;
    }
    ${hiddenSelector}[${HIDDEN_PLACEMENT_ATTRIBUTE}="${GRID_LAYOUT_EXTERNAL_HIDDEN_PLACEMENT}"] {
      visibility: hidden !important;
    }
  `;
}

function desiredGridLayoutPlacementKind(element) {
  if (!isGridLayoutSource(element)) return null;
  return shouldAnchorGridLayoutSource(element)
    ? GRID_LAYOUT_ANCHORED_PLACEMENT
    : GRID_LAYOUT_EXTERNAL_PLACEMENT;
}

function gridLayoutPlacementMatches(record, kind) {
  const placement = record?.placement;
  const element = record?.element;
  if (!placement || placement.kind !== kind || !element) return false;
  if (kind === GRID_LAYOUT_ANCHORED_PLACEMENT) {
    return placement.anchor === element && placement.reservationParent === element.parentElement;
  }
  return placement.gridParent === element.parentElement && placement.anchor?.parentNode;
}

export class TranslationRenderer {
  constructor({document = globalThis.document, sessionId, settings = DEFAULT_SETTINGS}) {
    if (!document) throw new Error('TranslationRenderer requires a document.');
    this.document = document;
    this.sessionId = sessionId;
    this.records = new Map();
    this.recordsByElement = new WeakMap();
    const ResizeObserverClass = document.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
    this.layoutRecordsByTarget = new Map();
    this.layoutTargetWidths = new Map();
    this.layoutSyncHandle = null;
    this.layoutSyncUsesAnimationFrame = false;
    this.layoutObserver = typeof ResizeObserverClass === 'function'
      ? new ResizeObserverClass((entries) => this.handleLayoutResize(entries))
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

  reconcileGridLayoutPlacement(record) {
    if (!isGridLayoutPlacement(record?.placement)) return false;
    if (record.placement.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT) {
      consumeGridExternalOrderChanges(gridLayoutExternalSources.get(record.translation)?.group);
    }
    const desiredKind = desiredGridLayoutPlacementKind(record.element);
    if (desiredKind && gridLayoutPlacementMatches(record, desiredKind)) return false;

    const fallbackMode = record.fallbackMode;
    cleanupGridLayoutPlacement(record);
    record.placement = desiredKind === GRID_LAYOUT_ANCHORED_PLACEMENT
      ? placeGridLayoutTranslation(record.element, record.translation)
      : desiredKind === GRID_LAYOUT_EXTERNAL_PLACEMENT
        ? placeGridLayoutExternalTranslation(record.element, record.translation)
        : insertAtSafeLocation(
          record.element,
          record.translation,
          record.mixedContent,
          record.sourceTextNodes
        );

    const translationOnlyReplacement = record.replaced &&
      this.presentation.translationMode === TRANSLATION_MODES.TRANSLATION_ONLY;
    if (translationOnlyReplacement) detachTranslationForPresentation(record);
    if (fallbackMode) {
      this.applyFallbackPresentation(record, fallbackMode);
    } else if (!translationOnlyReplacement) {
      restorePlacement(record);
    }
    return true;
  }

  handleLayoutResize(entries) {
    const affectedRecords = new Set();
    for (const entry of entries ?? []) {
      const records = this.layoutRecordsByTarget.get(entry?.target);
      if (!records?.size) continue;
      const currentWidth = getResizeObserverInlineSize(entry);
      const previousWidth = this.layoutTargetWidths.get(entry.target);
      this.layoutTargetWidths.set(entry.target, currentWidth);
      if (currentWidth != null && previousWidth != null && currentWidth === previousWidth &&
          ![...records].some((record) => isGridLayoutPlacement(record.placement))) continue;
      for (const record of records) affectedRecords.add(record);
    }
    const reservationParents = new Set();
    const safetyParents = new Set();
    for (const record of affectedRecords) {
      const parent = record.element?.parentElement;
      if (isGridLayoutSource(record.element) && parent) safetyParents.add(parent);
    }
    for (const parent of safetyParents) invalidateGridLayoutSafety(parent);
    for (const record of affectedRecords) {
      if (this.records.get(record.sourceId) !== record) continue;
      this.reconcileGridLayoutPlacement(record);
      this.observeSourceLayout(record);
      syncSourceLayout(record, {deferGridReservation: true, reservationParents});
    }
    flushGridLayoutReservations(reservationParents);
  }

  observeLayoutTarget(element, record) {
    if (!this.layoutObserver || !element || !record) return;
    let records = this.layoutRecordsByTarget.get(element);
    if (!records) {
      records = new Set();
      this.layoutRecordsByTarget.set(element, records);
      this.layoutObserver.observe(element);
    }
    records.add(record);
  }

  unobserveLayoutTarget(element, record) {
    if (!this.layoutObserver || !element || !record) return;
    const records = this.layoutRecordsByTarget.get(element);
    if (!records) return;
    records.delete(record);
    if (!records.size) {
      this.layoutObserver.unobserve(element);
      this.layoutRecordsByTarget.delete(element);
      this.layoutTargetWidths.delete(element);
    }
  }

  observeSourceLayout(record) {
    if (!this.layoutObserver || !record?.element) return;
    const nextTargets = isGridLayoutPlacement(record.placement)
      ? [...new Set([record.element, record.placement.reservationParent,
        record.placement.gridParent, record.placement.anchor].filter(Boolean))]
      : record.placement === 'sibling' && !LAYOUT_DISPLAYS.has(getDisplay(record.element))
        ? [record.element, record.element.parentElement].filter(Boolean)
        : [];
    const previousTargets = record.layoutTargets ?? [];
    for (const target of previousTargets) {
      if (!nextTargets.includes(target)) this.unobserveLayoutTarget(target, record);
    }
    for (const target of nextTargets) {
      if (!previousTargets.includes(target)) this.observeLayoutTarget(target, record);
    }
    record.layoutTargets = nextTargets;
  }

  unobserveSourceLayout(record) {
    for (const target of record?.layoutTargets ?? []) this.unobserveLayoutTarget(target, record);
    if (record) record.layoutTargets = [];
  }

  syncLayouts() {
    const reservationParents = new Set();
    const safetyParents = new Set();
    for (const record of this.records.values()) {
      const parent = record.element?.parentElement;
      if (isGridLayoutSource(record.element) && parent) safetyParents.add(parent);
    }
    for (const parent of safetyParents) invalidateGridLayoutSafety(parent);
    for (const record of this.records.values()) {
      this.reconcileGridLayoutPlacement(record);
      this.observeSourceLayout(record);
      syncSourceLayout(record, {deferGridReservation: true, reservationParents});
    }
    flushGridLayoutReservations(reservationParents);
  }

  scheduleLayoutSync() {
    if (this.layoutSyncHandle != null) return;
    const view = this.document.defaultView ?? globalThis.window;
    const sync = () => {
      this.layoutSyncHandle = null;
      this.layoutSyncUsesAnimationFrame = false;
      this.syncLayouts();
    };
    if (typeof view?.requestAnimationFrame === 'function') {
      this.layoutSyncUsesAnimationFrame = true;
      this.layoutSyncHandle = view.requestAnimationFrame(sync);
      return;
    }
    this.layoutSyncHandle = setTimeout(sync, 0);
  }

  cancelScheduledLayoutSync() {
    if (this.layoutSyncHandle == null) return;
    const view = this.document.defaultView ?? globalThis.window;
    if (this.layoutSyncUsesAnimationFrame && typeof view?.cancelAnimationFrame === 'function') {
      view.cancelAnimationFrame(this.layoutSyncHandle);
    } else {
      clearTimeout(this.layoutSyncHandle);
    }
    this.layoutSyncHandle = null;
    this.layoutSyncUsesAnimationFrame = false;
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
    restoreGridLayoutFallbackDisplay(record);
    record.fallbackMode = null;
    this.clearReplacementAttributes(record);
  }

  placeTranslationBeforeSource(record) {
    const {element, translation} = record;
    if (!element?.parentNode || !translation) return;
    markTranslationAttached(record);
    if (record.placement?.kind === GRID_LAYOUT_ANCHORED_PLACEMENT) {
      if (translation.parentNode !== element) element.appendChild(translation);
      return;
    }
    if (record.placement?.kind === GRID_LAYOUT_EXTERNAL_PLACEMENT) {
      const anchor = record.placement.anchor;
      insertGridLayoutExternalTranslation({
        source: element,
        translation,
        gridParent: record.placement.gridParent,
        anchor,
        beforeAnchor: true
      });
      return;
    }
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
      if (isGridLayoutPlacement(record.placement)) {
        preserveGridLayoutFallbackDisplay(record);
      }
      element.setAttribute(HIDDEN_ATTRIBUTE, GENERATED_VALUE);
      const hasExternalPlacement = record.placement === 'sibling' ||
        record.placement?.kind === COLLAPSED_REVIEW_CARD_PLACEMENT ||
        isGridLayoutPlacement(record.placement);
      if (!hasExternalPlacement) {
        element.setAttribute(
          HIDDEN_PLACEMENT_ATTRIBUTE,
          record.mixedContent ? 'mixed' : 'inside'
        );
      } else if (isGridLayoutPlacement(record.placement)) {
        const hiddenPlacement = record.placement.kind === GRID_LAYOUT_ANCHORED_PLACEMENT
          ? GRID_LAYOUT_ANCHORED_HIDDEN_PLACEMENT
          : GRID_LAYOUT_EXTERNAL_HIDDEN_PLACEMENT;
        element.setAttribute(HIDDEN_PLACEMENT_ATTRIBUTE, hiddenPlacement);
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
      detachTranslationForPresentation(record);
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
    this.reconcileGridLayoutPlacement(record);
    this.observeSourceLayout(record);
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
      syncGridLayoutReservation(record);
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
      syncGridLayoutReservation(record);
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
      detachTranslationForPresentation(record);
    }
    this.applyReplacementAttributes(record, {styled: styledReplacement});
    syncGridLayoutReservation(record);
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
    const placedTranslation = record?.placement?.anchor?.querySelector?.(TRANSLATION_TAG);
    if (placedTranslation && isMatchingTranslation(placedTranslation)) return placedTranslation;
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
    this.unobserveSourceLayout(record);
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
    this.observeSourceLayout(record);
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
        cleanupGridLayoutPlacement(existing);
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
      translationSuppressed: false,
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
    this.observeSourceLayout(record);
    this.applyRecordPresentation(record);
    return translation;
  }

  remove(element) {
    const record = this.recordsByElement.get(element);
    if (!record) return false;

    this.unobserveSourceLayout(record);
    record.translation?.parentNode?.removeChild(record.translation);
    if (element?.getAttribute(SESSION_ATTRIBUTE) === this.sessionId) {
      this.restoreSourceText(record);
      for (const name of ATTRIBUTE_NAMES) restoreAttribute(element, name, record.originalAttributes[name]);
    }
    cleanupGridLayoutPlacement(record);
    this.unwrapSegment(record);
    this.recordsByElement.delete(element);
    this.records.delete(record.sourceId);
    return true;
  }

  pruneDisconnected() {
    for (const [sourceId, record] of this.records) {
      if (record.element?.isConnected !== false) continue;
      if (this.rebindDisconnectedRecord(record)) continue;
      this.unobserveSourceLayout(record);
      record.translation?.parentNode?.removeChild(record.translation);
      if (record.element?.getAttribute(SESSION_ATTRIBUTE) === this.sessionId) {
        for (const name of ATTRIBUTE_NAMES) restoreAttribute(record.element, name, record.originalAttributes[name]);
      }
      cleanupGridLayoutPlacement(record);
      this.recordsByElement.delete(record.element);
      this.records.delete(sourceId);
    }
  }

  removeAll() {
    for (const record of this.records.values()) {
      const {element, translation, originalAttributes} = record;
      this.unobserveSourceLayout(record);
      translation?.parentNode?.removeChild(translation);
      cleanupGridLayoutPlacement(record);
      if (element?.getAttribute(SESSION_ATTRIBUTE) !== this.sessionId) continue;
      this.restoreSourceText(record);
      for (const name of ATTRIBUTE_NAMES) restoreAttribute(element, name, originalAttributes[name]);
      this.unwrapSegment(record);
      this.recordsByElement.delete(element);
    }

    this.cancelScheduledLayoutSync();
    this.layoutObserver?.disconnect?.();
    this.layoutObserver = null;
    this.layoutRecordsByTarget.clear();
    this.layoutTargetWidths.clear();
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
