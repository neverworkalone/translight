import {PageSession} from '../../src/content/page-session.js';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'rerender';
const duration = Number(params.get('duration') ?? 3000);
const startScroll = Number(params.get('top') ?? 600);
const hostInterval = Number(params.get('hostInterval') ?? 220);
const hostRenderLimit = Number(params.get('hostRenders') ?? 6);
const report = document.querySelector('#report');
const awardContent = document.querySelector('#award-content');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function awardMarkup() {
  return '<ul id="award-inline-list"><li id="award-source"><span>1 win &amp; 3 nominations total</span></li></ul>';
}

function rect(element) {
  if (!element) return null;
  const value = element.getBoundingClientRect();
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.round(value.width),
    height: Math.round(value.height)
  };
}

function snapshot() {
  const card = document.querySelector('#award-card');
  const translation = Array.from(document.querySelectorAll('translight-translation'))
    .find((node) => node.previousElementSibling === card) ??
    card?.querySelector('translight-translation');
  return {
    time: Math.round(performance.now()),
    scrollY: Math.round(window.scrollY),
    card: rect(card),
    translation: rect(translation),
    translationParent: translation?.parentElement?.id ?? translation?.parentElement?.tagName ?? null,
    translationInCard: Boolean(translation && card?.contains(translation)),
    generated: document.querySelectorAll('translight-translation').length,
    scrollHeight: document.documentElement.scrollHeight
  };
}

function jitterMetrics(samples) {
  const heights = samples.map((sample) => sample.card?.height).filter((height) => height != null);
  const distinctHeights = [...new Set(heights)];
  const cardY = samples.map((sample) => sample.card?.y).filter((value) => value != null);
  const yDeltas = cardY.slice(1).map((value, index) => value - cardY[index]);
  return {
    minHeight: heights.length ? Math.min(...heights) : null,
    maxHeight: heights.length ? Math.max(...heights) : null,
    distinctHeights,
    largestCardYStep: yDeltas.length ? Math.max(...yDeltas.map((value) => Math.abs(value))) : 0,
    jitterDetected: heights.length > 1 && Math.max(...heights) - Math.min(...heights) >= 20
  };
}

async function run() {
  const calls = [];
  const hostEvents = [];
  const session = new PageSession({
    generation: 9201,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        calls.push(text);
        await wait(12);
        return `총 1개의 우승 및 3개의 후보 지명`;
      },
      cancel: () => {},
      close: () => {}
    }
  });
  const samples = [];
  const sampler = setInterval(() => samples.push(snapshot()), 16);
  window.scrollTo({top: Number.isFinite(startScroll) ? Math.max(0, startScroll) : 600, behavior: 'instant'});
  session.start();

  let hostTimer = null;
  if (scenario === 'rerender') {
    hostTimer = setInterval(() => {
      awardContent.innerHTML = awardMarkup();
      hostEvents.push({type: 'rerender', time: Math.round(performance.now())});
      if (hostEvents.length >= hostRenderLimit) clearInterval(hostTimer);
    }, Math.max(120, hostInterval));
  }

  await wait(Number.isFinite(duration) ? Math.max(0, duration) : 3000);
  clearInterval(sampler);
  if (hostTimer) clearInterval(hostTimer);
  const final = snapshot();
  const metrics = jitterMetrics(samples);
  const stablePlacement = final.translationParent === 'award-list' && !final.translationInCard;
  const result = {
    fixture: 'imdb-left-jitter-repro',
    sourceUrl: 'https://www.imdb.com/name/nm0005370/',
    scenario,
    hostRenders: hostEvents.length,
    providerCalls: calls,
    final,
    cardHeight: metrics,
    stablePlacement,
    rootOverflowAnchor: getComputedStyle(document.documentElement).overflowAnchor,
    testPassed: !metrics.jitterDetected && stablePlacement
  };
  report.textContent = JSON.stringify(result, null, 2);
  session.stop({notify: false});
}

run().catch((error) => { report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2); });
