import {PageSession} from '../../src/content/page-session.js';

const params = new URLSearchParams(location.search);
const report = document.querySelector('#report');
const body = document.querySelector('#postingbody');
const expectedBodyTexts = [
  'Are you a player looking to join a long established team in Korea? Inspired by the world cup to start playing again? Come join Seohyeon Celtic as we rebuild.',
  'We have been running since 2011 and are looking for new players for our upcoming league season. Games are played on Saturdays around Seoul, and we will be having friendly / tryout games before the season starts in September. All positions, all ages, all nationalities welcome.',
  'Get in touch with your Kakao ID or phone number, or send us a message on Instagram (Search Seohyeon Celtic)'
];

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 6101,
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

  const bodyTranslations = Array.from(body.querySelectorAll('translight-translation'));
  const bodyCalls = calls.filter((text) => expectedBodyTexts.includes(text));
  const bodyTranslationTexts = bodyTranslations.map((translation) =>
    translation.textContent.replace(/^ko:/, '')
  );
  const result = {
    fixture: 'craigslist-body-translation-repro',
    sourceUrl: 'https://www.craigslist.org/view/d/play-organised-soccer-fooball-in-seoul/hfuqhkJcBAZYkn7k6SwE55',
    bodySelector: '#postingbody',
    providerCalls: calls,
    bodyCalls,
    sourceSegmentCount: body.querySelectorAll('[data-translight-segment="true"]').length,
    bodyTranslationTexts,
    translationsInsideBody: bodyTranslations.every((translation) => translation.parentElement === body),
    rootOverflowAnchor: getComputedStyle(document.documentElement).overflowAnchor,
    testPassed: bodyCalls.length === expectedBodyTexts.length &&
      bodyTranslations.length === expectedBodyTexts.length &&
      bodyTranslationTexts.every((text) => expectedBodyTexts.includes(text)) &&
      bodyTranslations.every((translation) => translation.parentElement === body)
  };
  report.textContent = JSON.stringify(result, null, 2);
  session.stop({notify: false});
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
