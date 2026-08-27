import { collectTranslationBlocks, SEGMENT_SELECTOR } from './block-collector.js';
import { TranslationQueue } from './translation-queue.js';
import { ChromeTranslateProvider } from '../translation/chrome-provider.js';
import { MODEL_STATE } from '../translation/model-state.js';
import { isTranslationCancelled, TranslationCancelledError } from '../translation/provider.js';
import { TranslationRenderer } from './translation-renderer.js';
import { createDefaultSettings, normalizeSettings } from '../settings.js';
import { isTranslatableTitle } from './language.js';

const DEFAULT_CONCURRENCY = 3;
const MUTATION_DEBOUNCE_MS = 100;
const RECOVERY_STABILIZATION_MS = 350;
const MAX_MUTATION_ROOTS = 64;
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div,section,td,th';
const CANDIDATE_SELECTOR = `${BLOCK_SELECTOR},${SEGMENT_SELECTOR}`;
const GENERATED_NODE_SELECTOR = '[data-translight-generated="true"]';
const ROUTE_SETTLE_DELAYS = Object.freeze([100, 500]);
let sessionSequence = 0;

function errorPayload(error) {
  return {
    errorCode: error?.code ?? 'TRANSLATION_FAILED',
    errorMessage: error?.message ?? 'The page could not be translated.'
  };
}

function getView(document) {
  return document?.defaultView ?? globalThis.window;
}

function getClosestBlock(node) {
  if (!node) return null;
  if (node.nodeType === 1 && node.matches?.(CANDIDATE_SELECTOR)) return node;
  return node.parentElement?.closest?.(CANDIDATE_SELECTOR) ?? null;
}

export class PageSession {
  constructor({
    generation,
    document = globalThis.document,
    sendStatus,
    provider,
    concurrency = DEFAULT_CONCURRENCY,
    activation = null,
    settings,
    translationCache = new Map(),
    isGenerationCurrent = () => true,
    observe = true,
    onDomMutation = () => false,
    initialRouteGeneration = 0
  }) {
    this.generation = generation;
    this.document = document;
    this.sendStatus = sendStatus ?? (() => {});
    this.concurrency = concurrency;
    this.activation = activation;
    this.settings = normalizeSettings(settings ?? createDefaultSettings());
    this.usesDefaultProvider = provider == null;
    this.provider = provider ?? new ChromeTranslateProvider({
      targetLanguage: this.settings.targetLanguage
    });
    // Sessions created by older embedders did not pass the new title toggle.
    // Keep that API backwards-compatible while extension-created sessions use
    // the explicit setting from storage.
    this.legacyTranslatePageTitle = settings == null;
    this.translationCache = translationCache;
    this.isGenerationCurrent = isGenerationCurrent;
    this.observe = observe;
    this.onDomMutation = onDomMutation;
    this.sessionId = `session-${generation}-${Date.now()}-${++sessionSequence}`;
    this.renderer = null;
    this.queue = null;
    this.observer = null;
    this.titleObserver = null;
    this.mutationTimer = null;
    this.recoveryTimer = null;
    this.pendingMutationRoots = new Set();
    this.pendingRecoveryElements = new Set();
    this.mutationOverflow = false;
    this.scrollHandler = null;
    this.resizeHandler = null;
    this.priorityTimer = null;
    this.routeGeneration = Number.isInteger(initialRouteGeneration) ? initialRouteGeneration : 0;
    this.routeDecisionPending = false;
    this.routeMutationSeen = false;
    this.routeSettleTimers = new Set();
    this.routeDecisionWaiters = [];
    this.originalTitle = null;
    this.translatedTitle = null;
    this.titleRequest = 0;
    this.updatingTitle = false;
    this.providerReady = false;
    this.running = false;
    this.watchOnly = false;
    this.status = null;
    this.segmentWrappers = new Set();
    this.runPromise = null;
    this.translatedCount = 0;
    this.failedCount = 0;
    this.firstError = null;
  }

  isCurrent() {
    return this.running && !this.controller?.signal.aborted && this.isGenerationCurrent(this.generation);
  }

  isNavigationWatching() {
    return this.running;
  }

  notify(status, payload = {}) {
    this.status = status;
    this.sendStatus({
      status,
      generation: this.generation,
      origin: this.document.location?.origin,
      ...payload
    });
  }

  collectBlocks(root = this.document.body, options = {}) {
    const blocks = collectTranslationBlocks(root, {
      ...options,
      isActiveSource: options.isActiveSource ?? ((element) => this.renderer?.hasRecord?.(element) ?? false)
    });
    for (const block of blocks) {
      if (block.element?.matches?.(SEGMENT_SELECTOR)) this.segmentWrappers.add(block.element);
    }
    return blocks;
  }

  cleanupSegmentWrappers() {
    for (const segment of this.segmentWrappers) {
      if (!segment?.matches?.(SEGMENT_SELECTOR) || !segment.parentNode) continue;
      const parent = segment.parentNode;
      while (segment.firstChild) parent.insertBefore(segment.firstChild, segment);
      segment.remove();
    }
    this.segmentWrappers.clear();
  }

  start() {
    this.stop({notify: false});
    this.controller = new AbortController();
    this.running = true;
    this.runPromise = this.run();
    return this.runPromise;
  }

  stop({notify = true} = {}) {
    const wasRunning = this.running;
    this.running = false;
    this.watchOnly = false;
    this.routeDecisionPending = false;
    this.routeMutationSeen = false;
    this.clearRouteSettleTimers();
    this.resolveRouteDecisionWaiters();
    this.controller?.abort();
    this.queue?.cancel();
    this.queue = null;
    this.disconnectObservers();
    this.provider.cancel?.();
    this.providerReady = false;
    this.renderer?.removeAll();
    this.cleanupSegmentWrappers();
    this.renderer = null;
    this.provider.close?.();
    this.restoreTitle();
    if (notify && wasRunning) this.notify('OFF');
  }

  async run() {
    const signal = this.controller.signal;
    try {
      const startupRouteGeneration = this.routeGeneration;
      const initialBlocks = this.collectBlocks(this.document.body, {
        targetLanguage: this.settings.targetLanguage,
        splitSegments: false
      });
      const shouldTranslateTitle = this.settings.translatePageTitle || this.legacyTranslatePageTitle;
      const hasTranslatableTitle = shouldTranslateTitle &&
        isTranslatableTitle(this.document, this.settings.targetLanguage);
      if (!initialBlocks.length && !hasTranslatableTitle) {
        this.watchOnly = true;
        this.installObservers();
        this.notify('SKIPPED', {reason: 'TARGET_LANGUAGE'});
        return;
      }

      this.notify('CHECKING');
      const modelState = await this.provider.getModelState();
      if (!this.isCurrent()) throw new TranslationCancelledError();
      this.notify('CHECKING', {modelState});

      if (modelState === MODEL_STATE.UNAVAILABLE) {
        const error = new Error('Chrome Translator is unavailable in this environment.');
        error.code = 'UNAVAILABLE';
        error.openOptions = true;
        throw error;
      }

      this.renderer = new TranslationRenderer({
        document: this.document,
        sessionId: this.sessionId,
        settings: this.settings
      });
      await this.provider.prepare({
        signal,
        onStateChange: ({state, progress}) => {
          if (!this.isCurrent()) return;
          if (state === MODEL_STATE.DOWNLOADING) {
            this.notify('DOWNLOADING', {modelState: state, progress});
          }
        }
      });
      if (!this.isCurrent()) throw new TranslationCancelledError();
      this.providerReady = true;

      const blocks = this.collectBlocks(this.document.body, {
        targetLanguage: this.settings.targetLanguage,
        onExcluded: (element) => this.renderer?.remove(element)
      });
      this.installObservers();
      // A route may have been discovered while the model was preparing. Do
      // not collect or enqueue the old route until the background policy has
      // approved continuation.
      await this.waitForRouteDecision(signal);
      if (!this.isCurrent()) throw new TranslationCancelledError();
      await this.translateCurrentRoute(
        signal,
        shouldTranslateTitle,
        startupRouteGeneration === this.routeGeneration && !this.routeDecisionPending ? blocks : null
      );
    } catch (error) {
      if (!this.isCurrent() || isTranslationCancelled(error)) {
        this.cleanupSegmentWrappers();
        return;
      }
      this.renderer?.removeAll();
      this.cleanupSegmentWrappers();
      this.renderer = null;
      this.disconnectObservers();
      this.running = false;
      this.providerReady = false;
      this.routeDecisionPending = false;
      this.clearRouteSettleTimers();
      this.resolveRouteDecisionWaiters();
      this.provider.close?.();
      this.restoreTitle();
      this.notify('ERROR', {...errorPayload(error), openOptions: Boolean(error?.openOptions)});
    }
  }

  async translateCurrentRoute(signal, shouldTranslateTitle, initialBlocks = null) {
    let blocks = initialBlocks;
    while (this.isCurrent()) {
      await this.waitForRouteDecision(signal);
      if (!this.isCurrent()) throw new TranslationCancelledError();
      const routeGeneration = this.routeGeneration;
      if (!blocks || routeGeneration !== this.routeGeneration) {
        this.renderer?.pruneMissingTranslations?.();
        this.renderer?.pruneDisconnected?.();
        this.renderer?.restoreChangedSources?.();
        blocks = this.collectBlocks(this.document.body, {
          targetLanguage: this.settings.targetLanguage,
          onExcluded: (element) => this.renderer?.remove(element)
        });
      }
      if (!this.queue) this.createQueue(signal);
      this.notify('TRANSLATING', {count: blocks.length});
      // Translate the title before the document queue so a long page cannot
      // leave the browser tab showing the original title for a long time.
      if (shouldTranslateTitle) {
        await this.translateTitle(signal, routeGeneration);
      }
      if (!this.isCurrent()) throw new TranslationCancelledError();
      if (this.routeDecisionPending || routeGeneration !== this.routeGeneration) {
        blocks = null;
        continue;
      }
      const queue = this.queue;
      await queue.enqueueAll(this.tagBlocks(blocks, routeGeneration));
      if (!this.isCurrent()) throw new TranslationCancelledError();
      if (this.routeDecisionPending || routeGeneration !== this.routeGeneration) {
        blocks = null;
        continue;
      }
      if (this.translatedCount === 0 && this.firstError) throw this.firstError;

      this.notify('ACTIVE', {
        count: this.translatedCount + this.failedCount,
        translatedCount: this.translatedCount,
        failedCount: this.failedCount
      });
      return;
    }
    throw new TranslationCancelledError();
  }

  createQueue(signal) {
    this.translatedCount = 0;
    this.failedCount = 0;
    this.firstError = null;
    this.queue = new TranslationQueue({
      translate: (text, options) => this.provider.translate(text, options),
      concurrency: this.concurrency,
      cache: this.translationCache,
      document: this.document,
      getViewport: () => getView(this.document),
      cacheKey: (text) => `${this.provider?.pair ?? 'default'}\u0000${text}`,
      signal,
      isCurrent: () => this.isCurrent(),
      onResult: (block, translatedText) => {
        if (!this.isCurrent() || this.routeDecisionPending ||
            block?.routeGeneration !== this.routeGeneration ||
            !block?.element?.isConnected ||
            !this.renderer?.isSourceHashCurrent?.(block)) return;
        const translation = this.renderer?.insert({...block, translatedText});
        if (translation) {
          this.segmentWrappers.delete(block.element);
          this.translatedCount += 1;
        }
      },
      onError: (error, block) => {
        if (!this.isCurrent() || this.routeDecisionPending ||
            block?.routeGeneration !== this.routeGeneration) return;
        this.firstError ??= error;
        this.failedCount += 1;
      }
    });
  }

  async translateBlocks(blocks, signal) {
    if (!this.queue) this.createQueue(signal ?? this.controller?.signal);
    const routeGeneration = this.routeGeneration;
    await this.queue.enqueueAll(this.tagBlocks(blocks, routeGeneration));
    if (this.translatedCount === 0 && this.firstError) throw this.firstError;
    return {
      translatedCount: this.translatedCount,
      failedCount: this.failedCount
    };
  }

  tagBlocks(blocks, routeGeneration = this.routeGeneration) {
    return Array.from(blocks ?? [], (block) => ({...block, routeGeneration}));
  }

  async enqueueBlocks(blocks, routeGeneration = this.routeGeneration) {
    if (!this.isCurrent() || this.routeDecisionPending ||
        routeGeneration !== this.routeGeneration || !blocks.length) return;
    if (!this.queue) this.createQueue(this.controller?.signal);
    this.notify('TRANSLATING', {count: blocks.length});
    await this.queue.enqueueAll(this.tagBlocks(blocks, routeGeneration));
    if (!this.isCurrent() || this.routeDecisionPending || routeGeneration !== this.routeGeneration) return;
    this.notify('ACTIVE', {
      count: this.translatedCount + this.failedCount,
      translatedCount: this.translatedCount,
      failedCount: this.failedCount
    });
  }

  installObservers() {
    if (!this.observe) return;
    const view = getView(this.document);
    const MutationObserverClass = view?.MutationObserver ?? globalThis.MutationObserver;
    const observationRoot = this.document.documentElement ?? this.document;
    if (typeof MutationObserverClass === 'function' && observationRoot) {
      this.observer = new MutationObserverClass((records) => this.handleMutations(records));
      this.observer.observe(observationRoot, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'lang']
      });
    }

    this.scrollHandler = () => {
      if (this.priorityTimer != null) return;
      this.priorityTimer = setTimeout(() => {
        this.priorityTimer = null;
        this.queue?.reprioritize();
      }, 50);
    };
    this.resizeHandler = () => {
      this.renderer?.syncLayouts?.();
      this.scrollHandler?.();
    };
    view?.addEventListener?.('scroll', this.scrollHandler, {passive: true});
    view?.addEventListener?.('resize', this.resizeHandler, {passive: true});

    this.installTitleObserver();
  }

  installTitleObserver() {
    if (!this.observe || this.titleObserver ||
        !(this.settings.translatePageTitle || this.legacyTranslatePageTitle)) return;
    const view = getView(this.document);
    const MutationObserverClass = view?.MutationObserver ?? globalThis.MutationObserver;
    const titleRoot = this.document.head ?? this.document.documentElement;
    if (!titleRoot || typeof MutationObserverClass !== 'function') return;
    this.titleObserver = new MutationObserverClass(() => {
      if (this.updatingTitle) return;
      const routeChanged = this.onDomMutation?.();
      if (routeChanged || this.routeDecisionPending) {
        if (this.routeDecisionPending) this.routeMutationSeen = true;
        return;
      }
      if (this.watchOnly) {
        if (isTranslatableTitle(this.document, this.settings.targetLanguage)) void this.start();
        return;
      }
      void this.translateTitle(this.controller.signal, this.routeGeneration);
    });
    // Observe the head rather than only the initial <title> node. SPA sites
    // commonly replace the node itself when updating their document title.
    this.titleObserver.observe(titleRoot, {childList: true, characterData: true, subtree: true});
  }

  disconnectObservers() {
    this.observer?.disconnect();
    this.titleObserver?.disconnect();
    this.observer = null;
    this.titleObserver = null;
    if (this.mutationTimer != null) clearTimeout(this.mutationTimer);
    this.mutationTimer = null;
    if (this.recoveryTimer != null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    if (this.priorityTimer != null) clearTimeout(this.priorityTimer);
    this.priorityTimer = null;
    this.pendingMutationRoots.clear();
    this.pendingRecoveryElements.clear();
    this.mutationOverflow = false;
    const view = getView(this.document);
    if (this.scrollHandler) {
      view?.removeEventListener?.('scroll', this.scrollHandler);
    }
    if (this.resizeHandler) {
      view?.removeEventListener?.('resize', this.resizeHandler);
    }
    this.scrollHandler = null;
    this.resizeHandler = null;
  }

  scheduleTranslationRecovery() {
    if (!this.isCurrent() || this.routeDecisionPending || !this.renderer) return;
    const missing = this.renderer.getMissingTranslations?.({
      targetLanguage: this.settings.targetLanguage
    }) ?? [];
    for (const element of missing) this.pendingRecoveryElements.add(element);
    if (!this.pendingRecoveryElements.size) return;
    if (this.recoveryTimer != null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      const elements = [...this.pendingRecoveryElements];
      this.pendingRecoveryElements.clear();
      this.recoverMissingTranslations(elements);
    }, RECOVERY_STABILIZATION_MS);
  }

  recoverMissingTranslations(elements) {
    if (!this.isCurrent() || this.routeDecisionPending || !this.renderer || !elements?.length) return;
    const result = this.renderer.restoreMissingTranslations?.({
      elements,
      targetLanguage: this.settings.targetLanguage
    }) ?? {restored: [], invalid: []};
    const roots = new Set();
    for (const element of result.invalid ?? []) {
      const root = element?.parentElement;
      if (root) roots.add(root);
      this.renderer.remove?.(element);
    }
    if (!roots.size) return;

    const blocks = [];
    const seen = new Set();
    for (const root of roots) {
      for (const block of this.collectBlocks(root, {
        targetLanguage: this.settings.targetLanguage,
        onExcluded: (element) => this.renderer?.remove(element)
      })) {
        if (seen.has(block.element)) continue;
        seen.add(block.element);
        blocks.push(block);
      }
    }
    if (blocks.length) void this.enqueueBlocks(blocks);
  }

  handleMutations(records) {
    if (!this.isCurrent()) return;
    const routeChanged = this.onDomMutation?.();
    if (routeChanged || this.routeDecisionPending) {
      if (this.routeDecisionPending) this.routeMutationSeen = true;
      this.pendingMutationRoots.clear();
      this.mutationOverflow = false;
      if (this.mutationTimer != null) clearTimeout(this.mutationTimer);
      this.mutationTimer = null;
      if (this.recoveryTimer != null) clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
      this.pendingRecoveryElements.clear();
      return;
    }
    const addMutationRoot = (root) => {
      if (!root || this.pendingMutationRoots.has(root)) return;
      if (this.pendingMutationRoots.size >= MAX_MUTATION_ROOTS) {
        this.mutationOverflow = true;
        return;
      }
      this.pendingMutationRoots.add(root);
    };
    for (const record of records) {
      const mutationTarget = record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
      if (mutationTarget?.closest?.('[data-translight-generated="true"]')) continue;
      if (record.type === 'childList') {
        const hasRelevantAddedNodes = Array.from(record.addedNodes ?? [])
          .some((node) => !node.matches?.(GENERATED_NODE_SELECTOR));
        const hasRelevantRemovedNodes = Array.from(record.removedNodes ?? [])
          .some((node) => !node.matches?.(GENERATED_NODE_SELECTOR));
        if (!hasRelevantAddedNodes && !hasRelevantRemovedNodes) continue;
      }
      if (record.type === 'characterData') {
        const block = getClosestBlock(record.target);
        addMutationRoot(block);
        continue;
      }
      const changedBlock = getClosestBlock(record.target);
      addMutationRoot(changedBlock);
      for (const node of record.addedNodes ?? []) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(GENERATED_NODE_SELECTOR)) continue;
        addMutationRoot(node);
      }
    }
    this.scheduleTranslationRecovery();
    if (!this.pendingMutationRoots.size && !this.mutationOverflow) {
      this.renderer?.pruneDisconnected?.();
      return;
    }
    if (this.mutationTimer != null) clearTimeout(this.mutationTimer);
    this.mutationTimer = setTimeout(() => {
      this.mutationTimer = null;
      const roots = this.mutationOverflow
        ? [this.document.body ?? this.document.documentElement]
        : [...this.pendingMutationRoots];
      this.pendingMutationRoots.clear();
      this.mutationOverflow = false;
      // Replacement modes can leave translated segments in unchanged inline
      // nodes while a site updates one sibling. Restore changed records before
      // collecting text so the provider receives the real source text.
      this.renderer?.pruneDisconnected?.();
      this.renderer?.restoreChangedSources?.();
      const blocks = [];
      const seen = new Set();
      for (const root of roots) {
        if (!root?.isConnected) continue;
        for (const block of this.collectBlocks(root, {
          targetLanguage: this.settings.targetLanguage,
          onExcluded: (element) => this.renderer?.remove(element)
        })) {
          if (!block.element?.isConnected) continue;
          if (seen.has(block.element)) continue;
          seen.add(block.element);
          blocks.push(block);
        }
      }
      if (blocks.length) {
        if (this.watchOnly) {
          // Move out of watch-only before starting. Reddit can deliver many
          // mutation batches while the model is preparing; without this
          // transition every batch would cancel and restart the same session.
          this.watchOnly = false;
          void this.start();
        }
        else void this.enqueueBlocks(blocks);
      }
      this.renderer?.pruneDisconnected?.();
    }, MUTATION_DEBOUNCE_MS);
  }

  clearRouteSettleTimers() {
    for (const timer of this.routeSettleTimers) clearTimeout(timer);
    this.routeSettleTimers.clear();
  }

  resolveRouteDecisionWaiters() {
    for (const resolve of this.routeDecisionWaiters.splice(0)) resolve();
  }

  waitForRouteDecision(signal) {
    if (!this.routeDecisionPending || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener?.('abort', finish);
        resolve();
      };
      this.routeDecisionWaiters.push(finish);
      signal?.addEventListener?.('abort', finish, {once: true});
    });
  }

  beginRouteChange({routeGeneration} = {}) {
    if (!this.isCurrent() || !Number.isInteger(routeGeneration) ||
        routeGeneration <= this.routeGeneration) return false;
    this.routeGeneration = routeGeneration;
    this.routeDecisionPending = true;
    this.routeMutationSeen = false;
    this.clearRouteSettleTimers();
    if (this.mutationTimer != null) clearTimeout(this.mutationTimer);
    this.mutationTimer = null;
    if (this.recoveryTimer != null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.pendingMutationRoots.clear();
    this.pendingRecoveryElements.clear();
    this.mutationOverflow = false;
    this.queue?.cancel();
    this.queue = null;
    if (this.queue || this.providerReady) this.provider.cancel?.();
    this.restoreTitle();
    this.renderer?.resetRecoveryAttempts?.();
    this.renderer?.pruneMissingTranslations?.();
    this.renderer?.pruneDisconnected?.();
    return true;
  }

  applyRouteDecision({routeGeneration, continueTranslation} = {}) {
    if (!this.routeDecisionPending || routeGeneration !== this.routeGeneration) return false;
    this.routeDecisionPending = false;
    const hadMutation = this.routeMutationSeen;
    this.routeMutationSeen = false;
    this.resolveRouteDecisionWaiters();
    if (!continueTranslation) {
      this.stop({notify: false});
      return true;
    }
    this.scheduleRouteRescans(routeGeneration, hadMutation);
    return true;
  }

  scheduleRouteRescans(routeGeneration, includeImmediate = false) {
    this.clearRouteSettleTimers();
    const delays = includeImmediate ? [0, ...ROUTE_SETTLE_DELAYS] : ROUTE_SETTLE_DELAYS;
    for (const delay of delays) {
      const timer = setTimeout(() => {
        this.routeSettleTimers.delete(timer);
        this.rescanRoute(routeGeneration);
      }, delay);
      this.routeSettleTimers.add(timer);
    }
  }

  rescanRoute(routeGeneration) {
    if (!this.isCurrent() || this.routeDecisionPending || routeGeneration !== this.routeGeneration) return;
    this.renderer?.pruneMissingTranslations?.();
    this.renderer?.pruneDisconnected?.();
    this.renderer?.restoreChangedSources?.();
    const shouldTranslateTitle = this.settings.translatePageTitle || this.legacyTranslatePageTitle;
    const blocks = this.collectBlocks(this.document.body, {
      targetLanguage: this.settings.targetLanguage,
      onExcluded: (element) => this.renderer?.remove(element)
    });
    const hasTranslatableTitle = shouldTranslateTitle &&
      isTranslatableTitle(this.document, this.settings.targetLanguage);
    if (!blocks.length && !hasTranslatableTitle) return;
    if (this.watchOnly) {
      // The provider has not been prepared in watch-only mode. Starting here
      // promotes the session exactly once; subsequent route rescans reuse the
      // prepared provider and queue instead.
      this.watchOnly = false;
      void this.start();
      return;
    }
    if (!this.renderer || !this.providerReady) return;
    if (shouldTranslateTitle) {
      void this.translateTitle(this.controller.signal, routeGeneration);
    }
    if (blocks.length) void this.enqueueBlocks(blocks, routeGeneration);
  }

  async translateTitle(signal, expectedRouteGeneration = this.routeGeneration) {
    if (!this.isCurrent() ||
        this.routeDecisionPending ||
        expectedRouteGeneration !== this.routeGeneration ||
        (!(this.settings.translatePageTitle || this.legacyTranslatePageTitle)) ||
        !this.document.title?.trim()) return;
    const currentTitle = this.document.title;
    if (currentTitle === this.translatedTitle) return;
    if (!isTranslatableTitle(this.document, this.settings.targetLanguage)) {
      this.restoreTitle();
      return;
    }
    if (currentTitle !== this.translatedTitle) this.originalTitle = currentTitle;
    const request = ++this.titleRequest;
    try {
      const translated = String(await this.provider.translate(this.originalTitle, {signal}) ?? '').trim();
      if (!translated || !this.isCurrent() || this.routeDecisionPending ||
          expectedRouteGeneration !== this.routeGeneration || request !== this.titleRequest) return;
      this.updatingTitle = true;
      this.document.title = translated;
      this.translatedTitle = translated;
    } catch (error) {
      if (!isTranslationCancelled(error) && this.isCurrent() && !this.routeDecisionPending &&
          expectedRouteGeneration === this.routeGeneration && request === this.titleRequest) {
        this.firstError ??= error;
      }
    } finally {
      if (request === this.titleRequest) this.updatingTitle = false;
    }
  }

  restoreTitle() {
    this.titleRequest += 1;
    if (this.originalTitle == null) return;
    if (this.document.title === this.translatedTitle || this.translatedTitle == null) {
      this.updatingTitle = true;
      this.document.title = this.originalTitle;
      this.updatingTitle = false;
    }
    this.originalTitle = null;
    this.translatedTitle = null;
  }

  applySettings(settings) {
    const previousTargetLanguage = this.settings.targetLanguage;
    const wasTranslatingTitle = this.settings.translatePageTitle || this.legacyTranslatePageTitle;
    this.legacyTranslatePageTitle = false;
    this.settings = normalizeSettings({...this.settings, ...settings});

    if (this.usesDefaultProvider && previousTargetLanguage !== this.settings.targetLanguage) {
      const shouldRestart = this.running || Boolean(this.controller);
      this.stop({notify: false});
      this.provider = new ChromeTranslateProvider({targetLanguage: this.settings.targetLanguage});
      this.translationCache.clear();
      if (shouldRestart) this.start();
      return;
    }

    this.renderer?.updatePresentation(this.settings);
    const shouldTranslateTitle = this.settings.translatePageTitle;
    if (wasTranslatingTitle && !shouldTranslateTitle) {
      this.titleObserver?.disconnect();
      this.titleObserver = null;
      this.restoreTitle();
    }
    if (!wasTranslatingTitle && shouldTranslateTitle && this.isCurrent()) {
      this.installTitleObserver();
      // During startup the provider may not be prepared yet. The main run
      // translates the title after preparation; avoid recording a spurious
      // NOT_READY error from this settings update.
      if (this.renderer) void this.translateTitle(this.controller.signal);
      else if (this.watchOnly && isTranslatableTitle(this.document, this.settings.targetLanguage)) {
        void this.start();
      }
    }
  }
}
