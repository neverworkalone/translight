import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const sources = [
  ['trend-mass', 'Mass visa revocation', '대량 비자 취소'],
  ['trend-mail', 'Mail voting', '메일 투표'],
  ['trend-approval', 'Approval ratings', '지지율'],
  ['trend-garden', 'White House Rose Garden', '백악관 장미 정원'],
  ['live-source', 'LIVE', '라이브'],
  ['all-source', 'ALL', '모두'],
  ['breaking-source', 'BREAKING NEWS UPDATES', '속보 업데이트'],
  ['article-title', 'FACT FOCUS: Canada and the US power grid', '사실 초점: 캐나다와 미국의 전력망'],
  ['article-body', 'Experts explain why a change in electricity exports would not cause massive blackouts.', '전문가들은 전력 수출 변화가 대규모 정전을 일으키지 않는 이유를 설명합니다.']
];
const sourceById = new Map(sources.map(([id, original]) => [id, {element: document.querySelector(`#${id}`), original}]));
const expectedTexts = sources.map(([, original]) => original);
const translations = new Map(sources.map(([id, , translated]) => [sourceById.get(id)?.original, translated]));
const compactLayoutIds = new Set([
  'trend-mass', 'trend-mail', 'trend-approval', 'trend-garden',
  'live-source', 'all-source', 'breaking-source'
]);

function rect(element) {
  const value = element?.getBoundingClientRect();
  return value ? {
    x: Math.round(value.x * 100) / 100,
    y: Math.round(value.y * 100) / 100,
    width: Math.round(value.width * 100) / 100,
    height: Math.round(value.height * 100) / 100
  } : null;
}

function snapshot() {
  return Object.fromEntries(sourceById.entries().map(([id, {element}]) => [id, rect(element)]));
}

function sameSize(first, second) {
  return first?.width === second?.width && first?.height === second?.height;
}

async function run() {
  const calls = [];
  const before = snapshot();
  const session = new PageSession({
    generation: 9702,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        calls.push(text);
        return translations.get(text) ?? `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });

  await session.start();

  const generated = Array.from(document.querySelectorAll('translight-translation'));
  const sourceReports = Object.fromEntries(sourceById.entries().map(([id, {element, original}]) => {
    const translation = generated.find((candidate) =>
      candidate.getAttribute('data-translight-source-id') === element.getAttribute('data-translight-source-id'));
    const translationRect = rect(translation);
    return [id, {
      originalTextUnchanged: element.textContent.trim() === original,
      translationParentIsSibling: translation?.parentElement === element.parentElement,
      sourceRectStable: sameSize(rect(element), before[id]),
      translationRect,
      notVertical: Boolean(translationRect && translationRect.width >= translationRect.height),
      translationWidthStyle: translation?.style.getPropertyValue('width') ?? ''
    }];
  }));
  const result = {
    fixture: 'apnews-live-layout-repro',
    sourceUrl: 'https://apnews.com/live/trump-iran-war-news-updates-08-27-2026',
    providerCalls: calls,
    translationCount: generated.length,
    sourceReports,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      generated.length === expectedTexts.length &&
      Object.entries(sourceReports).every(([id, source]) =>
        source.originalTextUnchanged && source.translationParentIsSibling &&
        source.sourceRectStable && source.notVertical &&
        (!compactLayoutIds.has(id) || !source.translationWidthStyle)
      )
  };

  session.stop({notify: false});
  result.restoredAfterStop = generated.every((translation) => !translation.isConnected) &&
    Array.from(sourceById.values()).every(({element, original}) => element.textContent.trim() === original);
  result.testPassed = result.testPassed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
