import {JSDOM} from 'jsdom';
import {
  hasVisibleBlockDescendant,
  isHidden
} from '../../src/content/block-collector.js';

const CANDIDATE_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th,[data-translight-segment="true"]';
const SEGMENT_SELECTOR = '[data-translight-segment="true"]';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const depth = positiveInteger(process.env.TRANSLIGHT_BENCHMARK_DEPTH, 40);
const segmentCount = positiveInteger(process.env.TRANSLIGHT_BENCHMARK_SEGMENTS, 100);
const iterations = positiveInteger(process.env.TRANSLIGHT_BENCHMARK_ITERATIONS, 20);
const {window} = new JSDOM('<!doctype html><html><body></body></html>');
const {document} = window;

function createWorkload() {
  const root = document.createElement('div');
  let current = root;
  for (let index = 0; index < depth; index += 1) {
    const level = document.createElement('translight-benchmark-level');
    current.appendChild(level);
    current = level;
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const segment = document.createElement('span');
    segment.setAttribute('data-translight-segment', 'true');
    segment.textContent = `Segment ${index}`;
    current.appendChild(segment);
  }
  document.body.appendChild(root);
  return root;
}

function measure(label, check) {
  const root = createWorkload();
  const originalGetComputedStyle = window.getComputedStyle;
  let styleCalls = 0;
  window.getComputedStyle = (...args) => {
    styleCalls += 1;
    return originalGetComputedStyle(...args);
  };

  let result;
  const startedAt = performance.now();
  try {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      result = check(root);
    }
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
    root.remove();
  }

  return {
    label,
    result,
    styleCalls,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2))
  };
}

const before = measure('before', (root) => Array.from(
  root.querySelectorAll(CANDIDATE_SELECTOR)
).filter((descendant) => !isHidden(descendant)).some(
  (descendant) => !descendant.matches(SEGMENT_SELECTOR)
));

const after = measure('after', (root) => hasVisibleBlockDescendant(
  root,
  undefined,
  (descendant) => !descendant.matches(SEGMENT_SELECTOR)
));

console.log(JSON.stringify({
  workload: {depth, segmentCount, iterations},
  before,
  after
}, null, 2));

if (before.result || after.result) process.exitCode = 1;
