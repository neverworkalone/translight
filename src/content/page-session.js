import { collectTranslationBlocks } from './block-collector.js';
import { TranslationQueue } from './translation-queue.js';
import { ChromeTranslateProvider } from '../translation/chrome-provider.js';
import { MODEL_STATE } from '../translation/model-state.js';
import { isTranslationCancelled, TranslationCancelledError } from '../translation/provider.js';
import { TranslationRenderer } from './translation-renderer.js';
import { createDefaultSettings, normalizeSettings } from '../settings.js';

const DEFAULT_CONCURRENCY = 3;
const MUTATION_DEBOUNCE_MS = 100;
const MAX_MUTATION_ROOTS = 64;
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,div';
const NAVIGATION_EVENT = 'translight:navigation';
const HISTORY_PATCH_KEY = '__translight_history_patch__';
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
  if (node.nodeType === 1 && node.matches?.(BLOCK_SELECTOR)) return node;
  return node.parentElement?.closest?.(BLOCK_SELECTOR) ?? null;
}

function isMeaningfulTitle(value) {
  return typeof value === 'string' && value.trim().length >= 2;
}

function installHistoryPatch(view) {
  if (!view?.history || view[HISTORY_PATCH_KEY]) return;
  const notify = () => view.dispatchEvent(new view.Event(NAVIGATION_EVENT));
  const originalPushState = view.history.pushState;
  const originalReplaceState = view.history.replaceState;
  view.history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    notify();
    return result;
  };
  view.history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    notify();
    return result;
  };
  view[HISTORY_PATCH_KEY] = {originalPushState, originalReplaceState};
}

export class PageSession {
  constructor({
    generation,
    document = globalThis.document,
    sendStatus,
    provider,
    concurrency = DEFAULT_CONCURRENCY,
    settings,
    translationCache = new Map(),
    isGenerationCurrent = () => true,
    observe = true
  }) {
    this.generation = generation;
    this.document = document;
    this.sendStatus = sendStatus ?? (() => {});
    this.provider = provider ?? new ChromeTranslateProvider();
    this.concurrency = concurrency;
    this.settings = normalizeSettings(settings ?? createDefaultSettings());
    // Sessions created by older embedders did not pass the new title toggle.
    // Keep that API backwards-compatible while extension-created sessions use
    // the explicit setting from storage.
    this.legacyTranslatePageTitle = settings == null;
    this.translationCache = translationCache;
    this.isGenerationCurrent = isGenerationCurrent;
    this.observe = observe;
    this.sessionId = `session-${generation}-${Date.now()}-${++sessionSequence}`;
    this.renderer = null;
    this.queue = null;
    this.observer = null;
    this.titleObserver = null;
    this.mutationTimer = null;
    this.pendingMutationRoots = new Set();
    this.navigationHandler = null;
    this.scrollHandler = null;
    this.priorityTimer = null;
    this.lastUrl = this.document?.location?.href ?? '';
    this.originalTitle = null;
    this.translatedTitle = null;
    this.titleRequest = 0;
    this.updatingTitle = false;
    this.running = false;
    this.runPromise = null;
    this.translatedCount = 0;
    this.failedCount = 0;
    this.firstError = null;
  }

  isCurrent() {
    return this.running && !this.controller?.signal.aborted && this.isGenerationCurrent(this.generation);
  }

  notify(status, payload = {}) {
    this.sendStatus({
      status,
      generation: this.generation,
      origin: this.document.location?.origin,
      ...payload
    });
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
    this.controller?.abort();
    this.queue?.cancel();
    this.queue = null;
    this.disconnectObservers();
    this.provider.cancel?.();
    this.renderer?.removeAll();
    this.renderer = null;
    this.provider.close?.();
    this.restoreTitle();
    if (notify && wasRunning) this.notify('OFF');
  }

  async run() {
    const signal = this.controller.signal;
    try {
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

      this.createQueue(signal);
      const blocks = collectTranslationBlocks(this.document.body);
      this.notify('TRANSLATING', {count: blocks.length});
      this.installObservers();
      // Translate the title before the document queue so a long page cannot
      // leave the browser tab showing the original title for a long time.
      if (this.settings.translatePageTitle || this.legacyTranslatePageTitle) {
        await this.translateTitle(signal);
      }
      if (!this.isCurrent()) throw new TranslationCancelledError();
      await this.queue.enqueueAll(blocks);
      if (!this.isCurrent()) throw new TranslationCancelledError();
      if (this.translatedCount === 0 && this.firstError) throw this.firstError;

      this.notify('ACTIVE', {
        count: this.translatedCount + this.failedCount,
        translatedCount: this.translatedCount,
        failedCount: this.failedCount
      });
    } catch (error) {
      if (!this.isCurrent() || isTranslationCancelled(error)) return;
      this.renderer?.removeAll();
      this.renderer = null;
      this.disconnectObservers();
      this.running = false;
      this.provider.close?.();
      this.restoreTitle();
      this.notify('ERROR', {...errorPayload(error), openOptions: Boolean(error?.openOptions)});
    }
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
        if (!this.isCurrent()) return;
        const translation = this.renderer?.insert({...block, translatedText});
        if (translation) this.translatedCount += 1;
      },
      onError: (error) => {
        if (!this.isCurrent()) return;
        this.firstError ??= error;
        this.failedCount += 1;
      }
    });
  }

  async translateBlocks(blocks, signal) {
    if (!this.queue) this.createQueue(signal ?? this.controller?.signal);
    await this.queue.enqueueAll(blocks);
    if (this.translatedCount === 0 && this.firstError) throw this.firstError;
    return {
      translatedCount: this.translatedCount,
      failedCount: this.failedCount
    };
  }

  async enqueueBlocks(blocks) {
    if (!this.isCurrent() || !this.queue || !blocks.length) return;
    this.notify('TRANSLATING', {count: blocks.length});
    await this.queue.enqueueAll(blocks);
  }

  installObservers() {
    if (!this.observe) return;
    const view = getView(this.document);
    const MutationObserverClass = view?.MutationObserver ?? globalThis.MutationObserver;
    if (typeof MutationObserverClass === 'function' && this.document.body) {
      this.observer = new MutationObserverClass((records) => this.handleMutations(records));
      this.observer.observe(this.document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    installHistoryPatch(view);
    this.navigationHandler = () => this.handleNavigation();
    view?.addEventListener?.(NAVIGATION_EVENT, this.navigationHandler);
    view?.addEventListener?.('popstate', this.navigationHandler);
    view?.addEventListener?.('hashchange', this.navigationHandler);
    this.scrollHandler = () => {
      if (this.priorityTimer != null) return;
      this.priorityTimer = setTimeout(() => {
        this.priorityTimer = null;
        this.queue?.reprioritize();
      }, 50);
    };
    view?.addEventListener?.('scroll', this.scrollHandler, {passive: true});
    view?.addEventListener?.('resize', this.scrollHandler, {passive: true});

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
      if (!this.updatingTitle) void this.translateTitle(this.controller.signal);
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
    if (this.priorityTimer != null) clearTimeout(this.priorityTimer);
    this.priorityTimer = null;
    this.pendingMutationRoots.clear();
    const view = getView(this.document);
    if (this.navigationHandler) {
      view?.removeEventListener?.(NAVIGATION_EVENT, this.navigationHandler);
      view?.removeEventListener?.('popstate', this.navigationHandler);
      view?.removeEventListener?.('hashchange', this.navigationHandler);
    }
    this.navigationHandler = null;
    if (this.scrollHandler) {
      view?.removeEventListener?.('scroll', this.scrollHandler);
      view?.removeEventListener?.('resize', this.scrollHandler);
    }
    this.scrollHandler = null;
  }

  handleMutations(records) {
    if (!this.isCurrent()) return;
    for (const record of records) {
      if (record.type === 'characterData') {
        const block = getClosestBlock(record.target);
        if (block && this.pendingMutationRoots.size < MAX_MUTATION_ROOTS) this.pendingMutationRoots.add(block);
        continue;
      }
      const changedBlock = getClosestBlock(record.target);
      if (changedBlock && this.pendingMutationRoots.size < MAX_MUTATION_ROOTS) {
        this.pendingMutationRoots.add(changedBlock);
      }
      for (const node of record.addedNodes ?? []) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('[data-translight-generated="true"],style')) continue;
        if (this.pendingMutationRoots.size < MAX_MUTATION_ROOTS) this.pendingMutationRoots.add(node);
      }
    }
    if (!this.pendingMutationRoots.size) {
      this.renderer?.pruneDisconnected?.();
      return;
    }
    if (this.mutationTimer != null) return;
    this.mutationTimer = setTimeout(() => {
      this.mutationTimer = null;
      const roots = [...this.pendingMutationRoots];
      this.pendingMutationRoots.clear();
      const blocks = [];
      const seen = new Set();
      for (const root of roots) {
        for (const block of collectTranslationBlocks(root)) {
          if (seen.has(block.element)) continue;
          seen.add(block.element);
          blocks.push(block);
        }
      }
      if (blocks.length) void this.enqueueBlocks(blocks);
      this.renderer?.pruneDisconnected?.();
    }, MUTATION_DEBOUNCE_MS);
  }

  async handleNavigation() {
    if (!this.isCurrent()) return;
    const currentUrl = this.document.location?.href ?? '';
    if (!currentUrl || currentUrl === this.lastUrl) return;
    this.lastUrl = currentUrl;
    this.renderer?.pruneDisconnected?.();
    if (this.settings.translatePageTitle || this.legacyTranslatePageTitle) {
      await this.translateTitle(this.controller.signal, {force: true});
    }
    const blocks = collectTranslationBlocks(this.document.body);
    await this.enqueueBlocks(blocks);
  }

  async translateTitle(signal, {force = false} = {}) {
    if (!this.isCurrent() ||
        (!(this.settings.translatePageTitle || this.legacyTranslatePageTitle)) ||
        !isMeaningfulTitle(this.document.title)) return;
    const currentTitle = this.document.title;
    if (!force && currentTitle === this.translatedTitle) return;
    if (currentTitle !== this.translatedTitle) this.originalTitle = currentTitle;
    const request = ++this.titleRequest;
    try {
      const translated = String(await this.provider.translate(this.originalTitle, {signal}) ?? '').trim();
      if (!translated || !this.isCurrent() || request !== this.titleRequest) return;
      this.updatingTitle = true;
      this.document.title = translated;
      this.translatedTitle = translated;
    } catch (error) {
      if (!isTranslationCancelled(error)) this.firstError ??= error;
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
    const wasTranslatingTitle = this.settings.translatePageTitle || this.legacyTranslatePageTitle;
    this.legacyTranslatePageTitle = false;
    this.settings = normalizeSettings({...this.settings, ...settings});
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
      if (this.renderer) void this.translateTitle(this.controller.signal, {force: true});
    }
  }
}
