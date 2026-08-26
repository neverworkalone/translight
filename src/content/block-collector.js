import { hashSourceText } from './translation-queue.js';
import { isTranslatableBlock } from './language.js';

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,td,th';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const EXCLUDED_ANCESTOR_SELECTOR = `${EXCLUDED_CONTENT_SELECTOR},[contenteditable="true"],[contenteditable=""]`;
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const NAVIGATION_SELECTOR = 'nav,[role="navigation"],[role="menu"],[aria-haspopup="menu"]';
const LINK_RATIO_LIMIT = 0.65;
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

function isExcluded(element) {
  if (!isElement(element)) return true;
  if (element.matches(EXCLUDED_ANCESTOR_SELECTOR) || element.closest(EXCLUDED_ANCESTOR_SELECTOR)) return true;
  if (element.isContentEditable || element.closest('[contenteditable="true"],[contenteditable=""]')) return true;
  return false;
}

function isHidden(element) {
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
      style.opacity === '0'
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function textFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (node !== root && node.matches(EXCLUDED_CONTENT_SELECTOR)) return '';
  if (node !== root && node.matches(GENERATED_SELECTOR)) return '';
  if (node !== root && node.matches(SEGMENT_SELECTOR)) return '';
  return Array.from(node.childNodes, (child) => textFromNode(child, root)).join('');
}

function directTextFromNode(node, root) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
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

function directSegmentRanges(element) {
  const nodes = Array.from(element.childNodes ?? []);
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

function splitDirectTextIntoSegments(element, targetLanguage) {
  if (!isElement(element) || element.matches(SEGMENT_SELECTOR)) return [];

  const ranges = directSegmentRanges(element);
  if (ranges.length < 2) return [];

  const translatableRanges = ranges.filter(({nodes}) => {
    const text = normalizeSourceText(textFromNodes(nodes, element));
    return text.length >= 2 && isTranslatableBlock(element, text, targetLanguage);
  });
  if (!translatableRanges.length) return [];

  const wrappers = [];
  for (const {nodes} of [...translatableRanges].reverse()) {
    const firstNode = nodes[0];
    if (!firstNode?.parentNode) continue;
    const wrapper = element.ownerDocument.createElement('span');
    wrapper.setAttribute(SEGMENT_ATTRIBUTE, 'true');
    wrapper.setAttribute(SEGMENT_ID_ATTRIBUTE, `source-${++sourceSequence}`);
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

export function collectTranslationBlocks(
  root = globalThis.document?.body,
  {targetLanguage = 'ko', onExcluded} = {}
) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const candidates = getCandidates(root);
  const candidateSet = new Set(candidates);
  const blocks = [];

  const processCandidate = (element, {allowSegmentation = true} = {}) => {
    if (!isElement(element)) return;
    if (isGenerated(element) || isExcluded(element)) return;
    const existingSourceId = element.getAttribute(SOURCE_ID_ATTRIBUTE);
    const isExistingSource = Boolean(existingSourceId);
    const excludeExisting = () => {
      if (isExistingSource) onExcluded?.(element);
    };
    if (isHidden(element) && !isExistingSource) return;
    const hasNestedBlocks = hasBlockDescendant(element, candidateSet);
    const directText = hasNestedBlocks ? normalizeSourceText(directTextFromNode(element, element)) : '';
    if (hasNestedBlocks && !directText) return;

    const text = hasNestedBlocks ? directText : normalizeSourceText(textFromNode(element, element));
    if (allowSegmentation && !hasNestedBlocks && !isNavigationLike(element, text)) {
      const segments = splitDirectTextIntoSegments(element, targetLanguage);
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

  return blocks;
}

export function resetSourceSequence() {
  sourceSequence = 0;
}
