import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const body = document.querySelector('#article-body');
const source = document.querySelector('#source');
const expectedTexts = [
  'An all-too-familiar scenario is when you are on a wired connection or even high-spec Wi-Fi with a 500Mbps+ speed.',
  'Yet in fast-paced tactical shooters, you suffer from intermittent micro-rubber banding and hit registration delays.'
];

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 7201,
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

  const translation = source.nextElementSibling;
  const sourceStyle = getComputedStyle(source);
  const translationStyle = translation ? getComputedStyle(translation) : null;
  const bodyTranslations = Array.from(body.querySelectorAll('translight-translation'));
  const result = {
    fixture: 'xda-translation-font-size-repro',
    sourceUrl: 'https://www.xda-developers.com/routers-channel-width-setting-sabotaging-gaming-fix-takes-seconds/',
    bodySelector: '#article-body .content-block-regular > p',
    providerCalls: calls,
    sourceFontSize: sourceStyle.fontSize,
    translationFontSize: translationStyle?.fontSize ?? null,
    sourceLineHeight: sourceStyle.lineHeight,
    translationLineHeight: translationStyle?.lineHeight ?? null,
    bodyTranslationCount: bodyTranslations.length,
    testPassed: calls.length === expectedTexts.length &&
      calls.every((text) => expectedTexts.includes(text)) &&
      bodyTranslations.length === expectedTexts.length &&
      translationStyle?.fontSize === sourceStyle.fontSize &&
      translationStyle?.lineHeight === sourceStyle.lineHeight
  };
  report.textContent = JSON.stringify(result, null, 2);
  session.stop({notify: false});
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
