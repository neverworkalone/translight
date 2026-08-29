import {afterEach, describe, expect, it, vi} from 'vitest';
import {BUILD_INFO} from '../src/build-info.js';
import {
  DEFAULT_DUMMY_DELAY_MS,
  DUMMY_PROFILES,
  DummyTranslateProvider,
  formatDummyTranslation
} from '../src/translation/dummy-provider.js';
import {
  assertDummyProviderAllowed,
  createTranslationProvider
} from '../src/translation/provider-factory.js';
import {MODEL_STATE} from '../src/translation/model-state.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('DummyTranslateProvider', () => {
  it('returns deterministic normal output that differs from the source', async () => {
    const provider = new DummyTranslateProvider();
    await expect(provider.getModelState()).resolves.toBe(MODEL_STATE.AVAILABLE);
    await expect(provider.prepare()).resolves.toBe(provider);

    const first = await provider.translate('A stable source sentence.');
    const second = await provider.translate('A stable source sentence.');

    expect(first).toBe('ko:A stable source sentence.');
    expect(second).toBe(first);
    expect(first).not.toBe('A stable source sentence.');
  });

  it('returns deterministic expanded output longer than its source', async () => {
    const source = 'This source is long enough to exercise wrapping and table sizing.';
    const provider = new DummyTranslateProvider({profile: DUMMY_PROFILES.EXPANDED, delayMs: 0});
    const output = await provider.translate(source);

    expect(output).toBe(formatDummyTranslation(source, DUMMY_PROFILES.EXPANDED));
    expect(output.length).toBeGreaterThan(source.length);
    expect(output.length / source.length).toBeGreaterThanOrEqual(1.3);
    expect(output.length / source.length).toBeLessThanOrEqual(1.5);
  });

  it('delivers normal output asynchronously after the configured delay', async () => {
    vi.useFakeTimers();
    const provider = new DummyTranslateProvider({delayMs: DEFAULT_DUMMY_DELAY_MS});
    let settled = false;
    const request = provider.translate('async source').then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_DUMMY_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toBe('ko:async source');
    expect(settled).toBe(true);
  });

  it('rejects an aborted request before delivery', async () => {
    vi.useFakeTimers();
    const provider = new DummyTranslateProvider({delayMs: DEFAULT_DUMMY_DELAY_MS});
    const controller = new AbortController();
    const request = provider.translate('late source', {signal: controller.signal});

    controller.abort();
    await expect(request).rejects.toMatchObject({code: 'CANCELLED'});
    await vi.advanceTimersByTimeAsync(DEFAULT_DUMMY_DELAY_MS + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels pending work and prevents new work after close', async () => {
    vi.useFakeTimers();
    const provider = new DummyTranslateProvider({delayMs: 50});
    const pending = provider.translate('pending source');

    provider.close();

    await expect(pending).rejects.toMatchObject({code: 'CANCELLED'});
    await expect(provider.translate('new source')).rejects.toMatchObject({code: 'CLOSED'});
    await expect(provider.prepare()).rejects.toMatchObject({code: 'CLOSED'});
    await expect(provider.getModelState()).resolves.toBe(MODEL_STATE.UNAVAILABLE);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('provider selection isolation', () => {
  it('rejects dummy selection in the production source/test build', () => {
    expect(BUILD_INFO.testBuild).toBe(false);
    expect(() => assertDummyProviderAllowed()).toThrowError(/test build/u);
    expect(() => createTranslationProvider({type: 'dummy'})).toThrowError(/test build/u);
    expect(createTranslationProvider().constructor.name).toBe('ChromeTranslateProvider');
  });

  it('rejects unsupported provider names instead of falling back', () => {
    expect(() => createTranslationProvider({type: 'unexpected'}))
      .toThrowError(/Unsupported translation provider/u);
  });
});
