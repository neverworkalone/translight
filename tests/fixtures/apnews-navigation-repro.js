import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const navigation = document.querySelector('.MainNavigation');
const title = document.querySelector('.article h1');
const paragraph = document.querySelector('.article p');
const expectedTexts = [title.textContent.trim(), paragraph.textContent.trim()];

function navigationSnapshot() {
  return {
    text: navigation?.textContent.replace(/[\t\r\n ]+/g, ' ').trim(),
    labels: Array.from(navigation?.querySelectorAll('.MainNavigationItem-text') ?? [])
      .map((element) => element.textContent.replace(/[\t\r\n ]+/g, ' ').trim()),
    translationCount: navigation?.querySelectorAll('translight-translation').length ?? 0
  };
}

async function run() {
  const calls = [];
  const beforeNavigation = navigationSnapshot();
  const session = new PageSession({
    generation: 9701,
    document,
    settings: {translatePageTitle: false},
    provider: {
      getModelState: async () => 'Available',
      prepare: async () => {},
      translate: async (text) => {
        calls.push(text);
        return `ko:${text}`;
      },
      cancel: () => {},
      close: () => {}
    }
  });

  await session.start();

  const translations = Array.from(document.querySelectorAll('translight-translation'));
  const result = {
    fixture: 'apnews-navigation-repro',
    sourceUrl: 'https://apnews.com/article/fact-check-canada-electricity-us-shut-off-636b50e96b27883be959f29c0f086d79',
    providerCalls: calls,
    navigationBefore: beforeNavigation,
    navigationAfter: navigationSnapshot(),
    translationCount: translations.length,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      translations.length === expectedTexts.length &&
      navigationSnapshot().text === beforeNavigation.text &&
      navigationSnapshot().labels.join('|') === beforeNavigation.labels.join('|') &&
      navigationSnapshot().translationCount === 0
  };

  session.stop({notify: false});
  result.restoredAfterStop = document.querySelector('translight-translation') === null &&
    title.textContent.trim() === expectedTexts[0] &&
    paragraph.textContent.trim() === expectedTexts[1] &&
    navigationSnapshot().text === beforeNavigation.text;
  result.testPassed = result.testPassed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
