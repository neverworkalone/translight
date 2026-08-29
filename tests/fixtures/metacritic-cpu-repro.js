import {PageSession} from '../../src/content/page-session.js';

const CARD_COUNT = 94;
const BLOCKS_PER_CARD = 4;
const LAYER_COUNT = 6;
const BLOCK_TAGS = ['h3', 'p', 'li', 'h4'];
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th';
const report = document.querySelector('#report');
const root = document.querySelector('#metacritic-root');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createBlock(cardIndex, blockIndex) {
  const tagName = BLOCK_TAGS[blockIndex];
  let markup = `<${tagName}>Metacritic card ${cardIndex} ${tagName} content has enough English text to translate.</${tagName}>`;
  for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
    const className = layer === 0 ? 'card-layer card-leaf-host' : 'card-layer';
    markup = `<div class="${className}">${markup}</div>`;
  }
  return markup;
}

function buildMetacriticPage() {
  root.innerHTML = Array.from({length: CARD_COUNT}, (_, cardIndex) => `
    <div class="metacritic-card">
      <div class="card-frame">
        ${Array.from({length: BLOCKS_PER_CARD}, (_, blockIndex) => createBlock(cardIndex, blockIndex)).join('')}
      </div>
    </div>
  `).join('');
}

async function run() {
  buildMetacriticPage();
  const providerCalls = [];
  let mutationCallbacks = 0;
  let mutationRecords = 0;
  let recoverySchedules = 0;
  let browserHarnessRecoverySchedules = 0;
  const recoveryEvents = [];
  let currentMutationSummary = null;
  let currentMutationIsBrowserHarness = false;
  const session = new PageSession({
    generation: 9601,
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
  const originalHandleMutations = session.handleMutations.bind(session);
  session.handleMutations = (records) => {
    mutationCallbacks += 1;
    mutationRecords += records.length;
    currentMutationIsBrowserHarness = records.some((record) =>
      record.target === document.documentElement &&
      [...record.addedNodes ?? []].some((node) => node.id === 'codex-browser-sidebar-comments-root')
    );
    currentMutationSummary = records.map((record) => ({
      type: record.type,
      target: record.target?.nodeName,
      added: [...record.addedNodes ?? []].map((node) => ({
        name: node.nodeName,
        generated: node.matches?.('[data-translight-generated="true"]') ?? false
      })),
      removed: [...record.removedNodes ?? []].map((node) => ({
        name: node.nodeName,
        generated: node.matches?.('[data-translight-generated="true"]') ?? false
      }))
    }));
    return originalHandleMutations(records);
  };
  const originalScheduleRecovery = session.scheduleTranslationRecovery.bind(session);
  session.scheduleTranslationRecovery = (...args) => {
    if (currentMutationIsBrowserHarness) browserHarnessRecoverySchedules += 1;
    else recoverySchedules += 1;
    recoveryEvents.push(currentMutationSummary);
    return originalScheduleRecovery(...args);
  };

  const started = performance.now();
  await session.start();
  const startupMs = performance.now() - started;
  await wait(250);

  const candidateCount = root.querySelectorAll(BLOCK_SELECTOR).length;
  const translationCount = root.querySelectorAll('translight-translation').length;
  const result = {
    fixture: 'metacritic-cpu-repro',
    sourceUrl: 'https://www.metacritic.com/',
    candidateCount,
    providerCallCount: providerCalls.length,
    translationCount,
    startupMs: Math.round(startupMs * 100) / 100,
    mutationCallbacks,
    mutationRecords,
    recoverySchedules,
    browserHarnessRecoverySchedules,
    recoveryEvents,
    testPassed: candidateCount >= CARD_COUNT * BLOCKS_PER_CARD &&
      translationCount === CARD_COUNT * BLOCKS_PER_CARD &&
      recoverySchedules === 0
  };

  session.stop({notify: false});
  result.restoredAfterStop = root.querySelectorAll('translight-translation').length === 0 &&
    root.querySelectorAll('[data-translight-generated="true"]').length === 0;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
