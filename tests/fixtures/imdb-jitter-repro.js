import {PageSession} from '../../src/content/page-session.js';

const WAIT_AFTER_START = 3200;
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'recovery';
const startScroll = Number(params.get('top') ?? 2500);
const hostChurnEnabled = scenario !== 'control';
if (scenario === 'no-anchor') document.documentElement.style.overflowAnchor = 'none';
const baseTexts = [
  'Hayden Panettiere was born in New York and began acting at a young age.',
  'Awards include wins and nominations across television and film.',
  'Photos show the actor in several notable roles and appearances.',
  'Known for Heroes, Remember the Titans, Scream 4, and other productions.',
  'Credits include acting, producing, and music department work.',
  'Additional information is progressively rendered by the page.',
  'The biography section contains more details about the performer.',
  'Related lists and editorial recommendations appear in the sidebar.',
  'The page continues loading cards and metadata while the user scrolls.',
  'This block represents another dynamically managed IMDb section.'
];
const texts = scenario === 'stress'
  ? Array.from({length: 30}, (_, index) => `${baseTexts[index % baseTexts.length]} IMDb stress block ${index + 1}.`)
  : baseTexts;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const app = document.querySelector('#app');
app.classList.toggle('stress', scenario === 'stress');
const report = document.querySelector('#report');
const calls = [];
const hostRemovalCounts = new WeakMap();
const pendingHostRemovals = new WeakSet();
const hostEvents = [];
let hostRemovals = 0;
const scrollSamples = [];
let activeOverflowAnchor = null;

function render(values) {
  app.innerHTML = values.map((text, index) =>
    `<p data-host-managed="true" data-index="${index}">${text}</p>`
  ).join('');
}

function translationHeight(node) {
  if (scenario !== 'stress') return;
  // Keep the generated node's normal content flow but make the browser's
  // scroll-anchor response observable when a host removes and restores a
  // cluster of translations above the viewport.
  node.style.setProperty('max-width', '30ch', 'important');
}

function getSourceForTranslation(node) {
  const previous = node.previousElementSibling;
  return previous?.matches?.('[data-host-managed="true"]') ? previous : null;
}

function collectResult() {
  const values = scrollSamples.map(({y}) => y);
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const directionChanges = deltas.slice(1).filter((delta, index) =>
    Math.sign(delta) !== 0 && Math.sign(deltas[index]) !== 0 && Math.sign(delta) !== Math.sign(deltas[index])
  ).length;
  const scroll = {
    initial: values[0] ?? null,
    final: values.at(-1) ?? null,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    largestStep: deltas.length ? Math.max(...deltas.map((delta) => Math.abs(delta))) : 0,
    directionChanges
  };
  return {
    hostRemovals,
    hostEvents: hostEvents.slice(0, 80),
    providerCalls: calls,
    generatedTranslations: document.querySelectorAll('translight-translation').length,
    activeOverflowAnchor,
    scroll,
    jitterDetected: scroll.directionChanges > 0 || scroll.largestStep >= 100,
    expectedJitterDetected: scenario === 'legacy',
    testPassed: (scroll.directionChanges > 0 || scroll.largestStep >= 100) === (scenario === 'legacy')
  };
}

render(texts);
const initialScroll = Number.isFinite(startScroll) ? Math.max(0, startScroll) : 2500;
window.scrollTo({top: initialScroll, left: 0, behavior: 'instant'});

const hostObserver = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes ?? []) {
      if (node.nodeType !== 1 || !node.matches('translight-translation')) continue;
      const source = getSourceForTranslation(node);
      if (!source) continue;
      if (pendingHostRemovals.has(node)) continue;
      const attempts = hostRemovalCounts.get(source) ?? 0;
      if (attempts >= 2) continue;
      pendingHostRemovals.add(node);
      hostRemovalCounts.set(source, attempts + 1);
      translationHeight(node);
      hostEvents.push({
        type: 'host-scheduled-removal',
        time: Math.round(performance.now()),
        scrollY: window.scrollY,
        index: source.getAttribute('data-index')
      });
      // A React commit does not necessarily remove the extension node in the
      // same mutation microtask in which it was inserted. Leave it in the
      // document for a few frames so Chromium's scroll anchoring observes the
      // insertion before the host removes it.
      setTimeout(() => {
        pendingHostRemovals.delete(node);
        if (!node.isConnected) return;
        hostRemovals += 1;
        hostEvents.push({
          type: 'host-removal',
          time: Math.round(performance.now()),
          scrollY: window.scrollY,
          index: source.getAttribute('data-index')
        });
        node.remove();
      }, 60);
    }
  }
});
if (hostChurnEnabled) hostObserver.observe(app, {childList: true, subtree: true});

const session = new PageSession({
  generation: 9001,
  document,
  settings: {translatePageTitle: false},
  provider: {
    getModelState: async () => 'Available',
    prepare: async () => {},
    translate: async (text) => {
      calls.push(text);
      await delay(35);
      return `ko:${text}`;
    },
    cancel: () => {},
    close: () => {}
  }
});

const sampler = setInterval(() => scrollSamples.push({time: performance.now(), y: window.scrollY}), 16);
await session.start();
if (scenario === 'legacy') document.documentElement.removeAttribute('data-translight-scroll-anchor');
activeOverflowAnchor = getComputedStyle(document.documentElement).overflowAnchor;
await delay(WAIT_AFTER_START);

clearInterval(sampler);
hostObserver.disconnect();
report.textContent = JSON.stringify(collectResult(), null, 2);
session.stop({notify: false});
