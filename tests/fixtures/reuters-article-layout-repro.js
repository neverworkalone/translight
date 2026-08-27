import {PageSession} from '../../src/content/page-session.js';

const report = document.querySelector('#report');
const source = document.querySelector('#source');
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'cleanup';
const expectedTexts = [
  'In January, Meta CEO Mark Zuckerberg and his top lieutenants gathered for their annual leadership retreat at his Hawaii compound.',
  'They hatched a radical plan to reimagine work at the social-media giant in the age of artificial intelligence.'
];

function layout(node) {
  const rect = node?.getBoundingClientRect?.();
  return rect ? {
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width)
  } : null;
}

function measure() {
  const translation = source.nextElementSibling;
  return {
    sourceLayout: layout(source),
    translationLayout: layout(translation),
    translationCount: document.querySelectorAll('translight-translation').length
  };
}

function callsAreValid(calls) {
  return calls.length === expectedTexts.length &&
    calls.every((text) => expectedTexts.includes(text));
}

function layoutsAreAligned({sourceLayout, translationLayout}) {
  return translationLayout?.left === sourceLayout?.left &&
    translationLayout?.right === sourceLayout?.right &&
    translationLayout?.width === sourceLayout?.width;
}

async function run() {
  const calls = [];
  const session = new PageSession({
    generation: 8101,
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

  const initial = measure();
  const result = {
    fixture: 'reuters-article-layout-repro',
    scenario,
    sourceUrl: 'https://www.reuters.com/investigations/mark-zuckerberg-had-bold-plan-replace-meta-staff-with-ai-heres-how-it-imploded-2026-08-26/',
    providerCalls: calls,
    ...initial,
    resizeSamples: [],
    testPassed: callsAreValid(calls) && layoutsAreAligned(initial)
  };
  report.textContent = JSON.stringify(result, null, 2);

  if (scenario === 'resize') {
    let resizeMeasurementTimer = null;
    const handleResize = () => {
      if (resizeMeasurementTimer != null) clearTimeout(resizeMeasurementTimer);
      resizeMeasurementTimer = setTimeout(() => {
        resizeMeasurementTimer = null;
        const sample = measure();
        result.providerCalls = [...calls];
        result.resizeSamples.push(sample);
        result.latest = sample;
        result.testPassed = callsAreValid(calls) &&
          result.translationCount === initial.translationCount &&
          layoutsAreAligned(initial) &&
          result.resizeSamples.every(layoutsAreAligned);
        report.textContent = JSON.stringify(result, null, 2);
      }, 0);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('pagehide', () => {
      if (resizeMeasurementTimer != null) clearTimeout(resizeMeasurementTimer);
      window.removeEventListener('resize', handleResize);
      session.stop({notify: false});
    }, {once: true});
    return;
  }

  session.stop({notify: false});
  result.restoredAfterStop = document.querySelector('translight-translation') === null &&
    source.textContent.trim() === expectedTexts[0];
  result.testPassed = result.testPassed && result.restoredAfterStop;
  report.textContent = JSON.stringify(result, null, 2);
}

run().catch((error) => {
  report.textContent = JSON.stringify({error: error.message, stack: error.stack}, null, 2);
});
