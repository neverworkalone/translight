import {PageSession} from '../../src/content/page-session.js';
import {TRANSLATION_MODES} from '../../src/settings.js';

const report = document.querySelector('#report');
const scenario = document.querySelector('#scenario');

function renderReviews() {
  scenario.innerHTML = `
    <article class="ReviewCard" aria-label="Review by chai ♡">
      <h2>chai ♡</h2>
      <div class="ReviewText__content">
        <div class="TruncatedContent">
          <div class="TruncatedContent__text" data-testid="contentContainer">
            <span class="Formatted">It’s always a shock to finish a particularly good book and feel that something has shifted inside you. This is how I felt when I finished <i>A Gentleman in Moscow</i>.<br><br>The story begins when Count Alexander Ilyich Rostov is sentenced to life imprisonment in Moscow’s Metropol hotel.<br><br><blockquote><em>To what end, he wondered, had the Divine created the stars in heaven?</em></blockquote><br><br>I absolutely loved this book and the character work is extraordinary.</span>
          </div>
        </div>
      </div>
    </article>
    <article class="ReviewCard" aria-label="Review by Bill Gates">
      <h2>Bill Gates</h2>
      <div class="ReviewText__content">
        <div class="TruncatedContent">
          <div class="TruncatedContent__text" data-testid="contentContainer">
            <span class="Formatted">Melinda and I sometimes read the same book at the same time. It’s usually a lot of fun.<br><br>At one point, I got teary-eyed because one of the characters gets hurt.<br><br>That scene aside, <i>A Gentleman in Moscow</i> is a fun and clever look at Russian history.</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function isBefore(left, right) {
  return Boolean(left?.compareDocumentPosition(right) & 4);
}

function getSourceForTranslation(card, translation) {
  const sourceId = translation.getAttribute('data-translight-source-id');
  return Array.from(card.querySelectorAll('[data-translight-source-id]'))
    .find((candidate) => !candidate.matches('translight-translation') &&
      candidate.getAttribute('data-translight-source-id') === sourceId);
}

function inspectCard(card, mode) {
  const translations = Array.from(card.querySelectorAll('translight-translation'));
  const ordered = translations.every((translation) => {
    const source = getSourceForTranslation(card, translation);
    const sourceBeforeTranslation = isBefore(source, translation);
    const role = translation.getAttribute('data-translight-role');
    if (mode === TRANSLATION_MODES.ORIGINAL_TRANSLATION) {
      return role === 'translation' && sourceBeforeTranslation;
    }
    if (role === 'original') return sourceBeforeTranslation;
    return role === 'translation' && !sourceBeforeTranslation;
  });
  return {
    translationCount: translations.length,
    roles: translations.map((translation) => translation.getAttribute('data-translight-role')),
    ordered
  };
}

async function runScenario(mode) {
  renderReviews();
  const originalText = scenario.textContent;
  const session = new PageSession({
    generation: mode === TRANSLATION_MODES.ORIGINAL_TRANSLATION ? 9501 : 9502,
    document,
    settings: {translatePageTitle: false, translationMode: mode},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => `ko:${text}`,
      cancel: () => {},
      close: () => {}
    }
  });

  await session.start();
  const cards = Array.from(scenario.querySelectorAll('.ReviewCard'));
  const result = {
    mode,
    chai: inspectCard(cards[0], mode),
    billGates: inspectCard(cards[1], mode)
  };
  session.stop({notify: false});
  result.restoredAfterStop = scenario.textContent === originalText &&
    scenario.querySelector('translight-translation') === null;
  result.testPassed = result.chai.translationCount > 0 &&
    result.billGates.translationCount > 0 &&
    result.chai.ordered &&
    result.billGates.ordered &&
    result.restoredAfterStop;
  return result;
}

async function run() {
  const results = [];
  for (const mode of [TRANSLATION_MODES.ORIGINAL_TRANSLATION, TRANSLATION_MODES.TRANSLATION_ORIGINAL]) {
    results.push(await runScenario(mode));
  }
  report.textContent = JSON.stringify({
    fixture: 'goodreads-review-order-repro',
    sourceUrl: 'https://www.goodreads.com/book/show/34066798-a-gentleman-in-moscow',
    results,
    testPassed: results.every((result) => result.testPassed)
  }, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
