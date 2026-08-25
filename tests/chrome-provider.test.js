import { describe, expect, it } from 'vitest';
import { ChromeTranslateProvider } from '../src/translation/chrome-provider.js';
import { MODEL_STATE } from '../src/translation/model-state.js';

describe('ChromeTranslateProvider', () => {
  it('normalizes availability, reports progress, and reuses the translator', async () => {
    const progressEvents = [];
    let createCount = 0;
    let createOptions;
    let progressListener;
    const translator = { translate: async (text) => `ko:${text}` };
    const api = {
      availability: async () => 'downloadable',
      create: async (options) => {
        createCount += 1;
        createOptions = options;
        options.monitor({
          addEventListener: (_name, listener) => {
            progressListener = listener;
          }
        });
        progressListener?.({ loaded: 0.5 });
        return translator;
      }
    };

    const provider = new ChromeTranslateProvider({ api });
    const prepared = await provider.prepare({
      onStateChange: (event) => progressEvents.push(event)
    });
    const reused = await provider.prepare();

    expect(prepared).toBe(translator);
    expect(reused).toBe(translator);
    expect(createCount).toBe(1);
    expect(createOptions).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'ko' });
    expect(progressEvents).toContainEqual({ state: MODEL_STATE.DOWNLOADING, progress: 0 });
    expect(progressEvents).toContainEqual({ state: MODEL_STATE.DOWNLOADING, progress: 0.5 });
    expect(progressEvents.at(-1)).toEqual({ state: MODEL_STATE.AVAILABLE, progress: 1 });
    await expect(provider.translate('hello')).resolves.toBe('ko:hello');
  });

  it('returns Unavailable when Translator is not exposed', async () => {
    const provider = new ChromeTranslateProvider({ api: null });
    await expect(provider.getModelState()).resolves.toBe(MODEL_STATE.UNAVAILABLE);
  });

  it('passes a custom language pair to the Translator API', async () => {
    let availabilityOptions;
    let createOptions;
    const translator = { translate: async (text) => `translated:${text}` };
    const api = {
      availability: async (options) => {
        availabilityOptions = options;
        return 'available';
      },
      create: async (options) => {
        createOptions = options;
        return translator;
      }
    };

    const provider = new ChromeTranslateProvider({
      sourceLanguage: 'de',
      targetLanguage: 'fr',
      api
    });

    await expect(provider.prepare()).resolves.toBe(translator);
    expect(availabilityOptions).toEqual({ sourceLanguage: 'de', targetLanguage: 'fr' });
    expect(createOptions).toMatchObject({ sourceLanguage: 'de', targetLanguage: 'fr' });
  });
});
