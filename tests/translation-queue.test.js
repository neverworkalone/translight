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

  it('does not permanently lose blocks beyond the pending limit', async () => {
    let resolveActive;
    const rectState = new Map();
    const blocks = Array.from({length: 2050}, (_, index) => {
      rectState.set(index, {top: 3000 + index, bottom: 3020 + index, left: 0, right: 100});
      return {
        sourceId: `source-${index}`,
        text: `text-${index}`,
        element: {
          getBoundingClientRect: () => rectState.get(index)
        }
      };
    });
    const queue = new TranslationQueue({
      concurrency: 1,
      pendingLimit: 2,
      viewport: {innerHeight: 800, innerWidth: 1000},
      translate: (text) => new Promise((resolve) => {
        if (text === 'text-0') resolveActive = resolve;
        else resolve(`ko:${text}`);
      })
    });

    queue.enqueue(blocks);
    await Promise.resolve();
    expect(queue.pending).toHaveLength(1);

    rectState.set(2049, {top: 100, bottom: 120, left: 0, right: 100});
    queue.enqueue([blocks[2049]]);
    expect(queue.pending.some((item) => item.sourceId === 'source-2049')).toBe(true);

    resolveActive('ko:text-0');
    await queue.whenIdle();
    queue.cancel();
  });

  it('drains a long document in bounded batches', async () => {
    const results = [];
    const blocks = Array.from({length: 2050}, (_, index) =>
      block(`source-${index}`, `long-${index}`, {top: 3000 + index, bottom: 3020 + index, left: 0, right: 100})
    );
    const queue = new TranslationQueue({
      concurrency: 3,
      pendingLimit: 64,
      translate: async (text) => `ko:${text}`,
      onResult: (item) => results.push(item.sourceId)
    });

    await queue.enqueueAll(blocks);
    expect(results).toHaveLength(2050);
  });

  it('re-evaluates pending priority when the viewport changes', async () => {
    let resolveActive;
    let viewport = {innerHeight: 800, innerWidth: 1000};
    const far = block('far', 'far', {top: 2200, bottom: 2250, left: 0, right: 100});
    const visibleAfterScroll = block('after-scroll', 'after-scroll', {top: 2200, bottom: 2250, left: 0, right: 100});
    const queue = new TranslationQueue({
      concurrency: 1,
      getViewport: () => viewport,
      translate: (text) => new Promise((resolve) => {
        if (text === 'far') resolveActive = resolve;
        else resolve(`ko:${text}`);
      })
    });

    queue.enqueue([far, visibleAfterScroll]);
    await Promise.resolve();
    visibleAfterScroll.element.getBoundingClientRect = () => ({top: 100, bottom: 120, left: 0, right: 100});
    viewport = {innerHeight: 800, innerWidth: 1000};
    queue.reprioritize();
    expect(queue.pending[0].sourceId).toBe('after-scroll');

    resolveActive('ko:far');
    await queue.whenIdle();
  });
});
