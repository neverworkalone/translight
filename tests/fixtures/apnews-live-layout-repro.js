import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const sources = [
  ['trend-mass', 'Mass visa revocation', '대량 비자 취소'],
  ['trend-mail', 'Mail voting', '메일 투표'],
  ['trend-approval', 'Approval ratings', '승인 등급'],
  ['trend-garden', 'White House Rose Garden', '백악관 장미 정원'],
  ['live-source', 'LIVE', '라이브'],
  ['all-source', 'ALL', '모든'],
  ['breaking-source', 'BREAKING NEWS UPDATES', '속보 업데이트'],
  ['article-title', 'Live updates: Regional powers seek off-ramp as Iran war drags on months longer than Trump promised', '라이브 업데이트: 이란 전쟁이 트럼프가 약속한 것보다 몇 달 더 길어짐에 따라 지역 강대국이 경사로를 추구합니다.'],
  ['article-subtitle', 'Follow the latest news on President Donald Trump and his administration | Aug. 27, 2026', '도널드 트럼프 대통령과 그의 행정부에 대한 최신 뉴스 팔로우 | 2026년 8월 27일'],
  ['article-caption', "Nepalese policemen watch as earthmovers clear the debris of flash flooding in Nepal's Nuwakot district, Thursday, Aug. 27, 2026. (AP Photo/Niranjan Shrestha)", '2026년 8월 27일 목요일, 네팔 누와코트 지역의 돌발 홍수 잔해를 치우는 굴착기를 지켜보는 네팔 경찰. (AP Photo/Niranjan Shrestha)'],
  ['article-body', 'The U.S. has rescued a handful of Americans in the wake of devastating flooding in Nepal, officials said Thursday morning.', '미국은 네팔의 파괴적인 홍수 이후 소수의 미국인을 구출했다고 관리들이 목요일 아침 밝혔습니다.']
];

const sourceById = new Map(sources.map(([id, original]) => [id, {
  element: document.querySelector(`#${id}`),
  original
}]));
const expectedTexts = sources.map(([, original]) => original);
const translations = new Map(sources.map(([id, , translated]) => [
  sourceById.get(id)?.original,
  translated
]));
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

function sameSize(first, second) {
  return first?.width === second?.width && first?.height === second?.height;
}

function isVertical(value) {
  return Boolean(value && value.height > value.width * 1.2);
}

function overlaps(first, second) {
  if (!first || !second) return false;
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

function translationDoesNotOverlapNextControl(id, translationRect) {
  const neighborIds = {
    'live-source': ['all-source', 'breaking-source'],
    'all-source': ['breaking-source'],
    'breaking-source': ['all-source']
  }[id] ?? [];
  return neighborIds.every((neighborId) => !overlaps(
    translationRect,
    rect(sourceById.get(neighborId)?.element)
  ));
}

function legacyProbe() {
  const selectors = [
    ['trending', '.legacy-panel .PagePromo-title'],
    ['live', '.legacy-panel .LiveBlogPage-liveButton'],
    ['all', '.legacy-panel .LiveBlogPage-tab:nth-child(1)'],
    ['breaking', '.legacy-panel .LiveBlogPage-tab:nth-child(2)']
  ];
  return Object.fromEntries(selectors.map(([id, selector]) => {
    const source = document.querySelector(selector);
    const translation = source?.querySelector('translight-translation');
    const translationRect = rect(translation);
    return [id, {
      sourceRect: rect(source),
      translationRect,
      translationIsInsideSource: translation?.parentElement === source,
      vertical: isVertical(translationRect)
    }];
  }));
}

function generatedTranslationFor(element) {
  return Array.from(document.querySelectorAll(
    'translight-translation:not([data-fixture-legacy])'
  )).find((candidate) =>
    candidate.getAttribute('data-translight-source-id') ===
      element.getAttribute('data-translight-source-id')
  );
}

function snapshot() {
  return Object.fromEntries(sourceById.entries().map(([id, {element}]) => [id, rect(element)]));
}

async function run() {
  const calls = [];
  const before = snapshot();
  const legacy = legacyProbe();
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

  const generated = Array.from(document.querySelectorAll(
    'translight-translation:not([data-fixture-legacy])'
  ));
  const sourceReports = Object.fromEntries(sourceById.entries().map(([id, {element, original}]) => {
    const translation = generatedTranslationFor(element);
    const record = session.renderer?.recordsByElement?.get(element);
    const translationRect = rect(translation);
    const currentSourceText = id === 'live-source'
      ? element.querySelector('.live-text')?.textContent.trim()
      : element.textContent.trim();
    const isGridWrapper = record?.placement?.kind === 'grid-layout-wrapper';
    const wrapper = isGridWrapper ? translation?.parentElement : null;
    return [id, {
      originalTextUnchanged: currentSourceText === original,
      translationParentIsSibling: translation?.parentElement === element.parentElement,
      placement: record?.placement?.kind ?? record?.placement ?? null,
      mixedContent: record?.mixedContent ?? null,
      placementIsSafe: isGridWrapper
        ? wrapper?.parentElement === element.parentElement &&
          wrapper?.previousElementSibling === element
        : translation?.parentElement === element.parentElement,
      beforeRect: before[id],
      sourceRect: rect(element),
      sourceRectStable: sameSize(rect(element), before[id]),
      translationRect,
      notVertical: Boolean(translationRect && !isVertical(translationRect)),
      translationDoesNotOverlapNextControl: translationDoesNotOverlapNextControl(id, translationRect),
      translationWidthStyle: translation?.style.getPropertyValue('width') ?? '',
      layoutStyles: id === 'live-source' ? {
        sourceLineHeight: getComputedStyle(element).lineHeight,
        translationLineHeight: translation ? getComputedStyle(translation).lineHeight : '',
        translationMargin: translation ? getComputedStyle(translation).margin : ''
      } : undefined
    }];
  }));
  const currentPassed = calls.length === expectedTexts.length &&
    calls.every((text) => expectedTexts.includes(text)) &&
    generated.length === expectedTexts.length &&
    Object.entries(sourceReports).every(([id, source]) =>
      source.originalTextUnchanged && source.placementIsSafe &&
      source.sourceRectStable && source.notVertical &&
      source.translationDoesNotOverlapNextControl &&
      (!compactLayoutIds.has(id) || !source.translationWidthStyle)
    );

  const result = {
    fixture: 'apnews-live-layout-repro',
    sourceUrl: 'https://apnews.com/live/trump-iran-war-news-updates-08-27-2026',
    attachedDom: [
      'Page-trendingZephr-wrapper', 'PageListTrending-contents',
      'PageList-items', 'PagePromoTrending', 'bsp-custom-headline',
      'PagePromo-title', 'LiveBlogPage-headline-sticky',
      'sticky-content[data-live]'
    ],
    legacyProbe: legacy,
    providerCalls: calls,
    translationCount: generated.length,
    sourceReports,
    testPassed: currentPassed && Object.values(legacy).some(({vertical}) => vertical)
  };

  session.stop({notify: false});
  result.ownedWrapperCountAfterStop = document.querySelectorAll('[data-translight-layout-wrapper]').length;
  result.restoredAfterStop = generated.every((translation) => !translation.isConnected) &&
    Array.from(sourceById.values()).every(({element, original}) =>
      element.textContent.trim() === original
    );
  result.testPassed = result.testPassed && result.restoredAfterStop &&
    result.ownedWrapperCountAfterStop === 0;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
