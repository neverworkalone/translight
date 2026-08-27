import { hashSourceText } from './translation-queue.js';
import { isTranslatableBlock } from './language.js';

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const EXCLUDED_ANCESTOR_SELECTOR = `${EXCLUDED_CONTENT_SELECTOR},[contenteditable="true"],[contenteditable=""]`;
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const NAVIGATION_SELECTOR = 'nav,[role="navigation"],[role="menu"],[aria-haspopup="menu"]';
const LINK_RATIO_LIMIT = 0.65;
const DOUBLE_LINE_BREAK_PATTERN = /\r?\n[ \t\f]*(?:\r?\n)+/;
const SOURCE_ID_ATTRIBUTE = 'data-translight-source-id';
const SOURCE_HASH_ATTRIBUTE = 'data-translight-source-hash';
const PENDING_SOURCE_HASH_ATTRIBUTE = 'data-translight-pending-source-hash';
const PRESENTATION_HASH_ATTRIBUTE = 'data-translight-presentation-hash';
export const SEGMENT_ATTRIBUTE = 'data-translight-segment';
export const SEGMENT_ID_ATTRIBUTE = 'data-translight-segment-id';
export const SEGMENT_SELECTOR = `[${SEGMENT_ATTRIBUTE}="true"]`;
const CANDIDATE_SELECTOR = `${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`;
const PHRASING_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'del',
  'dfn', 'em', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'meter',
  'noscript', 'object', 'output', 'picture', 'progress', 'q', 'ruby', 's',
  'samp', 'select', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'template',
  'textarea', 'time', 'u', 'var', 'wbr'
]);

let sourceSequence = 0;

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

  let current = element;
  while (current && current.nodeType === 1) {
    const style = view.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0' ||
      isVisuallyHiddenStyle(style)
    ) {
      return true;
    }
    if (!includeAncestors) break;
    current = current.parentElement;
  }
  return false;
}

function textFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (isHidden(node)) return '';
  if (node !== root && node.matches(EXCLUDED_CONTENT_SELECTOR)) return '';
  if (node !== root && node.matches(GENERATED_SELECTOR)) return '';
  if (node !== root && node.matches(SEGMENT_SELECTOR)) return '';
  return Array.from(node.childNodes, (child) => textFromNode(child, root)).join('');
}

function directTextFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (isHidden(node)) return '';
  if (node !== root && node.matches(EXCLUDED_CONTENT_SELECTOR)) return '';
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

function isNavigationLike(element, text) {
  if (element.closest(NAVIGATION_SELECTOR)) return true;
  const links = Array.from(element.querySelectorAll('a'));
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
  return wrapper;
}

function getTextNodes(node, root, nodes = []) {
  if (node?.nodeType === 3) {
    nodes.push(node);
    return nodes;
  }
  if (!isElement(node)) return nodes;
  if (node !== root && (
    node.matches(EXCLUDED_CONTENT_SELECTOR) ||
    node.matches(GENERATED_SELECTOR) ||
    node.matches(SEGMENT_SELECTOR) ||
    isHidden(node)
  )) return nodes;
  for (const child of Array.from(node.childNodes ?? [])) getTextNodes(child, root, nodes);
  return nodes;
}

function splitTextNodeAtDoubleLineBreaks(textNode, targetLanguage) {
  const parent = textNode.parentElement;
  if (!parent) return [];

  const value = textNode.nodeValue ?? '';
  const separatorPattern = new RegExp(DOUBLE_LINE_BREAK_PATTERN.source, 'g');
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = separatorPattern.exec(value))) {
    parts.push({text: value.slice(cursor, match.index), separator: match[0]});
    cursor = separatorPattern.lastIndex;
  }
  parts.push({text: value.slice(cursor), separator: ''});

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
  return wrappers;
}

function splitNestedNewlineTextIntoSegments(element, targetLanguage) {
  for (const textNode of getTextNodes(element, element)) {
    if (!DOUBLE_LINE_BREAK_PATTERN.test(textNode.nodeValue ?? '')) continue;
    const wrappers = splitTextNodeAtDoubleLineBreaks(textNode, targetLanguage);
    if (wrappers.length) return wrappers;
  }
  return [];
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
  if (ranges.length < 2 && hasNestedBlocks) return [];
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
  return wrappers;
}

function getCandidates(root) {
  const candidates = [];
  if (isElement(root) && root.matches(CANDIDATE_SELECTOR)) candidates.push(root);
  candidates.push(...root.querySelectorAll(CANDIDATE_SELECTOR));
  return candidates;
}

function hasBlockDescendant(element, candidateSet) {
  return Array.from(element.querySelectorAll(CANDIDATE_SELECTOR))
    .some((descendant) => candidateSet.has(descendant));
}

function hasNonSegmentBlockDescendant(element, candidateSet) {
  return Array.from(element.querySelectorAll(CANDIDATE_SELECTOR))
    .some((descendant) => candidateSet.has(descendant) && !descendant.matches(SEGMENT_SELECTOR));
}

export function collectTranslationBlocks(
  root = globalThis.document?.body,
  {targetLanguage = 'ko', onExcluded, splitSegments = true, isActiveSource} = {}
) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const candidates = getCandidates(root);
  const candidateSet = new Set(candidates);
  const blocks = [];

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
    if (isHidden(element) && !isExistingSource) return;
    const hasSegmentDescendant = Boolean(element.querySelector(SEGMENT_SELECTOR));
    if (!isExistingSource && hasSegmentDescendant && !hasNonSegmentBlockDescendant(element, candidateSet)) return;
    const hasNestedBlocks = hasBlockDescendant(element, candidateSet);
    const directText = hasNestedBlocks ? normalizeSourceText(directTextFromNode(element, element)) : '';
    if (hasNestedBlocks && !directText) return;

    const text = hasNestedBlocks ? directText : normalizeSourceText(textFromNode(element, element));
    const segmentationText = hasNestedBlocks ? directText : text;
    if (allowSegmentation && segmentationText && !isNavigationLike(element, segmentationText)) {
      const segments = splitDirectTextIntoSegments(element, targetLanguage, {hasNestedBlocks});
      if (segments.length) {
        for (const segment of segments) processCandidate(segment, {allowSegmentation: false});
        return;
      }
    }
    if (text.length < 2 || !hasLettersOrNumbers(text) || isNavigationLike(element, text)) {
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

  for (const element of candidates) processCandidate(element);

  return blocks.sort((left, right) => {
    const position = left.element.compareDocumentPosition?.(right.element) ?? 0;
    if (position & 4) return -1;
    if (position & 2) return 1;
    return 0;
  });
}

export function resetSourceSequence() {
  sourceSequence = 0;
}
