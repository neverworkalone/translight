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
const result = {
  fixture: 'google-result-transform-repro',
  sourceText: source.textContent,
  translatedText: translation.textContent,
  placement: renderer.getRecordForElement(source)?.placement,
  translationTransform: getComputedStyle(translation).transform,
  translationTextTransform: getComputedStyle(translation.firstElementChild).transform,
  translationBelowSource: translationRect.top >= sourceRect.bottom,
  sourceRect: {top: sourceRect.top, bottom: sourceRect.bottom},
  translationRect: {top: translationRect.top, bottom: translationRect.bottom}
};
result.testPassed = result.translationTransform === 'none' &&
  result.translationTextTransform === 'none' && result.translationBelowSource;
report.textContent = JSON.stringify(result, null, 2);
