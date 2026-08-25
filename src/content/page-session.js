import { collectTranslationBlocks } from './block-collector.js';
import { ChromeTranslateProvider } from '../translation/chrome-provider.js';
import { MODEL_STATE } from '../translation/model-state.js';
import { isTranslationCancelled, TranslationCancelledError } from '../translation/provider.js';
import { TranslationRenderer } from './translation-renderer.js';

const DEFAULT_CONCURRENCY = 3;
let sessionSequence = 0;

function errorPayload(error) {
  return {
    errorCode: error?.code ?? 'TRANSLATION_FAILED',
    errorMessage: error?.message ?? 'The page could not be translated.'
  };
}

export class PageSession {
  constructor({ generation, document = globalThis.document, sendStatus, provider, concurrency = DEFAULT_CONCURRENCY }) {
    this.generation = generation;
    this.document = document;
    this.sendStatus = sendStatus ?? (() => {});
    this.provider = provider ?? new ChromeTranslateProvider();
    this.concurrency = concurrency;
    this.sessionId = `session-${generation}-${Date.now()}-${++sessionSequence}`;
    this.renderer = null;
    this.controller = null;
    this.running = false;
    this.runPromise = null;
  }

  isCurrent() {
    return this.running && !this.controller?.signal.aborted;
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
    this.stop({ notify: false });
    this.controller = new AbortController();
    this.running = true;
    this.runPromise = this.run();
    return this.runPromise;
  }

  stop({ notify = true } = {}) {
    const wasRunning = this.running;
    this.running = false;
    this.controller?.abort();
    this.provider.cancel?.();
    this.renderer?.removeAll();
    this.renderer = null;
    this.provider.close?.();
    if (notify && wasRunning) this.notify('OFF');
  }

  async run() {
    const signal = this.controller.signal;
    try {
      this.notify('CHECKING');
      const modelState = await this.provider.getModelState();
      if (!this.isCurrent()) throw new TranslationCancelledError();
      this.notify('CHECKING', { modelState });

      if (modelState === MODEL_STATE.UNAVAILABLE) {
        const error = new Error('Chrome Translator is unavailable in this environment.');
        error.code = 'UNAVAILABLE';
        error.openOptions = true;
        throw error;
      }

      this.renderer = new TranslationRenderer({ document: this.document, sessionId: this.sessionId });
      await this.provider.prepare({
        signal,
        onStateChange: ({ state, progress }) => {
          if (!this.isCurrent()) return;
          if (state === MODEL_STATE.DOWNLOADING) {
            this.notify('DOWNLOADING', { modelState: state, progress });
          }
        }
      });
      if (!this.isCurrent()) throw new TranslationCancelledError();

      const blocks = collectTranslationBlocks(this.document.body);
      this.notify('TRANSLATING', { count: blocks.length });
      const result = await this.translateBlocks(blocks, signal);
      if (!this.isCurrent()) throw new TranslationCancelledError();

      this.notify('ACTIVE', {
        count: blocks.length,
        translatedCount: result.translatedCount,
        failedCount: result.failedCount
      });
    } catch (error) {
      if (!this.isCurrent() || isTranslationCancelled(error)) return;
      this.renderer?.removeAll();
      this.renderer = null;
      this.running = false;
      this.provider.close?.();
      this.notify('ERROR', { ...errorPayload(error), openOptions: Boolean(error?.openOptions) });
    }
  }

  async translateBlocks(blocks, signal) {
    if (blocks.length === 0) return { translatedCount: 0, failedCount: 0 };

    const pending = [...blocks];
    let translatedCount = 0;
    let failedCount = 0;
    let firstError = null;

    const worker = async () => {
      while (pending.length > 0) {
        if (!this.isCurrent()) throw new TranslationCancelledError();
        const block = pending.shift();
        try {
          const translatedText = await this.provider.translate(block.text, { signal });
          if (!this.isCurrent()) throw new TranslationCancelledError();
          if (translatedText.trim()) {
            this.renderer.insert({
              element: block.element,
              sourceId: block.sourceId,
              translatedText
            });
            translatedCount += 1;
          }
        } catch (error) {
          if (isTranslationCancelled(error)) throw error;
          firstError ??= error;
          failedCount += 1;
        }
      }
    };

    const workerCount = Math.min(this.concurrency, blocks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (translatedCount === 0 && firstError) throw firstError;
    return { translatedCount, failedCount };
  }
}
