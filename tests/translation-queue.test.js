import {describe, expect, it, vi} from 'vitest';
import {
  CACHE_RESULT_BATCH_SIZE,
  prioritizeBlocks,
  TranslationQueue
} from '../src/content/translation-queue.js';

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

  it('yields between bounded batches of warm-cache results', async () => {
    const blocks = Array.from({length: 256}, (_, index) =>
      block(`source-${index}`, `cached-${index}`, {
        top: 0,
        bottom: 20,
        left: 0,
        right: 100
      })
    );
    const cache = new Map(blocks.map(({text}) => [text, `ko:${text}`]));
    const results = [];
    const translate = vi.fn();
    const queue = new TranslationQueue({
      concurrency: 3,
      cache,
      translate,
      onResult: (_item, value, metadata) => results.push({value, metadata})
    });
    const firstTimer = new Promise((resolve) => setTimeout(() => resolve(results.length), 0));

    const idle = queue.enqueue(blocks);
    const processedBeforeTimer = await firstTimer;
    await idle;

    expect(processedBeforeTimer).toBeLessThanOrEqual(CACHE_RESULT_BATCH_SIZE);
    expect(results).toHaveLength(blocks.length);
    expect(results.every(({metadata}) => metadata.fromCache)).toBe(true);
    expect(translate).not.toHaveBeenCalled();
    queue.cancel();
  });

  it('cancels deferred warm-cache results before they reach the renderer', async () => {
    const blocks = Array.from({length: 64}, (_, index) =>
      block(`source-${index}`, `cached-${index}`, {
        top: 0,
        bottom: 20,
        left: 0,
        right: 100
      })
    );
    const cache = new Map(blocks.map(({text}) => [text, `ko:${text}`]));
    const results = [];
    const queue = new TranslationQueue({
      concurrency: 3,
      cache,
      onResult: (item) => results.push(item.sourceId)
    });
    setTimeout(() => queue.cancel(), 0);

    await queue.enqueue(blocks);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(results.length).toBeLessThanOrEqual(CACHE_RESULT_BATCH_SIZE);
    expect(queue.cacheResultYieldTimer).toBeNull();
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

  it('detaches its session abort listener when a route cancels the queue', () => {
    const listeners = new Set();
    const signal = {
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener)
    };
    const cache = new Map([['shared', 'cached']]);
    const queue = new TranslationQueue({signal, cache});

    expect(listeners).toHaveLength(1);
    queue.cancel();

    expect(listeners).toHaveLength(0);
    expect(cache).toEqual(new Map([['shared', 'cached']]));
  });

  it('pauses pending work without dropping it until the document is visible again', async () => {
    let resolveActive;
    const calls = [];
    const queue = new TranslationQueue({
      concurrency: 1,
      translate: (text) => {
        calls.push(text);
        if (text === 'active') return new Promise((resolve) => { resolveActive = resolve; });
        return Promise.resolve(`ko:${text}`);
      }
    });
    const idle = queue.enqueue([
      block('active', 'active', {top: 0, bottom: 20, left: 0, right: 100}),
      block('pending', 'pending', {top: 30, bottom: 50, left: 0, right: 100})
    ]);

    queue.pause();
    resolveActive('ko:active');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['active']);
    expect(queue.pending).toHaveLength(1);

    queue.resume();
    await idle;
    expect(calls).toEqual(['active', 'pending']);
    queue.cancel();
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
    const viewport = {innerHeight: 800, innerWidth: 1000, scrollY: 0};
    const documentRect = (top) => () => ({
      top: top - viewport.scrollY,
      bottom: top + 50 - viewport.scrollY,
      left: 0,
      right: 100
    });
    const far = block('far', 'far', {top: 2200, bottom: 2250, left: 0, right: 100});
    far.element.getBoundingClientRect = documentRect(2200);
    const visibleAfterScroll = block('after-scroll', 'after-scroll', {top: 2200, bottom: 2250, left: 0, right: 100});
    visibleAfterScroll.element.getBoundingClientRect = documentRect(2200);
    const stillFar = block('still-far', 'still-far', {top: 4400, bottom: 4450, left: 0, right: 100});
    stillFar.element.getBoundingClientRect = documentRect(4400);
    const results = [];
    const queue = new TranslationQueue({
      concurrency: 1,
      getViewport: () => viewport,
      translate: (text) => new Promise((resolve) => {
        if (text === 'far') resolveActive = resolve;
        else resolve(`ko:${text}`);
      }),
      onResult: (item) => results.push(item.sourceId)
    });

    queue.enqueue([far, visibleAfterScroll, stillFar]);
    await Promise.resolve();
    viewport.scrollY = 2100;
    queue.reprioritize();

    resolveActive('ko:far');
    await queue.whenIdle();
    expect(results.slice(0, 2)).toEqual(['far', 'after-scroll']);
  });

  it('does not rescan a long pending page for every scroll reprioritization', () => {
    let resolveActive;
    let rectCalls = 0;
    const results = [];
    const viewport = {innerHeight: 800, innerWidth: 1000, scrollY: 0};
    const rectState = new Map();
    const blocks = Array.from({length: 2050}, (_, index) => ({
      sourceId: `scroll-source-${index}`,
      text: `scroll-text-${index}`,
      element: {
        getBoundingClientRect: () => {
          rectCalls += 1;
          const rect = rectState.get(index);
          return {
            ...rect,
            top: rect.top - viewport.scrollY,
            bottom: rect.bottom - viewport.scrollY
          };
        }
      }
    }));
    for (let index = 0; index < blocks.length; index += 1) {
      rectState.set(index, {top: 3000 + index, bottom: 3020 + index, left: 0, right: 100});
    }
    const queue = new TranslationQueue({
      concurrency: 1,
      pendingLimit: 2048,
      getViewport: () => viewport,
      translate: (text) => text === 'scroll-text-0'
        ? new Promise((resolve) => { resolveActive = resolve; })
        : Promise.resolve(`ko:${text}`),
      onResult: (item) => results.push(item.sourceId)
    });

    queue.enqueue(blocks);
    const setupCalls = rectCalls;
    viewport.scrollY = 4947;
    for (let index = 0; index < 8; index += 1) queue.reprioritize();

    expect(rectCalls).toBe(setupCalls);
    resolveActive?.('ko:scroll-text-0');
    return queue.whenIdle().then(() => {
      expect(results.slice(0, 2)).toEqual(['scroll-source-0', 'scroll-source-2047']);
      expect(rectCalls).toBe(setupCalls);
      queue.cancel();
    });
  });
});
