import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const description = document.querySelector('#description');
const comments = document.querySelector('#comments');
const initialTexts = [
  'The first description paragraph is visible on initial page load.',
  'The first comment is visible on initial page load.'
];
const mutationTexts = [
  'A new description paragraph was added after the initial collection.',
  'A new comment was added after the initial collection.'
];

function wait(milliseconds = 250) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendParagraph(parent, id, text) {
  const paragraph = document.createElement('p');
  paragraph.id = id;
  paragraph.textContent = text;
  parent.appendChild(paragraph);
}

function hasSameTexts(actual, expected) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.length === sortedExpected.length &&
    sortedActual.every((text, index) => text === sortedExpected[index]);
}

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 7501,
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
  await wait();
  const initialCalls = calls.slice();
  const initialTranslationCount = document.querySelectorAll('translight-translation').length;

  appendParagraph(description, 'description-2', mutationTexts[0]);
  const comment = document.createElement('ytd-comment-thread-renderer');
  comment.id = 'comment-2';
  comment.innerHTML = `
    <div class="comment-shell">
      <div class="author"><div class="handle">사용자2</div><span>방금 전</span></div>
      <p id="comment-text-2">${mutationTexts[1]}</p>
    </div>
  `;
  comments.appendChild(comment);
  await wait(450);
  const mutationCalls = calls.slice(initialCalls.length);
  const mutationTranslationCount = document.querySelectorAll('translight-translation').length;
  const result = {
    fixture: 'youtube-collector-mutation-repro',
    sourceUrl: 'https://www.youtube.com/watch?v=lzopkfaUcKs',
    initialCalls,
    mutationCalls,
    initialTranslationCount,
    mutationTranslationCount,
    testPassed: hasSameTexts(initialCalls, initialTexts) &&
      hasSameTexts(mutationCalls, mutationTexts) &&
      mutationTranslationCount === initialTexts.length + mutationTexts.length
  };

  session.stop({notify: false});
  result.restoredAfterStop = document.querySelectorAll('translight-translation').length === 0 &&
    document.querySelector('#description-1')?.textContent === initialTexts[0] &&
    document.querySelector('#description-2')?.textContent === mutationTexts[0] &&
    document.querySelector('#comment-text-1')?.textContent === initialTexts[1] &&
    document.querySelector('#comment-text-2')?.textContent === mutationTexts[1];
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
