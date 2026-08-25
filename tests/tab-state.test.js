import { describe, expect, it } from 'vitest';
import {
  createTabState,
  normalizeTabStates,
  reconcileDocumentState,
  removeTabState,
  TAB_STATUS,
  updateTabState
} from '../src/background/tab-state.js';

describe('tab state', () => {
  it('keeps tab state isolated by tab id', () => {
    let states = {};
    states = updateTabState(states, 1, { status: TAB_STATUS.ACTIVE, generation: 10 });
    states = updateTabState(states, 2, { status: TAB_STATUS.ERROR, generation: 20 });

    expect(states['1'].status).toBe(TAB_STATUS.ACTIVE);
    expect(states['2'].status).toBe(TAB_STATUS.ERROR);
    expect(states['1'].generation).toBe(10);
  });

  it('normalizes malformed storage values without throwing', () => {
    expect(normalizeTabStates(null)).toEqual({});
    expect(normalizeTabStates({ 4: { status: TAB_STATUS.ACTIVE } })['4']).toMatchObject({
      status: TAB_STATUS.ACTIVE,
      generation: 0
    });
    expect(createTabState().status).toBe(TAB_STATUS.OFF);
  });

  it('removes only the requested tab', () => {
    const states = {
      1: createTabState({ status: TAB_STATUS.ACTIVE }),
      2: createTabState({ status: TAB_STATUS.ERROR })
    };
    expect(removeTabState(states, 1)).toEqual({ 2: states[2] });
  });

  it('resets an active tab when a new document token arrives', () => {
    const states = updateTabState({}, 7, {
      status: TAB_STATUS.ACTIVE,
      generation: 10,
      documentToken: 'old-document'
    });

    const next = reconcileDocumentState(states, 7, 'new-document', 11);

    expect(next['7']).toMatchObject({
      status: TAB_STATUS.OFF,
      generation: 11,
      documentToken: 'new-document'
    });
  });

  it('keeps an in-flight action when the first content-ready token is associated', () => {
    const states = updateTabState({}, 8, {
      status: TAB_STATUS.CHECKING,
      generation: 20,
      documentToken: null
    });

    const next = reconcileDocumentState(states, 8, 'first-document', 21);

    expect(next['8']).toMatchObject({
      status: TAB_STATUS.CHECKING,
      generation: 20,
      documentToken: 'first-document'
    });
  });
});
