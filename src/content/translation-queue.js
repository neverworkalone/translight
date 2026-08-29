export const DEFAULT_QUEUE_CONCURRENCY = 3;
export const DEFAULT_CACHE_LIMIT = 256;
export const DEFAULT_PENDING_LIMIT = 2048;
export const DEFAULT_SEEN_LIMIT = 4096;
// Cache hits do not cross a provider promise, so bound their synchronous
// result-application work before yielding to the browser's next task.
export const CACHE_RESULT_BATCH_SIZE = 16;

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
export function getViewportPriority(
  block,
  index = 0,
  {document = globalThis.document, viewport, getRect} = {}
) {
  const {height, width} = viewportSize(document, viewport);
  const rect = typeof getRect === 'function'
    ? getRect(block)
    : rectFor(block);
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
  return `${block?.routeGeneration ?? 0}\u0000${block?.sourceId ?? ''}\u0000${block?.text ?? ''}`;
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
    getViewport,
    cacheKey = (text) => text,
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
    this.getViewport = getViewport ?? (() => this.viewport ?? this.document?.defaultView ?? globalThis.window);
    this.cacheKey = cacheKey;
    this.isCurrent = isCurrent;
    this.pending = [];
    this.active = 0;
    this.seen = new Set();
    this.seenOrder = [];
    this.inFlight = new Map();
    this.cancelled = false;
    this.idleResolvers = [];
    this.settledResolvers = [];
    this.batchChain = Promise.resolve();
    this.viewportVersion = 0;
    this.priorityDirty = true;
    this.priorityRectCache = new Map();
    this.paused = false;
    this.signal = signal;
    this.cacheResultBatchCount = 0;
    this.cacheResultYieldPromise = null;
    this.cacheResultYieldResolve = null;
    this.cacheResultYieldTimer = null;
    this.abortListener = () => this.cancel();
    if (signal?.addEventListener) {
      signal.addEventListener('abort', this.abortListener, {once: true});
      this.abortListenerAttached = true;
    } else {
      this.abortListenerAttached = false;
    }
  }

  isIdle() {
    return this.pending.length === 0 && this.active === 0;
  }

  whenIdle() {
    if (this.cancelled || this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  whenSettled() {
    // cancel() stops new work but cannot interrupt a provider promise that
    // is already running. Route changes use this separate barrier before
    // starting another queue against the same provider.
    if (this.active === 0) return Promise.resolve();
    return new Promise((resolve) => this.settledResolvers.push(resolve));
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

    this.pending.push(...candidates);
    this.priorityDirty = true;
    this.sortPending();
    if (this.pending.length > this.pendingLimit) {
      const dropped = this.pending.slice(this.pendingLimit);
      this.pending = this.pending.slice(0, this.pendingLimit);
      for (const block of dropped) this.forgetSeen(blockKey(block));
    }
    this.pump();
    return this.whenIdle();
  }

  run(blocks = []) {
    return this.enqueue(blocks);
  }

  enqueueAll(blocks = []) {
    const task = this.batchChain.then(async () => {
      let remaining = prioritizeBlocks(Array.from(blocks), this.currentPriorityOptions());
      let version = this.viewportVersion;
      const attempted = new Set();
      while (!this.cancelled && this.isCurrent() && remaining.length) {
        const candidates = remaining.filter((block) => !attempted.has(blockKey(block)));
        if (!candidates.length) break;
        if (version !== this.viewportVersion) {
          remaining = prioritizeBlocks(candidates, this.currentPriorityOptions());
          version = this.viewportVersion;
        }
        const ordered = remaining;
        const batch = ordered.slice(0, this.pendingLimit);
        for (const block of batch) attempted.add(blockKey(block));
        await this.enqueue(batch);
        remaining = ordered.slice(this.pendingLimit);
      }
    });
    this.batchChain = task.catch(() => {});
    return task;
  }

  currentPriorityOptions() {
    const viewport = this.getViewport?.();
    return {
      document: this.document,
      viewport,
      getRect: (block) => this.getCachedRect(block, viewport)
    };
  }

  getCachedRect(block, viewport) {
    // A scroll changes viewport-relative coordinates without changing the
    // document position. Reusing that snapshot avoids forcing layout for
    // every pending block while a user is scrolling. Callers invalidate it
    // when a DOM or viewport-size change can move the source.
    const {height, width} = viewportSize(this.document, viewport);
    const scrollX = numeric(viewport?.scrollX, numeric(viewport?.pageXOffset));
    const scrollY = numeric(viewport?.scrollY, numeric(viewport?.pageYOffset));
    const cached = this.priorityRectCache.get(block);
    if (cached && cached.viewportWidth === width && cached.viewportHeight === height) {
      return {
        top: cached.documentTop - scrollY,
        bottom: cached.documentBottom - scrollY,
        left: cached.documentLeft - scrollX,
        right: cached.documentRight - scrollX
      };
    }

    const rect = rectFor(block);
    if (!rect) {
      this.priorityRectCache.delete(block);
      return null;
    }
    this.priorityRectCache.set(block, {
      documentTop: rect.top + scrollY,
      documentBottom: rect.bottom + scrollY,
      documentLeft: rect.left + scrollX,
      documentRight: rect.right + scrollX,
      viewportWidth: width,
      viewportHeight: height
    });
    return rect;
  }

  invalidateLayout() {
    this.priorityRectCache.clear();
  }

  reprioritize() {
    if (this.cancelled) return;
    this.viewportVersion += 1;
    this.priorityDirty = true;
    // Scrolling only needs to update the viewport snapshot. The next pump
    // applies it when selecting work, avoiding a full pending-queue sort for
    // every scroll event while the provider is busy.
  }

  pause() {
    if (this.cancelled) return;
    this.paused = true;
  }

  resume() {
    if (this.cancelled || !this.paused) return;
    this.paused = false;
    this.pump();
  }

  sortPending() {
    if (!this.priorityDirty || this.pending.length < 2) {
      this.priorityDirty = false;
      return;
    }
    this.pending = prioritizeBlocks(this.pending, this.currentPriorityOptions());
    this.priorityDirty = false;
  }

  forgetSeen(key) {
    if (!this.seen.delete(key)) return;
    const index = this.seenOrder.indexOf(key);
    if (index !== -1) this.seenOrder.splice(index, 1);
  }

  cancel() {
    if (this.cancelled) {
      this.detachAbortListener();
      return;
    }
    this.cancelled = true;
    this.paused = false;
    this.detachAbortListener();
    this.pending.length = 0;
    this.seen.clear();
    this.seenOrder.length = 0;
    this.inFlight.clear();
    this.priorityRectCache.clear();
    this.cancelCacheResultYield();
    for (const resolve of this.idleResolvers.splice(0)) resolve();
    if (this.active === 0) {
      for (const resolve of this.settledResolvers.splice(0)) resolve();
    }
  }

  scheduleCacheResultYield() {
    if (this.cacheResultYieldPromise) return this.cacheResultYieldPromise;
    this.cacheResultYieldPromise = new Promise((resolve) => {
      this.cacheResultYieldResolve = resolve;
      this.cacheResultYieldTimer = setTimeout(() => {
        this.cacheResultYieldTimer = null;
        this.cacheResultYieldResolve = null;
        this.cacheResultYieldPromise = null;
        this.cacheResultBatchCount = 0;
        resolve();
      }, 0);
    });
    return this.cacheResultYieldPromise;
  }

  cancelCacheResultYield() {
    if (this.cacheResultYieldTimer != null) clearTimeout(this.cacheResultYieldTimer);
    const resolve = this.cacheResultYieldResolve;
    this.cacheResultYieldTimer = null;
    this.cacheResultYieldResolve = null;
    this.cacheResultYieldPromise = null;
    this.cacheResultBatchCount = 0;
    resolve?.();
  }

  async waitForCacheResultSlot() {
    if (this.cacheResultBatchCount < CACHE_RESULT_BATCH_SIZE) {
      this.cacheResultBatchCount += 1;
      return;
    }
    await this.scheduleCacheResultYield();
    if (!this.cancelled) this.cacheResultBatchCount += 1;
  }

  destroy() {
    this.cancel();
    this.batchChain = Promise.resolve();
  }

  detachAbortListener() {
    if (!this.abortListenerAttached) return;
    this.signal?.removeEventListener?.('abort', this.abortListener);
    this.abortListenerAttached = false;
  }

  pump() {
    while (!this.cancelled && !this.paused && this.isCurrent() &&
        this.active < this.concurrency && this.pending.length) {
      this.sortPending();
      const block = this.pending.shift();
      this.active += 1;
      void this.process(block).finally(() => {
        this.active -= 1;
        if (this.isIdle()) {
          for (const resolve of this.idleResolvers.splice(0)) resolve();
        }
        if (this.active === 0) {
          for (const resolve of this.settledResolvers.splice(0)) resolve();
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
    const cacheKey = this.cacheKey(text);

    try {
      if (this.cache.has(cacheKey)) {
        const cachedValue = this.cache.get(cacheKey);
        await this.waitForCacheResultSlot();
        if (this.isCurrent() && !this.cancelled && !this.signal?.aborted) {
          this.onResult(block, cachedValue, {fromCache: true});
        }
        return;
      }
      let translationPromise = this.inFlight.get(cacheKey);
      if (!translationPromise) {
        translationPromise = Promise.resolve(this.translate(text, {
          signal: this.signal,
          queue: this
        }));
        this.inFlight.set(cacheKey, translationPromise);
      }
      let translatedText;
      try {
        translatedText = await translationPromise;
      } finally {
        if (this.inFlight.get(cacheKey) === translationPromise) this.inFlight.delete(cacheKey);
      }
      if (this.cancelled || !this.isCurrent() || this.signal?.aborted) return;
      const normalized = String(translatedText ?? '').trim();
      if (!normalized) return;
      this.cache.set(cacheKey, normalized);
      trimCache(this.cache, this.cacheLimit);
      if (this.isCurrent() && !this.cancelled) this.onResult(block, normalized, {fromCache: false});
    } catch (error) {
      if (this.cancelled || !this.isCurrent() || error?.code === 'CANCELLED') return;
      this.forgetSeen(blockKey(block));
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
