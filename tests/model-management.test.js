import { describe, expect, it } from 'vitest';
import { MODEL_MANAGEMENT_URL, openModelManagement } from '../src/options/model-management.js';

describe('translation model management link', () => {
  it('opens Chrome internal management in a new tab', () => {
    const calls = [];
    const tabs = {create: (options) => { calls.push(options); }};

    expect(openModelManagement({tabs})).toBe(true);
    expect(calls).toEqual([{url: MODEL_MANAGEMENT_URL}]);
  });

  it('does nothing when the tabs API is unavailable', () => {
    expect(openModelManagement({tabs: null})).toBe(false);
  });
});
