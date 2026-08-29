import {PageSession} from '../../src/content/page-session.js';

const ROUTE_COUNT = 8;
const CARD_COUNT = 24;
const BLOCKS_PER_CARD = 4;
const LAYER_COUNT = 6;
const BLOCK_TAGS = ['h3', 'p', 'li', 'h4'];
const report = document.querySelector('#report');
const root = document.querySelector('#metacritic-root');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createBlock(route, cardIndex, blockIndex) {
  const tagName = BLOCK_TAGS[blockIndex];
  let markup = `<${tagName}>Route ${route} Metacritic card ${cardIndex} ${tagName} content has enough English text to translate.</${tagName}>`;
  for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
    const className = layer === 0 ? 'card-layer card-leaf-host' : 'card-layer';
    markup = `<div class="${className}">${markup}</div>`;
  }
  return markup;
}

function renderRoute(route) {
  root.innerHTML = Array.from({length: CARD_COUNT}, (_, cardIndex) => `
    <div class="metacritic-card">
      <div class="card-frame">
        ${Array.from({length: BLOCKS_PER_CARD}, (_, blockIndex) => createBlock(route, cardIndex, blockIndex)).join('')}
      </div>
    </div>
  `).join('');
}

async function run() {
  const providerCalls = [];
  let collectCalls = 0;
  renderRoute(0);

  const session = new PageSession({
    generation: 9602,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        providerCalls.push(text);
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });
  const originalCollectBlocks = session.collectBlocks.bind(session);
  session.collectBlocks = (...args) => {
    collectCalls += 1;
    return originalCollectBlocks(...args);
  };

  const started = performance.now();
  await session.start();
  await wait(250);
  const routeSnapshots = [];

  for (let route = 1; route <= ROUTE_COUNT; route += 1) {
    session.beginRouteChange({routeGeneration: route});
    renderRoute(route);
    await wait(0);
    session.applyRouteDecision({routeGeneration: route, continueTranslation: true});
    await wait(620);
    routeSnapshots.push({
      route,
      sourceCount: root.querySelectorAll('h3, h4, p, li').length,
      translationCount: root.querySelectorAll('translight-translation').length,
      generatedCount: root.querySelectorAll('[data-translight-generated="true"]').length
    });
  }

  const result = {
    fixture: 'metacritic-navigation-repro',
    routeCount: ROUTE_COUNT,
    sourceCount: CARD_COUNT * BLOCKS_PER_CARD,
    providerCallCount: providerCalls.length,
    collectCalls,
    startupMs: Math.round((performance.now() - started) * 100) / 100,
    routeSnapshots,
    testPassed: routeSnapshots.every((snapshot) =>
      snapshot.sourceCount === CARD_COUNT * BLOCKS_PER_CARD &&
      snapshot.translationCount === CARD_COUNT * BLOCKS_PER_CARD &&
      snapshot.generatedCount === CARD_COUNT * BLOCKS_PER_CARD
    ) && collectCalls <= 2 + ROUTE_COUNT * 2
  };

  session.stop({notify: false});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  result.testPassed &&= result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
