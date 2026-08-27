import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const logo = document.querySelector('.site-logo');
const logoLink = document.querySelector('.site-logo a.logo.replace');
const caption = document.querySelector('figure.article-media figcaption');
const expectedCaption = 'Gromit from Wallace & Gromit: The Curse of the Were-Rabbit, Shadow from Homeward Bound: The Incredible Journey, Jack (Uggie) from The Artist.';
const expectedBody = 'In celebration of International Dog Day, we are counting off beloved movie dogs.';

function layout(node) {
  const rect = node?.getBoundingClientRect?.();
  return rect ? {
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  } : null;
}

function layoutsMatch(left, right) {
  return left?.left === right?.left &&
    left?.right === right?.right &&
    left?.width === right?.width &&
    left?.height === right?.height;
}

async function run() {
  const calls = [];
  const logoBefore = layout(logo);
  const captionBefore = layout(caption);
  const session = new PageSession({
    generation: 9601,
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
  const captionTranslation = translations.find((translation) =>
    translation.textContent === `ko:${expectedCaption}`
  );
  const logoTranslationCount = Array.from(logo?.parentElement?.children ?? [])
    .filter((element) => element.matches('translight-translation'))
    .length;
  const captionAfter = layout(caption);
  const result = {
    fixture: 'letterboxd-article-caption-repro',
    sourceUrl: 'https://letterboxd.com/journal/twenty-cinematic-canines-international-dog-day/',
    providerCalls: calls,
    translationCount: translations.length,
    captionTranslationCount: captionTranslation ? 1 : 0,
    logoTranslationCount,
    logoBefore,
    logoAfter: layout(logo),
    captionBefore,
    captionAfter,
    testPassed: calls.length === 2 && calls.includes(expectedCaption) && calls.includes(expectedBody) &&
      translations.length === 2 && captionTranslation && logoTranslationCount === 0 &&
      layoutsMatch(logoBefore, layout(logo)) && layoutsMatch(captionBefore, captionAfter)
  };

  session.stop({notify: false});
  result.restoredAfterStop = document.querySelector('translight-translation') === null &&
    logoLink?.textContent.trim() === 'Letterboxd — Your life in film' &&
    caption?.textContent.replace(/\u00a0/g, ' ').replace(/[\t\r\n\f ]+/g, ' ').trim() === expectedCaption;
  result.testPassed = result.testPassed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
