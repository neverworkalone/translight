import {TranslationRenderer} from '../../src/content/translation-renderer.js';

const source = document.querySelector('#source');
const report = document.querySelector('#report');
const renderer = new TranslationRenderer({document, sessionId: 'google-result-transform-repro'});
const translation = renderer.insert({
  element: source,
  sourceId: 'google-result-transform-source',
  translatedText: 'Never Work Alone: 삶과 일이 팀 스포츠이기 때문입니다.'
});
const sourceRect = source.getBoundingClientRect();
const translationRect = translation.getBoundingClientRect();
const verticalFlip = (element) => {
  const transform = getComputedStyle(element).transform;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/u);
  if (matrix) {
    const values = matrix[1].split(',').map(Number);
    return Math.abs(values[0] - 1) < 0.001 && Math.abs(values[1]) < 0.001 &&
      Math.abs(values[2]) < 0.001 && Math.abs(values[3] + 1) < 0.001 &&
      Math.abs(values[4]) < 0.001 && Math.abs(values[5]) < 0.001;
  }
  return /^scaleY\(-1\)$/u.test(transform.replace(/\s/gu, ''));
};
const verticalFlipCount = (element) => {
  let count = 0;
  for (let current = element; current; current = current.parentElement) {
    if (verticalFlip(current)) count += 1;
  }
  return count;
};
const matchingTransformRules = (element) => Array.from(document.styleSheets)
  .flatMap((sheet) => Array.from(sheet.cssRules ?? []))
  .filter((rule) => rule.type === CSSRule.STYLE_RULE && rule.style.transform &&
    element.matches(rule.selectorText))
  .map((rule) => `${rule.selectorText} { transform: ${rule.style.transform}; }`);
const transformChain = (element) => {
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
};
const result = {
  fixture: 'google-result-transform-repro',
  placement: renderer.getRecordForElement(source)?.placement,
  translationTransform: getComputedStyle(translation).transform,
  translationTextTransform: getComputedStyle(translation.firstElementChild).transform,
  googleTransformRules: [...new Set(
    [...transformChain(source), ...transformChain(translation)]
      .flatMap(({matchingRules}) => matchingRules)
      .filter((rule) => rule.includes('.V9tjod') && rule.includes('scaleY(-1)'))
  )],
  sourceVerticalFlipCount: verticalFlipCount(source),
  translationVerticalFlipCount: verticalFlipCount(translation),
  translationBelowSource: translationRect.top >= sourceRect.bottom,
  sourceRect: {top: sourceRect.top, bottom: sourceRect.bottom},
  translationRect: {top: translationRect.top, bottom: translationRect.bottom}
};
result.testPassed = result.googleTransformRules.length > 0 &&
  result.sourceVerticalFlipCount % 2 === 0 &&
  result.translationVerticalFlipCount % 2 === 0 && result.translationBelowSource;
report.textContent = JSON.stringify(result, null, 2);
