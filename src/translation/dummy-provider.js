import {MODEL_STATE} from './model-state.js';
import {
  TranslationCancelledError,
  TranslationProvider,
  TranslationProviderError,
  throwIfAborted
} from './provider.js';

export const DUMMY_PROFILES = Object.freeze({
  NORMAL: 'normal',
  EXPANDED: 'expanded'
});

export const DEFAULT_DUMMY_DELAY_MS = 20;

const DUMMY_PADDING = ' [dummy expanded]';

function normalizeDelay(value) {
  const delayMs = Number(value);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new TranslationProviderError(
      'INVALID_CONFIGURATION',
      'Dummy translation delay must be an integer >= 0.'
    );
  }
  return delayMs;
}

function normalizeProfile(value) {
  if (value === DUMMY_PROFILES.NORMAL || value === DUMMY_PROFILES.EXPANDED) return value;
  throw new TranslationProviderError(
    'INVALID_CONFIGURATION',
    'Dummy translation profile must be normal or expanded.'
  );
}

export function formatDummyTranslation(text, profile = DUMMY_PROFILES.NORMAL) {
  const source = String(text ?? '');
  const prefix = `ko:${source}`;
  if (profile === DUMMY_PROFILES.NORMAL) return prefix;

  const targetLength = Math.max(prefix.length + 1, Math.ceil(source.length * 1.4));
  const remaining = targetLength - prefix.length;
  const padding = DUMMY_PADDING.repeat(Math.ceil(remaining / DUMMY_PADDING.length));
  return `${prefix}${padding.slice(0, remaining)}`;
}

function closedProviderError() {
  return new TranslationProviderError(
    'CLOSED',
    'The dummy translation provider has been closed.'
  );
}

/**
 * Deterministic, test-only replacement for ChromeTranslateProvider.
 *
 * This provider deliberately has no browser or network dependency. The
 * build-gated factory is the only extension path that can select it.
 */
export class DummyTranslateProvider extends TranslationProvider {
  constructor({
    sourceLanguage = 'en',
    targetLanguage = 'ko',
    profile = DUMMY_PROFILES.NORMAL,
    delayMs = DEFAULT_DUMMY_DELAY_MS
  } = {}) {
    super();
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.profile = normalizeProfile(profile);
    this.delayMs = normalizeDelay(delayMs);
    this.pair = `dummy:${this.profile}:${sourceLanguage}:${targetLanguage}`;
    this.operation = 0;
    this.pending = new Set();
    this.closed = false;
  }

  async getModelState() {
    return this.closed ? MODEL_STATE.UNAVAILABLE : MODEL_STATE.AVAILABLE;
  }

  async prepare({onStateChange, signal} = {}) {
    if (this.closed) throw closedProviderError();
    throwIfAborted(signal);
    onStateChange?.({state: MODEL_STATE.AVAILABLE, progress: 1});
    return this;
  }

  async translate(text, {signal} = {}) {
    if (this.closed) throw closedProviderError();
    throwIfAborted(signal);

    const operation = this.operation;
    const source = String(text ?? '');
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = {
        timer: null,
        cancel: null
      };
      const cleanup = () => {
        if (request.timer != null) clearTimeout(request.timer);
        signal?.removeEventListener?.('abort', request.cancel);
        this.pending.delete(request);
      };
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      request.cancel = () => settle(reject, new TranslationCancelledError());
      request.timer = setTimeout(() => {
        if (this.closed || operation !== this.operation || signal?.aborted) {
          request.cancel();
          return;
        }
        settle(resolve, formatDummyTranslation(source, this.profile));
      }, this.delayMs);
      this.pending.add(request);
      signal?.addEventListener?.('abort', request.cancel, {once: true});
      if (signal?.aborted) request.cancel();
    });
  }

  cancel() {
    this.operation += 1;
    for (const request of [...this.pending]) request.cancel();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.cancel();
  }
}
