import { TranslationCancelledError } from '../translation/provider.js';

export const DEFAULT_QUEUE_CONCURRENCY = 3;
export const DEFAULT_CACHE_LIMIT = 256;
export const DEFAULT_PENDING_LIMIT = 2048;
export const DEFAULT_SEEN_LIMIT = 4096;

function numeric(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function viewportSize(document, viewport) {
  const view = viewport ?? document?.defaultView ?? globalThis.window;
  const height = numeric(view?.innerHeight, numeric(document?.documentElement?.clientHeight, 0));
  const width = numeric(view?.innerWidth, numeric(document?.documentElement?.clientWidth, 0));
  return {height: Math.max(height, 1), width: Math.max(width, 1)};
}

function rectFor(block) {
  try {
    const rect = block?.element?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      top: numeric(rect.top),
      bottom: numeric(rect.bottom, numeric(rect.top)),
      left: numeric(rect.left),
      right: numeric(rect.right, numeric(rect.left))
    };
  } catch {
    return null;
  }
}

/**
 * Rank a block by how useful it is to translate now. Rank 0 is inside the
 * viewport, rank 1 is in the immediately adjacent viewport, and rank 2 is
 * everything else. The index keeps each rank stable in document order.
 */
export function getViewportPriority(block, index = 0, {document = globalThis.document, viewport} = {}) {
  const {height, width} = viewportSize(document, viewport);
  const rect = rectFor(block);
  if (!rect) return {rank: 2, distance: index, index};

  const visible = rect.bottom >= 0 && rect.top <= height && rect.right >= 0 && rect.left <= width;
  const adjacent = rect.bottom >= -height && rect.top <= height * 2 && rect.right >= -width && rect.left <= width * 2;
  if (visible) {
    const distance = Math.abs((rect.top + rect.bottom) / 2 - height / 2);
    return {rank: 0, distance, index};
  }
  if (adjacent) {
    const distance = rect.bottom < 0 ? Math.abs(rect.bottom) : Math.max(0, rect.top - height);
    return {rank: 1, distance, index};
  }
  return {rank: 2, distance: index, index};
}

export function prioritizeBlocks(blocks, options = {}) {
  return blocks
    .map((block, index) => ({
      block,
      priority: getViewportPriority(block, index, options)
    }))
    .sort((left, right) => {
      if (left.priority.rank !== right.priority.rank) return left.priority.rank - right.priority.rank;
      if (left.priority.distance !== right.priority.distance) return left.priority.distance - right.priority.distance;
      return left.priority.index - right.priority.index;
    })
    .map(({block}) => block);
}

function blockKey(block) {
  return `${block?.sourceId ?? ''}\u0000${block?.text ?? ''}`;
}

function trimCache(cache, limit) {
  while (cache.size > limit) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

/**
 * Small cooperative queue used by a PageSession. It does not create a
 * promise per document block until work starts, keeps a bounded text cache,
 * and checks both cancellation and session currency before every insertion.
 */
export class TranslationQueue {
  constructor({
    translate,
    onResult,
    onError,
    concurrency = DEFAULT_QUEUE_CONCURRENCY,
    cache = new Map(),
    cacheLimit = DEFAULT_CACHE_LIMIT,
    pendingLimit = DEFAULT_PENDING_LIMIT,
    seenLimit = DEFAULT_SEEN_LIMIT,
    document = globalThis.document,
    viewport,
    isCurrent = () => true,
    signal
  } = {}) {
    this.translate = translate ?? (async () => '');
    this.onResult = onResult ?? (() => {});
    this.onError = onError ?? (() => {});
    this.concurrency = Math.max(1, Math.floor(Number(concurrency) || DEFAULT_QUEUE_CONCURRENCY));
    this.cache = cache;
    this.cacheLimit = Math.max(1, Math.floor(Number(cacheLimit) || DEFAULT_CACHE_LIMIT));
    this.pendingLimit = Math.max(1, Math.floor(Number(pendingLimit) || DEFAULT_PENDING_LIMIT));
    this.seenLimit = Math.max(1, Math.floor(Number(seenLimit) || DEFAULT_SEEN_LIMIT));
    this.document = document;
    this.viewport = viewport;
    this.isCurrent = isCurrent;
    this.pending = [];
    this.active = 0;
    this.seen = new Set();
    this.seenOrder = [];
    this.inFlight = new Map();
    this.cancelled = false;
    this.idleResolvers = [];
    this.signal = signal;
    this.abortListener = () => this.cancel();
    signal?.addEventListener?.('abort', this.abortListener, {once: true});
  }

  isIdle() {
    return this.pending.length === 0 && this.active === 0;
  }

  whenIdle() {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  enqueue(blocks = []) {
    if (this.cancelled || !this.isCurrent()) return this.whenIdle();
    const candidates = [];
    for (const block of blocks) {
      if (!block?.element || !block.text) continue;
      const key = blockKey(block);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.seenOrder.push(key);
      while (this.seenOrder.length > this.seenLimit) {
        const oldest = this.seenOrder.shift();
        this.seen.delete(oldest);
      }
      candidates.push(block);
    }

    this.pending.push(...prioritizeBlocks(candidates, {
      document: this.document,
      viewport: this.viewport
    }));
    if (this.pending.length > this.pendingLimit) {
      this.pending = prioritizeBlocks(this.pending, {
        document: this.document,
        viewport: this.viewport
      }).slice(0, this.pendingLimit);
    }
    this.pump();
    return this.whenIdle();
  }

  run(blocks = []) {
    return this.enqueue(blocks);
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.pending.length = 0;
    for (const resolve of this.idleResolvers.splice(0)) resolve();
  }

  destroy() {
    this.cancel();
    this.signal?.removeEventListener?.('abort', this.abortListener);
    this.cache.clear();
    this.seen.clear();
    this.seenOrder.length = 0;
    this.inFlight.clear();
  }

  pump() {
    while (!this.cancelled && this.isCurrent() && this.active < this.concurrency && this.pending.length) {
      const block = this.pending.shift();
      this.active += 1;
      void this.process(block).finally(() => {
        this.active -= 1;
        if (this.isIdle()) {
          for (const resolve of this.idleResolvers.splice(0)) resolve();
        }
        this.pump();
      });
    }

    if (this.isIdle()) {
      for (const resolve of this.idleResolvers.splice(0)) resolve();
    }
  }

  async process(block) {
    if (this.cancelled || !this.isCurrent() || this.signal?.aborted) return;
    const text = String(block.text);
    if (this.cache.has(text)) {
      if (this.isCurrent() && !this.cancelled) {
        this.onResult(block, this.cache.get(text), {fromCache: true});
      }
      return;
    }

    try {
      let translationPromise = this.inFlight.get(text);
      if (!translationPromise) {
        translationPromise = Promise.resolve(this.translate(text, {signal: this.signal}));
        this.inFlight.set(text, translationPromise);
      }
      let translatedText;
      try {
        translatedText = await translationPromise;
      } finally {
        if (this.inFlight.get(text) === translationPromise) this.inFlight.delete(text);
      }
      if (this.cancelled || !this.isCurrent() || this.signal?.aborted) return;
      const normalized = String(translatedText ?? '').trim();
      if (!normalized) return;
      this.cache.set(text, normalized);
      trimCache(this.cache, this.cacheLimit);
      if (this.isCurrent() && !this.cancelled) this.onResult(block, normalized, {fromCache: false});
    } catch (error) {
      if (this.cancelled || !this.isCurrent() || error?.code === 'CANCELLED') return;
      this.seen.delete(blockKey(block));
      this.onError(error, block);
    }
  }
}

export function hashSourceText(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
