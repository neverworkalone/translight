import {PageSession} from '../../src/content/page-session.js';

const source = document.querySelector('#source');
const url = document.querySelector('.ESMNde');
const link = source.closest('a');
const report = document.querySelector('#report');
const translationInputs = [];
const originalUrlText = url.textContent;
const originalHref = link.href;

const session = new PageSession({
  generation: 6201,
  document,
  settings: {translatePageTitle: false},
  observe: false,
  provider: {
    getModelState: async () => 'Available',
    prepare: async () => {},
    translate: async (text) => {
      translationInputs.push(text);
      if (text === 'neverworkalone.com') return 'Neverworkalone.com';
      if (text === 'https://www.neverworkalone.com') return text;
      return `ko:${text}`;
    },
    cancel: () => {},
    close: () => {}
  }
});

function verticalFlip(element) {
  const transform = getComputedStyle(element).transform;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/u);
  if (matrix) {
    const values = matrix[1].split(',').map(Number);
    return Math.abs(values[0] - 1) < 0.001 && Math.abs(values[1]) < 0.001 &&
      Math.abs(values[2]) < 0.001 && Math.abs(values[3] + 1) < 0.001 &&
      Math.abs(values[4]) < 0.001 && Math.abs(values[5]) < 0.001;
  }
  return /^scaleY\(-1\)$/u.test(transform.replace(/\s/gu, ''));
}

function verticalFlipCount(element) {
  let count = 0;
  for (let current = element; current; current = current.parentElement) {
    if (verticalFlip(current)) count += 1;
  }
  return count;
}

function matchingTransformRules(element) {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules ?? []))
    .filter((rule) => rule.type === CSSRule.STYLE_RULE && rule.style.transform &&
      element.matches(rule.selectorText))
    .map((rule) => `${rule.selectorText} { transform: ${rule.style.transform}; }`);
}

function transformChain(element) {
  const chain = [];
  for (let current = element; current; current = current.parentElement) {
    const transform = getComputedStyle(current).transform;
    if (transform !== 'none') {
      chain.push({
        element: current.tagName.toLowerCase(),
        classes: current.className?.baseVal ?? current.className ?? '',
        transform,
        matchingRules: matchingTransformRules(current)
      });
    }
  }
  return chain;
}

async function run() {
  const collectedBlocks = session.collectBlocks(document.body, {
    targetLanguage: 'ko',
    splitSegments: false
  });
  const translationSources = collectedBlocks.map(({element, text}) => ({
    tag: element.tagName.toLowerCase(),
    classes: element.className?.baseVal ?? element.className ?? '',
    text
  }));

  await session.start();

  const translation = session.renderer?.getRecordForElement(source)?.translation;
  const urlTranslation = session.renderer?.getRecordForElement(url)?.translation;
  const sourceRect = source.getBoundingClientRect();
  const translationRect = translation?.getBoundingClientRect();
  const urlRect = url.getBoundingClientRect();
  const urlTranslationRect = urlTranslation?.getBoundingClientRect();
  const translationText = translation?.querySelector('[data-translight-text="true"]');
  const urlTranslationText = urlTranslation?.querySelector('[data-translight-text="true"]');
  const googleTransformRules = [...new Set(
    [...transformChain(source), ...transformChain(translation ?? source)]
      .flatMap(({matchingRules}) => matchingRules)
      .filter((rule) => rule.includes('.V9tjod') && rule.includes('scaleY(-1)'))
  )];
  const translatedUrlRecord = session.renderer?.getRecordForElement(url) ?? null;
  const expectsUrlProtection = document.body.dataset.fixture === 'url-translation';
  const translationOverlapsUrl = Boolean(translationRect &&
    translationRect.left < urlRect.right && translationRect.right > urlRect.left &&
    translationRect.top < urlRect.bottom && translationRect.bottom > urlRect.top);
  const result = {
    fixture: 'google-result-transform-repro',
    translationSources,
    translationInputs,
    urlText: url.textContent,
    urlTextUnchanged: url.textContent === originalUrlText,
    href: link.href,
    hrefUnchanged: link.href === originalHref,
    urlHasTranslationRecord: Boolean(translatedUrlRecord),
    urlTranslationText: urlTranslationText?.textContent ?? null,
    urlTranslationRect: urlTranslationRect
      ? {top: urlTranslationRect.top, bottom: urlTranslationRect.bottom}
      : null,
    translationOverlapsUrl,
    placement: session.renderer?.getRecordForElement(source)?.placement,
    translationTransform: translation ? getComputedStyle(translation).transform : null,
    translationTextTransform: translationText ? getComputedStyle(translationText).transform : null,
    googleTransformRules,
    sourceVerticalFlipCount: verticalFlipCount(source),
    translationVerticalFlipCount: translation ? verticalFlipCount(translation) : null,
    translationBelowSource: Boolean(translationRect && translationRect.top >= sourceRect.bottom),
    sourceRect: {top: sourceRect.top, bottom: sourceRect.bottom},
    urlRect: {top: urlRect.top, bottom: urlRect.bottom},
    translationRect: translationRect ? {top: translationRect.top, bottom: translationRect.bottom} : null
  };
  result.testPassed = expectsUrlProtection
    ? !translation && !urlTranslation && translationInputs.length === 0 &&
      result.urlTextUnchanged && result.hrefUnchanged
    : Boolean(translation) && result.googleTransformRules.length > 0 &&
      result.sourceVerticalFlipCount % 2 === 0 &&
      result.translationVerticalFlipCount % 2 === 0 && result.translationBelowSource &&
      result.urlTextUnchanged && result.hrefUnchanged && !result.urlHasTranslationRecord &&
      !translationInputs.some((text) => text.includes(originalUrlText)) && !result.translationOverlapsUrl;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({
    fixture: 'google-result-transform-repro',
    error: error.message,
    stack: error.stack,
    testPassed: false
  }, null, 2);
});
