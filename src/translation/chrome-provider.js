import { MODEL_STATE, normalizeModelState } from './model-state.js';
import {
  TranslationCancelledError,
  TranslationProvider,
  TranslationProviderError,
  throwIfAborted
} from './provider.js';

const DEFAULT_SOURCE_LANGUAGE = 'en';
const DEFAULT_TARGET_LANGUAGE = 'ko';

function getTranslatorApi() {
  return globalThis.Translator ?? globalThis.window?.Translator ?? null;
}

function toProgress(value) {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function toProviderError(error, fallbackCode, fallbackMessage) {
  if (error instanceof TranslationProviderError) return error;
  if (error?.name === 'AbortError') return new TranslationCancelledError();
  return new TranslationProviderError(fallbackCode, fallbackMessage, {
    cause: error,
    recoverable: true
  });
}

async function releaseTranslator(translator) {
  if (!translator) return;
  if (typeof translator.destroy === 'function') {
    await translator.destroy();
    return;
  }
  if (typeof translator.close === 'function') await translator.close();
}

export class ChromeTranslateProvider extends TranslationProvider {
  constructor({ sourceLanguage = DEFAULT_SOURCE_LANGUAGE, targetLanguage = DEFAULT_TARGET_LANGUAGE, api } = {}) {
    super();
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.api = api ?? getTranslatorApi();
    this.translator = null;
    this.operation = 0;
    this.pair = `${sourceLanguage}:${targetLanguage}`;
  }

  async getModelState() {
    if (!this.api || typeof this.api.availability !== 'function') {
      return MODEL_STATE.UNAVAILABLE;
    }

    try {
      const state = await this.api.availability({
        sourceLanguage: this.sourceLanguage,
        targetLanguage: this.targetLanguage
      });
      return normalizeModelState(state);
    } catch (error) {
      throw toProviderError(error, 'AVAILABILITY_FAILED', 'Chrome Translator model availability could not be checked.');
    }
  }

  async prepare({ onStateChange, signal, retry = false } = {}) {
    throwIfAborted(signal);

    if (this.translator) {
      onStateChange?.({ state: MODEL_STATE.AVAILABLE, progress: 1 });
      return this.translator;
    }

    if (!this.api || typeof this.api.create !== 'function') {
      throw new TranslationProviderError(
        'UNAVAILABLE',
        'Chrome Translator is unavailable in this environment.'
      );
    }

    const initialState = await this.getModelState();
    throwIfAborted(signal);

    if (initialState === MODEL_STATE.UNAVAILABLE) {
      throw new TranslationProviderError(
        'UNAVAILABLE',
        'No Chrome Translator model is available for the configured language pair.'
      );
    }
    if (initialState === MODEL_STATE.DOWNLOAD_FAILED && !retry) {
      throw new TranslationProviderError(
        'DOWNLOAD_FAILED',
        'The Chrome Translator model download failed.',
        { recoverable: true }
      );
    }

    const operation = ++this.operation;
    if (initialState === MODEL_STATE.DOWNLOADABLE || initialState === MODEL_STATE.DOWNLOADING) {
      onStateChange?.({ state: MODEL_STATE.DOWNLOADING, progress: 0 });
    }

    let createdTranslator;
    try {
      createdTranslator = await this.api.create({
        sourceLanguage: this.sourceLanguage,
        targetLanguage: this.targetLanguage,
        monitor: (monitor) => {
          monitor?.addEventListener?.('downloadprogress', (event) => {
            if (operation !== this.operation) return;
            onStateChange?.({
              state: MODEL_STATE.DOWNLOADING,
              progress: toProgress(event?.loaded)
            });
          });
        }
      });
    } catch (error) {
      if (operation !== this.operation || signal?.aborted) throw new TranslationCancelledError();
      throw toProviderError(error, 'DOWNLOAD_FAILED', 'The Chrome Translator model could not be prepared.');
    }

    if (operation !== this.operation || signal?.aborted) {
      await releaseTranslator(createdTranslator);
      throw new TranslationCancelledError();
    }

    this.translator = createdTranslator;
    onStateChange?.({ state: MODEL_STATE.AVAILABLE, progress: 1 });
    return this.translator;
  }

  async translate(text, { signal } = {}) {
    throwIfAborted(signal);
    if (!this.translator || typeof this.translator.translate !== 'function') {
      throw new TranslationProviderError('NOT_READY', 'The translation model is not ready.');
    }

    try {
      const translated = await this.translator.translate(text);
      throwIfAborted(signal);
      return String(translated ?? '');
    } catch (error) {
      if (error instanceof TranslationCancelledError) throw error;
      throw toProviderError(error, 'TRANSLATE_FAILED', 'The text could not be translated.');
    }
  }

  cancel() {
    this.operation += 1;
  }

  close() {
    const translator = this.translator;
    this.translator = null;
    this.cancel();
    void releaseTranslator(translator);
  }
}
