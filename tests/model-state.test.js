import { describe, expect, it } from 'vitest';
import { MODEL_STATE, normalizeModelState } from '../src/translation/model-state.js';

describe('normalizeModelState', () => {
  it.each([
    ['downloadable', MODEL_STATE.DOWNLOADABLE],
    ['Downloading', MODEL_STATE.DOWNLOADING],
    ['available', MODEL_STATE.AVAILABLE],
    ['download_failed', MODEL_STATE.DOWNLOAD_FAILED],
    ['Download-Failed', MODEL_STATE.DOWNLOAD_FAILED],
    ['unavailable', MODEL_STATE.UNAVAILABLE],
    ['something unknown', MODEL_STATE.UNAVAILABLE]
  ])('normalizes %s', (value, expected) => {
    expect(normalizeModelState(value)).toBe(expected);
  });
});
