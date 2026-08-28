import { PageSession } from '../../src/content/page-session.js';

const HOME_CARD_COUNT = 90;
const DETAIL_CARD_COUNT = 70;
const BLOCKS_PER_CARD = 4;
const LAYER_COUNT = 6;
const SCROLL_BURST_COUNT = 8;
const NAVIGATION_CYCLE_COUNT = 4;
const BLOCK_TAGS = ['h3', 'p', 'li', 'h4'];
const report = document.querySelector('#report');
const root = document.querySelector('#metacritic-root');
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
let rectCalls = 0;
let scrollEvents = 0;
let routeGeneration = 0;
let session;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeout = 15000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error('Timed out waiting for the fixture state.');
}

function sourceMarkup(tagName, text) {
  return `<${tagName} class="fixture-source" data-fixture-source="true">${text}</${tagName}>`;
}

function createBlock(route, cardIndex, blockIndex) {
  const tagName = BLOCK_TAGS[blockIndex];
  let markup = sourceMarkup(
    tagName,
    `${route} Metacritic card ${cardIndex} ${tagName} content has enough English text to translate.`
  );
  for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
    const className = layer === 0 ? 'card-layer card-leaf-host' : 'card-layer';
    markup = `<div class="${className}">${markup}</div>`;
  }
  return markup;
}

function createCards(route, count) {
  return Array.from({length: count}, (_, cardIndex) => `
    <div class="metacritic-card">
      <div class="card-frame">
        ${Array.from({length: BLOCKS_PER_CARD}, (_, blockIndex) =>
          createBlock(route, cardIndex, blockIndex)
        ).join('')}
      </div>
    </div>
  `).join('');
}

function renderHome() {
  root.innerHTML = `
    <section class="fixture-section" data-section="new-and-notable">
      ${sourceMarkup('h2', 'New and Notable')}
      <a id="notable-link" href="/game/star-wars-zero-company/">
        ${sourceMarkup('h3', 'Star Wars Zero Company')}
        ${sourceMarkup('p', 'A new strategy game featured in the New and Notable collection.')}
      </a>
    </section>
    <section class="fixture-section" data-section="catalog">
      ${createCards('Home', HOME_CARD_COUNT)}
    </section>
    <section id="latest-news" class="fixture-section" data-section="latest-news">
      ${sourceMarkup('h2', 'Latest News')}
      ${Array.from({length: 8}, (_, index) => sourceMarkup(
        'p',
        `Latest News item ${index + 1} contains enough English text to translate.`
      )).join('')}
    </section>
  `;
}

function renderDetail() {
  root.innerHTML = `
    <section class="fixture-section" data-section="detail">
      ${sourceMarkup('h2', 'Star Wars Zero Company')}
      ${sourceMarkup('p', 'The detail page contains a long review and score summary.')}
      ${createCards('Detail', DETAIL_CARD_COUNT)}
    </section>
  `;
}

function currentRecords() {
  return [...session?.renderer?.records?.values?.() ?? []]
    .filter((record) => record.element?.isConnected && root.contains(record.element));
}

function currentTranslationCount() {
  return currentRecords().filter((record) => record.translation?.isConnected).length;
}

async function waitForCurrentRouteReady() {
  await waitFor(() => currentRecords().length > 0);
}

async function waitForCurrentRouteComplete() {
  await waitFor(() => {
    const records = currentRecords();
    const sourceCount = root.querySelectorAll('[data-fixture-source="true"]').length;
    return records.length === sourceCount &&
      records.every((record) => record.translation?.isConnected);
  });
  await wait(120);
}

async function scrollBurst(top) {
  window.scrollTo({top, behavior: 'instant'});
  for (let index = 0; index < SCROLL_BURST_COUNT; index += 1) {
    scrollEvents += 1;
    window.dispatchEvent(new Event('scroll'));
    await wait(60);
  }
}

async function navigateRoute(route, {push = false} = {}) {
  routeGeneration += 1;
  if (push) {
    history.pushState({route}, '', `?fixture-route=${route}-${routeGeneration}`);
  }
  if (!session.beginRouteChange({routeGeneration})) {
    throw new Error(`Could not begin route ${routeGeneration}.`);
  }
  if (route === 'home') renderHome();
  else renderDetail();
  await wait(0);
  if (!session.applyRouteDecision({routeGeneration, continueTranslation: true})) {
    throw new Error(`Could not apply route ${routeGeneration}.`);
  }
  await waitForCurrentRouteReady();
}

function waitForHistoryNavigation(direction) {
  return new Promise((resolve, reject) => {
    const handlePopState = () => {
      window.removeEventListener('popstate', handlePopState);
      navigateRoute(history.state?.route ?? 'home')
        .then(resolve)
        .catch(reject);
    };
    window.addEventListener('popstate', handlePopState, {once: true});
    history[direction]();
  });
}

async function run() {
  Element.prototype.getBoundingClientRect = function (...args) {
    if (this.closest?.('#metacritic-root')) rectCalls += 1;
    return originalGetBoundingClientRect.apply(this, args);
  };
  history.replaceState({route: 'home'}, '', `${location.pathname}?fixture-route=home`);
  renderHome();

  const providerCalls = [];
  session = new PageSession({
    generation: 9603,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        await wait(8);
        providerCalls.push(text);
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });
  const startPromise = session.start();
  startPromise.catch((error) => {
    if (session?.isCurrent?.()) throw error;
  });

  await waitFor(() => session.renderer && session.queue);
  await wait(100);
  const initialRectCalls = rectCalls;

  const latestNews = document.querySelector('#latest-news');
  await scrollBurst(latestNews.offsetTop);
  await waitFor(() => latestNews.querySelectorAll('translight-translation').length >= 8);
  const latestNewsTranslated = latestNews.querySelectorAll('translight-translation').length;
  await scrollBurst(0);

  const notableLink = document.querySelector('#notable-link');
  let detailNavigation;
  notableLink.addEventListener('click', (event) => {
    event.preventDefault();
    detailNavigation = navigateRoute('detail', {push: true});
  }, {once: true});
  notableLink.click();
  await detailNavigation;
  await scrollBurst(document.documentElement.scrollHeight);
  await waitForCurrentRouteComplete();

  const routeSnapshots = [];
  for (let cycle = 1; cycle <= NAVIGATION_CYCLE_COUNT; cycle += 1) {
    await waitForHistoryNavigation('back');
    await scrollBurst(0);
    await waitForHistoryNavigation('forward');
    await scrollBurst(document.documentElement.scrollHeight);
    await waitForCurrentRouteComplete();
    routeSnapshots.push({
      cycle,
      route: history.state?.route,
      sourceCount: root.querySelectorAll('[data-fixture-source="true"]').length,
      recordCount: currentRecords().length,
      translationCount: currentTranslationCount()
    });
  }

  const interactionRectCalls = rectCalls - initialRectCalls;
  const result = {
    fixture: 'metacritic-scroll-navigation-repro',
    path: 'translate → scroll Latest News → wait → scroll top → click New and Notable → scroll bottom → back/forward cycles',
    latestNewsTranslated,
    scrollEvents,
    providerCallCount: providerCalls.length,
    interactionRectCalls,
    routeSnapshots,
    testPassed: latestNewsTranslated >= 8 && routeSnapshots.every((snapshot) =>
      snapshot.sourceCount === snapshot.recordCount &&
      snapshot.recordCount === snapshot.translationCount
    )
  };

  session.stop({notify: false});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  result.testPassed &&= result.restoredAfterStop;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
