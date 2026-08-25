import {describe, expect, it} from 'vitest';
import {prioritizeBlocks, TranslationQueue} from '../src/content/translation-queue.js';

function block(sourceId, text, rect) {
  return {
    sourceId,
    text,
    element: {getBoundingClientRect: () => rect}
  };
}

describe('TranslationQueue', () => {
  it('places visible blocks before adjacent and distant blocks', () => {
    const blocks = [
      block('far', 'far', {top: 2200, bottom: 2250, left: 0, right: 100}),
      block('adjacent', 'adjacent', {top: 820, bottom: 870, left: 0, right: 100}),
      block('visible', 'visible', {top: 120, bottom: 170, left: 0, right: 100})
    ];
    expect(prioritizeBlocks(blocks, {viewport: {innerHeight: 800, innerWidth: 1000}})
      .map((item) => item.sourceId)).toEqual(['visible', 'adjacent', 'far']);
  });

  it('limits concurrency and reuses a page-memory text cache', async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const results = [];
    const queue = new TranslationQueue({
      concurrency: 2,
      viewport: {innerHeight: 800, innerWidth: 1000},
      translate: async (text) => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return `ko:${text}`;
      },
      onResult: (item, value) => results.push([item.sourceId, value])
    });

    await queue.enqueue([
      block('a', 'same', {top: 0, bottom: 20, left: 0, right: 100}),
      block('b', 'same', {top: 30, bottom: 50, left: 0, right: 100}),
      block('c', 'other', {top: 60, bottom: 80, left: 0, right: 100})
    ]);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(calls).toBe(2);
    expect(results).toHaveLength(3);
  });

  it('drops late results after cancellation', async () => {
    let resolveTranslation;
    const results = [];
    const queue = new TranslationQueue({
      translate: () => new Promise((resolve) => { resolveTranslation = resolve; }),
      onResult: (_item, value) => results.push(value)
    });
    const pending = queue.enqueue([block('a', 'pending', {top: 0, bottom: 20, left: 0, right: 100})]);
    queue.cancel();
    resolveTranslation('late');
    await pending;
    expect(results).toEqual([]);
  });
});
