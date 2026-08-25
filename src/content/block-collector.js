const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div';
const EXCLUDED_CONTENT_SELECTOR = 'script,style,noscript,code,pre,input,textarea,select,button';
const EXCLUDED_ANCESTOR_SELECTOR = `${EXCLUDED_CONTENT_SELECTOR},[contenteditable="true"],[contenteditable=""]`;
const GENERATED_SELECTOR = 'translight-translation,[data-translight-generated="true"]';
const NAVIGATION_SELECTOR = 'nav,[role="navigation"],[role="menu"],[aria-haspopup="menu"]';
const LINK_RATIO_LIMIT = 0.65;

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
  return Array.from(node.childNodes, (child) => textFromNode(child, root)).join('');
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

function getCandidates(root) {
  const candidates = [];
  if (isElement(root) && root.matches(BLOCK_SELECTOR)) candidates.push(root);
  candidates.push(...root.querySelectorAll(BLOCK_SELECTOR));
  return candidates;
}

function hasBlockDescendant(element, candidateSet) {
  return Array.from(element.querySelectorAll(BLOCK_SELECTOR)).some((descendant) => candidateSet.has(descendant));
}

function hasMeaningfulText(element) {
  const text = normalizeSourceText(textFromNode(element, element));
  return text.length >= 2 && hasLettersOrNumbers(text);
}

export function collectTranslationBlocks(root = globalThis.document?.body) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const candidates = getCandidates(root);
  const candidateSet = new Set(candidates);
  const blocks = [];

  for (const element of candidates) {
    if (!isElement(element)) continue;
    if (isGenerated(element) || isExcluded(element) || isHidden(element)) continue;
    if (hasBlockDescendant(element, candidateSet)) continue;

    const text = normalizeSourceText(textFromNode(element, element));
    if (!hasMeaningfulText(element) || isNavigationLike(element, text)) continue;
    if (element.hasAttribute('data-translight-source-id')) continue;

    blocks.push({
      element,
      text,
      sourceId: `source-${++sourceSequence}`
    });
  }

  return blocks;
}

export function resetSourceSequence() {
  sourceSequence = 0;
}
