import { hashSourceText } from './translation-queue.js';
import { isTranslatableBlock } from './language.js';

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const BRANDING_SELECTOR = '.site-logo,a.logo.replace';
const EXCLUDED_ANCESTOR_SELECTOR = `${EXCLUDED_CONTENT_SELECTOR},[contenteditable="true"],[contenteditable=""],${BRANDING_SELECTOR}`;
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const NAVIGATION_SELECTOR = [
  'nav',
  'bsp-nav',
  '[role="navigation"]',
  '[role="menu"]',
  '[aria-haspopup="menu"]',
  '[data-mainnav-item]',
  '[data-nav-item]',
  '[data-nav-moretrigger]',
  '.MainNavigation'
].join(',');
const PSNPROFILES_SHELL_SELECTOR = '#header,#banner';
const PSNPROFILES_HEADER_NAV_SELECTOR = '#header .navigation';
const PSNPROFILES_GUIDE_INFO_SELECTOR = '#banner .guide-info';
const PSNPROFILES_TOC_ITEM_SELECTOR = '.tableofcontents li';
const LINK_RATIO_LIMIT = 0.65;
const DOUBLE_LINE_BREAK_PATTERN = /\r?\n[ \t\f]*(?:\r?\n)+/;
const SOURCE_ID_ATTRIBUTE = 'data-translight-source-id';
const SOURCE_HASH_ATTRIBUTE = 'data-translight-source-hash';
const PENDING_SOURCE_HASH_ATTRIBUTE = 'data-translight-pending-source-hash';
const PRESENTATION_HASH_ATTRIBUTE = 'data-translight-presentation-hash';
export const SEGMENT_ATTRIBUTE = 'data-translight-segment';
export const SEGMENT_ID_ATTRIBUTE = 'data-translight-segment-id';
export const SEGMENT_SELECTOR = `[${SEGMENT_ATTRIBUTE}="true"]`;
export const PSNPROFILES_OVERVIEW_LABEL_SELECTOR = [
  '.overview-info > .tag > .typo-bottom',
  `.overview-info > ${SEGMENT_SELECTOR} > .tag > .typo-bottom`
].join(',');
const CANDIDATE_SELECTOR = `${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`;
const PHRASING_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'del',
  'dfn', 'em', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'meter',
  'noscript', 'object', 'output', 'picture', 'progress', 'q', 'ruby', 's',
  'samp', 'select', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'template',
  'textarea', 'time', 'u', 'var', 'wbr'
]);

let sourceSequence = 0;
let activeVisibilityCache = null;

function isElement(node) {
  return node?.nodeType === 1;
}

function isGenerated(element) {
  return isElement(element) && (element.matches(GENERATED_SELECTOR) || Boolean(element.closest(GENERATED_SELECTOR)));
}

export function isExcluded(element) {
  if (!isElement(element)) return true;
  if (element.matches(EXCLUDED_ANCESTOR_SELECTOR) || element.closest(EXCLUDED_ANCESTOR_SELECTOR)) return true;
  if (element.isContentEditable || element.closest('[contenteditable="true"],[contenteditable=""]')) return true;
  return false;
}

export function isPsnProfilesPage(root) {
  return Boolean(root?.querySelector?.(PSNPROFILES_HEADER_NAV_SELECTOR) &&
    root.querySelector?.(PSNPROFILES_GUIDE_INFO_SELECTOR));
}

function isPsnProfilesOverviewContainer(element, isPsnProfilesDocument) {
  if (!isElement(element) || !isPsnProfilesDocument) return false;

  if (element.matches(PSNPROFILES_OVERVIEW_LABEL_SELECTOR)) return false;
  if (element.matches('.overview-info')) {
    return Boolean(element.querySelector(
      ':scope > .tag > .typo-bottom, :scope > [data-translight-segment="true"] > .tag > .typo-bottom'
    ));
  }
  return element.matches(SEGMENT_SELECTOR) &&
    element.parentElement?.matches('.overview-info') &&
    Boolean(element.querySelector(':scope > .tag > .typo-bottom'));
}

function isVisuallyHiddenStyle(style) {
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  const hasTinyBox = Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
  const hasHiddenOverflow = style.overflow === 'hidden' || style.overflow === 'clip';
  const hasClip = (style.clip && style.clip !== 'auto' && style.clip !== 'none') ||
    (style.clipPath && style.clipPath !== 'none');
  const isOutOfFlow = style.position === 'absolute' || style.position === 'fixed';
  return isOutOfFlow && hasTinyBox && (hasHiddenOverflow || hasClip);
}

export function isHidden(element, {includeAncestors = true} = {}) {
  if (!isElement(element)) return true;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;

  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return false;

  const cache = includeAncestors ? activeVisibilityCache : null;
  const cached = cache?.get(element);
  if (cached !== undefined) return cached;

  const visited = [];
  let hidden = false;
  let current = element;
  while (current && current.nodeType === 1) {
    const cachedAncestor = cache?.get(current);
    if (cachedAncestor !== undefined) {
      hidden = cachedAncestor;
      break;
    }
    visited.push(current);
    const style = view.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0' ||
      isVisuallyHiddenStyle(style)
    ) {
      hidden = true;
      break;
    }
    if (!includeAncestors) break;
    current = current.parentElement;
  }
  if (cache) {
    for (const visitedElement of visited) cache.set(visitedElement, hidden);
  }
  return hidden;
}

function invalidateVisibilityCache() {
  if (activeVisibilityCache) activeVisibilityCache = new WeakMap();
}

function textFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (isHidden(node)) return '';
  if (node !== root && isExcluded(node)) return '';
  if (node !== root && node.matches(GENERATED_SELECTOR)) return '';
  if (node !== root && node.matches(SEGMENT_SELECTOR)) return '';
  return Array.from(node.childNodes, (child) => textFromNode(child, root)).join('');
}

function directTextFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (isHidden(node)) return '';
  if (node !== root && isExcluded(node)) return '';
  if (node !== root && node.matches(GENERATED_SELECTOR)) return '';
  if (node !== root && node.matches(SEGMENT_SELECTOR)) return '';
  if (node !== root && node.matches(BLOCK_SELECTOR)) return '';
  return Array.from(node.childNodes, (child) => directTextFromNode(child, root)).join('');
}

export function normalizeSourceText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n\f ]+/g, ' ')
    .trim();
}

function hasLettersOrNumbers(text) {
  try {
    return /[\p{L}\p{N}]/u.test(text);
  } catch {
    return /[A-Za-z0-9]/.test(text);
  }
}

function isDirectContentLink(element, link) {
  // A mixed guide container can contain link-heavy nested cards. Only count
  // links in the same direct-content scope as the text being classified.
  let current = link?.parentElement;
  while (current && current !== element) {
    if (current.matches?.(BLOCK_SELECTOR)) return false;
    current = current.parentElement;
  }
  return current === element;
}

function isNavigationLike(element, text, {directContentOnly = false} = {}) {
  if (element.closest(NAVIGATION_SELECTOR)) return true;
  const shell = element.closest(PSNPROFILES_SHELL_SELECTOR);
  // PSNProfiles puts the guide title, statistics, and navigation in fixed
  // shell regions. Adding block translations there expands a bottom-anchored
  // banner and moves its title out of the viewport, so keep that chrome in
  // its native layout while translating the guide body below it.
  if (shell && isPsnProfilesPage(element.ownerDocument)) return true;
  // Figure captions commonly link to the referenced films, but the links are
  // part of the caption content rather than a navigation list.
  if (element.matches('figcaption')) return false;
  // Table cells commonly contain linked data values (for example, multiple
  // trophies in one row), so link density is not enough to classify them as
  // navigation. The semantic/known navigation checks above still apply.
  if (element.matches('td,th')) return false;
  const links = Array.from(element.querySelectorAll('a'))
    .filter((link) => !directContentOnly || isDirectContentLink(element, link));
  if (links.length < 2 || text.length === 0) return false;
  const linkText = links
    .map((link) => normalizeSourceText(textFromNode(link, link)))
    .join('');
  return linkText.length / text.length >= LINK_RATIO_LIMIT;
}

function isBreak(node) {
  return isElement(node) && node.tagName?.toLowerCase() === 'br';
}

function isWhitespaceText(node) {
  return node?.nodeType === 3 && !(node.nodeValue ?? '').trim();
}

function getLinkedTableItems(element) {
  if (!element.matches?.('td,th') || element.closest?.(NAVIGATION_SELECTOR)) return [];

  const items = [];
  for (const node of Array.from(element.childNodes ?? [])) {
    if (isWhitespaceText(node) || isGenerated(node)) continue;
    if (!isElement(node)) return [];

    const links = node.matches('a') ? [node] :
      node.matches('nobr') ? Array.from(node.querySelectorAll('a')) : [];
    if (links.length !== 1 || links[0].closest('td,th') !== element) return [];
    items.push(node);
  }
  return items.length > 1 ? items : [];
}

function isPhrasingContent(nodes) {
  return nodes.every((node) => {
    if (!isElement(node)) return true;
    return PHRASING_TAGS.has(node.tagName?.toLowerCase());
  });
}

function textFromNodes(nodes, root) {
  return Array.from(nodes ?? [], (node) => textFromNode(node, root)).join('');
}

function isNestedBlockNode(node) {
  if (!isElement(node)) return false;
  return node.matches?.(`${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`) ||
    Boolean(node.querySelector?.(`${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`));
}

function splitNodesAtDoubleBreaks(nodes) {
  const ranges = [];
  let segmentStart = 0;

  for (let index = 0; index < nodes.length;) {
    if (!isBreak(nodes[index])) {
      index += 1;
      continue;
    }

    let cursor = index;
    let breakCount = 0;
    while (cursor < nodes.length) {
      if (isBreak(nodes[cursor])) {
        breakCount += 1;
        cursor += 1;
        continue;
      }
      if (isWhitespaceText(nodes[cursor])) {
        cursor += 1;
        continue;
      }
      break;
    }

    if (breakCount < 2) {
      index += 1;
      continue;
    }

    ranges.push({nodes: nodes.slice(segmentStart, index)});
    segmentStart = cursor;
    index = cursor;
  }

  ranges.push({nodes: nodes.slice(segmentStart)});
  return ranges.filter(({nodes}) => nodes.length && isPhrasingContent(nodes));
}

function createSegmentWrapper(element) {
  const wrapper = element.ownerDocument.createElement('span');
  wrapper.setAttribute(SEGMENT_ATTRIBUTE, 'true');
  wrapper.setAttribute(SEGMENT_ID_ATTRIBUTE, `source-${++sourceSequence}`);
  // PSNProfiles uses spans for trophy icons and constrains every span inside
  // its table of contents to a 14px absolute box. The generated source
  // wrapper is only a segmentation boundary, so let the original link keep
  // the list item's layout while retaining the wrapper for bookkeeping.
  if (element.closest?.(PSNPROFILES_TOC_ITEM_SELECTOR)) {
    wrapper.style.setProperty('display', 'contents', 'important');
  }
  return wrapper;
}

function getDoubleLineBreakParts(value) {
  const separatorPattern = new RegExp(DOUBLE_LINE_BREAK_PATTERN.source, 'g');
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = separatorPattern.exec(value))) {
    parts.push({text: value.slice(cursor, match.index), separator: match[0]});
    cursor = separatorPattern.lastIndex;
  }
  parts.push({text: value.slice(cursor), separator: ''});
  return parts;
}

function getNestedNewlineContainers(node, root, containers = []) {
  if (!isElement(node)) return containers;
  if (node !== root && (
    isExcluded(node) ||
    node.matches(GENERATED_SELECTOR) ||
    node.matches(SEGMENT_SELECTOR) ||
    isHidden(node)
  )) return containers;

  const textNodes = [];
  for (const child of Array.from(node.childNodes ?? [])) {
    if (child.nodeType === 3) {
      if (DOUBLE_LINE_BREAK_PATTERN.test(child.nodeValue ?? '')) textNodes.push(child);
      continue;
    }
    getNestedNewlineContainers(child, root, containers);
  }
  if (textNodes.length) containers.push({container: node, textNodes});
  return containers;
}

function splitTextNodeAtDoubleLineBreaks(textNode, targetLanguage) {
  const parent = textNode.parentElement;
  if (!parent) return [];

  const value = textNode.nodeValue ?? '';
  const parts = getDoubleLineBreakParts(value);

  const translatableParts = parts.filter(({text}) => {
    const normalized = normalizeSourceText(text);
    return normalized.length >= 2 && isTranslatableBlock(parent, normalized, targetLanguage);
  });
  if (translatableParts.length < 2) return [];

  const fragment = textNode.ownerDocument.createDocumentFragment();
  const wrappers = [];
  for (const {text, separator} of parts) {
    const normalized = normalizeSourceText(text);
    if (normalized.length >= 2 && isTranslatableBlock(parent, normalized, targetLanguage)) {
      const wrapper = createSegmentWrapper(parent);
      wrapper.appendChild(textNode.ownerDocument.createTextNode(text));
      fragment.appendChild(wrapper);
      wrappers.push(wrapper);
    } else if (text) {
      fragment.appendChild(textNode.ownerDocument.createTextNode(text));
    }
    if (separator) fragment.appendChild(textNode.ownerDocument.createTextNode(separator));
  }
  textNode.parentNode.replaceChild(fragment, textNode);
  invalidateVisibilityCache();
  return wrappers;
}

function textFromPhrasingItems(items, root) {
  return items.map(({node, text}) => text == null ? textFromNode(node, root) : text).join('');
}

function isPhrasingItems(items) {
  return isPhrasingContent(items.map(({node}) => node));
}

function splitPhrasingContainerAtDoubleBreaks(container, targetLanguage) {
  if (
    isExcluded(container) ||
    isGenerated(container) ||
    isHidden(container) ||
    container.matches(SEGMENT_SELECTOR) ||
    container.closest(SEGMENT_SELECTOR)
  ) return [];
  const childNodes = Array.from(container.childNodes ?? []);
  const ranges = [];
  const textPartsByNode = new Map();
  let current = [];
  let hasBlockBoundary = false;
  const flush = () => {
    if (current.length && isPhrasingItems(current)) ranges.push({items: current});
    current = [];
  };

  for (let index = 0; index < childNodes.length;) {
    const node = childNodes[index];
    if (isNestedBlockNode(node)) {
      flush();
      hasBlockBoundary = true;
      index += 1;
      continue;
    }

    if (isBreak(node)) {
      let cursor = index;
      let breakCount = 0;
      while (cursor < childNodes.length) {
        if (isBreak(childNodes[cursor])) {
          breakCount += 1;
          cursor += 1;
          continue;
        }
        if (isWhitespaceText(childNodes[cursor])) {
          cursor += 1;
          continue;
        }
        break;
      }
      if (breakCount >= 2) {
        flush();
        index = cursor;
        continue;
      }
      current.push({node});
      index += 1;
      continue;
    }

    if (node.nodeType === 3) {
      const parts = getDoubleLineBreakParts(node.nodeValue ?? '');
      if (parts.length > 1) {
        const textParts = [];
        textPartsByNode.set(node, textParts);
        for (const {text, separator} of parts) {
          if (text) {
            const item = {node, text};
            current.push(item);
            textParts.push(item);
          }
          if (separator) flush();
        }
      } else {
        current.push({node});
      }
      index += 1;
      continue;
    }

    current.push({node});
    index += 1;
  }
  flush();

  if (!ranges.length || (!hasBlockBoundary && ranges.length < 2)) return [];

  const translatableRanges = ranges.filter(({items}) => {
    const text = normalizeSourceText(textFromPhrasingItems(items, container));
    return text.length >= 2 && isTranslatableBlock(container, text, targetLanguage);
  });
  if (!translatableRanges.length) return [];

  for (const [textNode, textParts] of textPartsByNode) {
    if (!textNode.parentNode) continue;
    const fragment = textNode.ownerDocument.createDocumentFragment();
    let textPartIndex = 0;
    for (const {text, separator} of getDoubleLineBreakParts(textNode.nodeValue ?? '')) {
      if (text) {
        const replacement = textNode.ownerDocument.createTextNode(text);
        textParts[textPartIndex++].replacement = replacement;
        fragment.appendChild(replacement);
      }
      if (separator) fragment.appendChild(textNode.ownerDocument.createTextNode(separator));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  const wrappers = [];
  for (const {items} of [...translatableRanges].reverse()) {
    const nodes = items
      .map((item) => item.replacement ?? item.node)
      .filter((node) => node?.parentNode);
    const firstNode = nodes[0];
    if (!firstNode?.parentNode) continue;
    const wrapper = createSegmentWrapper(container);
    container.insertBefore(wrapper, firstNode);
    for (const node of nodes) wrapper.appendChild(node);
    wrappers.unshift(wrapper);
  }
  invalidateVisibilityCache();
  return wrappers;
}

function getResidualElementsAndBoundaryNodes(element, processedContainers) {
  const residualElements = [element];
  const seenResidualElements = new Set(residualElements);
  const boundaryNodesByElement = new Map([[element, new Set()]]);

  const addBoundary = (residualElement, boundaryNode) => {
    if (!boundaryNodesByElement.has(residualElement)) {
      boundaryNodesByElement.set(residualElement, new Set());
    }
    boundaryNodesByElement.get(residualElement).add(boundaryNode);
  };

  for (const container of processedContainers) {
    if (container === element) {
      for (const node of Array.from(element.childNodes ?? [])) addBoundary(element, node);
      continue;
    }

    const path = [];
    let current = container;
    while (current && current !== element) {
      path.push(current);
      current = current.parentElement;
    }
    if (current !== element) continue;

    for (let index = 0; index < path.length; index += 1) {
      const boundaryNode = path[index];
      const residualElement = path[index + 1] ?? element;
      if (!seenResidualElements.has(residualElement)) {
        seenResidualElements.add(residualElement);
        residualElements.push(residualElement);
        boundaryNodesByElement.set(residualElement, new Set());
      }
      addBoundary(residualElement, boundaryNode);
    }
  }

  return {residualElements, boundaryNodesByElement};
}

function splitUnsegmentedDirectChildrenIntoSegments(
  element,
  processedContainers,
  targetLanguage,
  {boundaryNodes = new Set()} = {}
) {
  if (!processedContainers.length) return [];

  const ranges = [];
  let current = [];
  const flush = () => {
    if (current.length) ranges.push(current);
    current = [];
  };

  for (const node of Array.from(element.childNodes ?? [])) {
    if (boundaryNodes.has(node)) {
      flush();
      continue;
    }
    if (node.nodeType === 1 && (
      node.matches?.(SEGMENT_SELECTOR) ||
      isNestedBlockNode(node) ||
      isExcluded(node) ||
      isGenerated(node) ||
      isHidden(node)
    )) {
      flush();
      continue;
    }
    current.push(node);
  }
  flush();

  const wrappers = [];
  for (const nodes of [...ranges].reverse()) {
    const text = normalizeSourceText(textFromNodes(nodes, element));
    if (text.length < 2 || !isTranslatableBlock(element, text, targetLanguage)) continue;

    const wrapper = createSegmentWrapper(element);
    element.insertBefore(wrapper, nodes[0]);
    for (const node of nodes) wrapper.appendChild(node);
    wrappers.unshift(wrapper);
  }
  if (wrappers.length) invalidateVisibilityCache();
  return wrappers;
}

function hasUnsegmentedDirectText(element, boundaryNodes) {
  return Array.from(element.childNodes ?? []).some((node) => {
    if (boundaryNodes.has(node)) return false;
    if (node.nodeType === 3) return Boolean((node.nodeValue ?? '').trim());
    return isElement(node) && !node.querySelector('a') && !isNestedBlockNode(node);
  });
}

function splitResidualElementsIntoSegments(
  element,
  processedContainers,
  targetLanguage,
  {requireDirectText = false} = {}
) {
  const {residualElements, boundaryNodesByElement} =
    getResidualElementsAndBoundaryNodes(element, processedContainers);
  const wrappers = [];
  for (const residualElement of residualElements) {
    const boundaryNodes = boundaryNodesByElement.get(residualElement) ?? new Set();
    if (requireDirectText && !hasUnsegmentedDirectText(residualElement, boundaryNodes)) {
      continue;
    }
    wrappers.push(...splitUnsegmentedDirectChildrenIntoSegments(
      residualElement,
      processedContainers,
      targetLanguage,
      {boundaryNodes}
    ));
  }
  return wrappers;
}

function splitNestedBreaksIntoSegments(element, targetLanguage) {
  const containers = [];
  const seenContainers = new Set();
  for (const breakNode of element.querySelectorAll('br')) {
    const container = breakNode.parentElement;
    if (!container || seenContainers.has(container)) continue;
    seenContainers.add(container);
    containers.push(container);
  }
  const wrappers = [];
  const processedContainers = [];
  for (const container of containers) {
    if (container.closest(SEGMENT_SELECTOR)) continue;
    const containerWrappers = splitPhrasingContainerAtDoubleBreaks(container, targetLanguage);
    if (!containerWrappers.length) continue;
    processedContainers.push(container);
    wrappers.push(...containerWrappers);
  }

  wrappers.push(...splitResidualElementsIntoSegments(
    element,
    processedContainers,
    targetLanguage
  ));
  return wrappers;
}

function splitNestedNewlineTextIntoSegments(element, targetLanguage) {
  const wrappers = [];
  const processedContainers = [];
  for (const {container, textNodes} of getNestedNewlineContainers(element, element)) {
    const containerWrappers = splitPhrasingContainerAtDoubleBreaks(container, targetLanguage);
    if (containerWrappers.length) {
      processedContainers.push(container);
      wrappers.push(...containerWrappers);
      continue;
    }

    const textNodeWrappers = textNodes.flatMap((textNode) =>
      textNode.parentNode ? splitTextNodeAtDoubleLineBreaks(textNode, targetLanguage) : []
    );
    if (!textNodeWrappers.length) continue;
    processedContainers.push(container);
    wrappers.push(...textNodeWrappers);
    wrappers.push(...splitUnsegmentedDirectChildrenIntoSegments(
      container,
      textNodeWrappers,
      targetLanguage,
      {boundaryNodes: new Set(textNodeWrappers)}
    ));
  }
  if (!wrappers.length) return splitNestedBreaksIntoSegments(element, targetLanguage);

  // A newline split can begin inside an inline control tree. Only expand
  // ancestors that also contain direct residual prose so unrelated inline
  // siblings (such as chapter links) stay outside the new segment scope.
  wrappers.push(...splitResidualElementsIntoSegments(
    element,
    processedContainers,
    targetLanguage,
    {requireDirectText: true}
  ));
  return wrappers;
}

function directContentRanges(element) {
  const ranges = [];
  let current = [];
  const flush = () => {
    ranges.push(...splitNodesAtDoubleBreaks(current));
    current = [];
  };

  for (const node of Array.from(element.childNodes ?? [])) {
    if (isNestedBlockNode(node)) {
      flush();
      continue;
    }
    current.push(node);
  }
  flush();
  return ranges;
}

function splitDirectTextIntoSegments(element, targetLanguage, {hasNestedBlocks = false} = {}) {
  if (!isElement(element) || element.matches(SEGMENT_SELECTOR)) return [];

  const ranges = directContentRanges(element);
  if (ranges.length < 2) return splitNestedNewlineTextIntoSegments(element, targetLanguage);

  const translatableRanges = ranges.filter(({nodes}) => {
    const text = normalizeSourceText(textFromNodes(nodes, element));
    return text.length >= 2 && isTranslatableBlock(element, text, targetLanguage);
  });
  if (!translatableRanges.length) return splitNestedNewlineTextIntoSegments(element, targetLanguage);

  const wrappers = [];
  for (const {nodes} of [...translatableRanges].reverse()) {
    const firstNode = nodes[0];
    if (!firstNode?.parentNode) continue;
    const wrapper = createSegmentWrapper(element);
    element.insertBefore(wrapper, firstNode);
    for (const node of nodes) wrapper.appendChild(node);
    wrappers.unshift(wrapper);
  }
  if (wrappers.length) invalidateVisibilityCache();
  return wrappers;
}

function getCandidates(root, {isPsnProfilesDocument = isPsnProfilesPage(root.ownerDocument ?? root)} = {}) {
  const candidateSelector = isPsnProfilesDocument
    ? `${CANDIDATE_SELECTOR},${PSNPROFILES_OVERVIEW_LABEL_SELECTOR}`
    : CANDIDATE_SELECTOR;
  const candidates = [];
  if (isElement(root) && root.matches(candidateSelector)) candidates.push(root);
  candidates.push(...root.querySelectorAll(candidateSelector));
  return candidates;
}

export function hasVisibleBlockDescendant(element, candidateSet, predicate = () => true) {
  const descendants = element?.querySelectorAll?.(CANDIDATE_SELECTOR);
  if (!descendants) return false;
  for (const descendant of descendants) {
    if ((!candidateSet || candidateSet.has(descendant)) &&
        predicate(descendant) && !isHidden(descendant)) {
      return true;
    }
  }
  return false;
}

function hasBlockDescendant(element, candidateSet) {
  return hasVisibleBlockDescendant(element, candidateSet);
}

function hasNonSegmentBlockDescendant(element, candidateSet) {
  return hasVisibleBlockDescendant(
    element,
    candidateSet,
    (descendant) => !descendant.matches(SEGMENT_SELECTOR)
  );
}

export function collectTranslationBlocks(
  root = globalThis.document?.body,
  {targetLanguage = 'ko', onExcluded, onHidden, splitSegments = true, isActiveSource} = {}
) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const isPsnProfilesDocument = isPsnProfilesPage(root.ownerDocument ?? root);
  const candidates = getCandidates(root, {isPsnProfilesDocument});
  const candidateSet = new Set(candidates);
  const blocks = [];
  const previousVisibilityCache = activeVisibilityCache;
  activeVisibilityCache = new WeakMap();

  const processCandidate = (element, {allowSegmentation = splitSegments} = {}) => {
    if (!isElement(element)) return;
    if (isGenerated(element) || isExcluded(element)) return;
    const markedSourceId = element.getAttribute(SOURCE_ID_ATTRIBUTE);
    const isExistingSource = Boolean(markedSourceId) &&
      (typeof isActiveSource !== 'function' || isActiveSource(element));
    const existingSourceId = isExistingSource ? markedSourceId : null;
    const excludeExisting = () => {
      if (isExistingSource) onExcluded?.(element);
    };
    if (isHidden(element) && !isExistingSource) {
      onHidden?.(element);
      return;
    }

    // The overview badges contain numeric values and labels as separate
    // inline elements. Translating the container (or the segment wrapper
    // created by generic line-break splitting) repeats all three numbers in
    // one generated line. Collect only the labels below instead.
    if (isPsnProfilesOverviewContainer(element, isPsnProfilesDocument)) {
      excludeExisting();
      return;
    }

    const linkedTableItems = getLinkedTableItems(element);
    if (linkedTableItems.length > 1) {
      // A table cell can contain several independent linked values. Keep the
      // cell as the shared layout anchor, but translate each value separately
      // so the renderer can preserve a visible gap between their highlights.
      if (isExistingSource) excludeExisting();
      const tableLinkedGroup = {cell: element, items: linkedTableItems};
      const linkedBlocks = [];
      let canSplit = true;

      for (const [index, item] of linkedTableItems.entries()) {
        const itemMarkedSourceId = item.getAttribute(SOURCE_ID_ATTRIBUTE);
        const itemIsExistingSource = Boolean(itemMarkedSourceId) &&
          (typeof isActiveSource !== 'function' || isActiveSource(item));
        const itemExistingSourceId = itemIsExistingSource ? itemMarkedSourceId : null;
        const excludeExistingItem = () => {
          if (itemIsExistingSource) onExcluded?.(item);
        };
        if (isHidden(item) && !itemIsExistingSource) {
          canSplit = false;
          break;
        }

        const itemText = normalizeSourceText(textFromNode(item, item));
        if (itemText.length < 2 || !hasLettersOrNumbers(itemText) ||
            !isTranslatableBlock(item, itemText, targetLanguage)) {
          excludeExistingItem();
          canSplit = false;
          break;
        }

        const itemSourceHash = hashSourceText(itemText);
        if (itemIsExistingSource && !item.getAttribute(SOURCE_HASH_ATTRIBUTE)) continue;
        if (itemIsExistingSource && item.getAttribute(PRESENTATION_HASH_ATTRIBUTE) === itemSourceHash) continue;
        if (itemIsExistingSource && item.getAttribute(SOURCE_HASH_ATTRIBUTE) === itemSourceHash) continue;
        if (itemIsExistingSource) item.setAttribute(PENDING_SOURCE_HASH_ATTRIBUTE, itemSourceHash);

        linkedBlocks.push({
          element: item,
          text: itemText,
          sourceId: itemExistingSourceId || `source-${++sourceSequence}`,
          sourceHash: itemSourceHash,
          mixedContent: false,
          tableLinked: {group: tableLinkedGroup, index}
        });
      }

      if (canSplit) {
        blocks.push(...linkedBlocks);
        return;
      }
    }
    const hasSegmentDescendant = Boolean(element.querySelector(SEGMENT_SELECTOR));
    if (!isExistingSource && hasSegmentDescendant && !hasNonSegmentBlockDescendant(element, candidateSet)) return;
    const hasNestedBlocks = hasBlockDescendant(element, candidateSet);
    const directText = hasNestedBlocks ? normalizeSourceText(directTextFromNode(element, element)) : '';
    if (hasNestedBlocks && !directText) return;

    const text = hasNestedBlocks ? directText : normalizeSourceText(textFromNode(element, element));
    const segmentationText = hasNestedBlocks ? directText : text;
    const navigationOptions = hasNestedBlocks ? {directContentOnly: true} : undefined;
    if (allowSegmentation && segmentationText && !isNavigationLike(element, segmentationText, navigationOptions)) {
      const segments = splitDirectTextIntoSegments(element, targetLanguage, {hasNestedBlocks});
      if (segments.length) {
        for (const segment of segments) processCandidate(segment, {allowSegmentation: false});
        return;
      }
    }
    if (text.length < 2 || !hasLettersOrNumbers(text) || isNavigationLike(element, text, navigationOptions)) {
      excludeExisting();
      return;
    }
    if (!isTranslatableBlock(element, text, targetLanguage)) {
      excludeExisting();
      return;
    }
    const sourceHash = hashSourceText(text);
    if (isExistingSource && !element.getAttribute(SOURCE_HASH_ATTRIBUTE)) return;
    if (isExistingSource && element.getAttribute(PRESENTATION_HASH_ATTRIBUTE) === sourceHash) return;
    if (isExistingSource && element.getAttribute(SOURCE_HASH_ATTRIBUTE) === sourceHash) return;
    if (isExistingSource) element.setAttribute(PENDING_SOURCE_HASH_ATTRIBUTE, sourceHash);

    blocks.push({
      element,
      text,
      sourceId: existingSourceId || element.getAttribute(SEGMENT_ID_ATTRIBUTE) || `source-${++sourceSequence}`,
      sourceHash,
      mixedContent: hasNestedBlocks
    });
  };

  let sortedBlocks;
  try {
    for (const element of candidates) processCandidate(element);

    sortedBlocks = blocks.sort((left, right) => {
      const position = left.element.compareDocumentPosition?.(right.element) ?? 0;
      if (position & 4) return -1;
      if (position & 2) return 1;
      return 0;
    });
  } finally {
    activeVisibilityCache = previousVisibilityCache;
  }
  return sortedBlocks;
}

export function resetSourceSequence() {
  sourceSequence = 0;
}
