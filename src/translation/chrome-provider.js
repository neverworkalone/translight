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
      throw toProviderError(error, 'AVAILABILITY_FAILED', 'Chrome Translator 모델 상태를 확인하지 못했습니다.');
    }
  }

  async prepare({ onStateChange, signal } = {}) {
    throwIfAborted(signal);

    if (this.translator) {
      onStateChange?.({ state: MODEL_STATE.AVAILABLE, progress: 1 });
      return this.translator;
    }

    if (!this.api || typeof this.api.create !== 'function') {
      throw new TranslationProviderError(
        'UNAVAILABLE',
        '이 Chrome 환경에서는 Translator API를 사용할 수 없습니다.'
      );
    }

    const initialState = await this.getModelState();
    throwIfAborted(signal);

    if (initialState === MODEL_STATE.UNAVAILABLE) {
      throw new TranslationProviderError(
        'UNAVAILABLE',
        '영어에서 한국어로 번역할 수 있는 Chrome Translator 모델이 없습니다.'
      );
    }
    if (initialState === MODEL_STATE.DOWNLOAD_FAILED) {
      throw new TranslationProviderError(
        'DOWNLOAD_FAILED',
        'Chrome Translator 모델 다운로드에 실패했습니다.',
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
      throw toProviderError(error, 'DOWNLOAD_FAILED', 'Chrome Translator 모델을 준비하지 못했습니다.');
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
      throw new TranslationProviderError('NOT_READY', '번역 모델이 아직 준비되지 않았습니다.');
    }

    try {
      const translated = await this.translator.translate(text);
      throwIfAborted(signal);
      return String(translated ?? '');
    } catch (error) {
      if (error instanceof TranslationCancelledError) throw error;
      throw toProviderError(error, 'TRANSLATE_FAILED', '텍스트를 번역하지 못했습니다.');
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
