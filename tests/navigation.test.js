import {describe, expect, it} from 'vitest';
import {
  classifyNavigation,
  isNavigationStateCurrent,
  shouldContinueManualTranslation
} from '../src/background/navigation.js';
import {TAB_ACTIVATION} from '../src/background/tab-state.js';

describe('navigation activation rules', () => {
  it('continues manual translation on the same origin only', () => {
    const state = {activation: TAB_ACTIVATION.MANUAL, origin: 'https://example.com'};
    expect(shouldContinueManualTranslation(state, 'https://example.com/next')).toBe(true);
    expect(shouldContinueManualTranslation(state, 'http://example.com/next')).toBe(false);
    expect(shouldContinueManualTranslation(state, 'https://other.example.net/next')).toBe(false);
  });

  it('starts automatic translation for a registered site and its subdomains', () => {
    const result = classifyNavigation({
      state: {activation: null, origin: null},
      url: 'https://www.news.example.com/article',
      autoTranslateSites: ['https://example.com/path', 'example.com']
    });
    expect(result).toMatchObject({translate: true, activation: TAB_ACTIVATION.AUTO, hostname: 'news.example.com'});
  });

  it('keeps automatic rules active for same-document hash navigation', () => {
    expect(classifyNavigation({
      state: {activation: TAB_ACTIVATION.AUTO, origin: 'https://example.com'},
      url: 'https://example.com/article#details',
      autoTranslateSites: ['example.com']
    })).toMatchObject({translate: true, activation: TAB_ACTIVATION.AUTO});
    expect(classifyNavigation({
      state: {activation: TAB_ACTIVATION.MANUAL, origin: 'https://example.com'},
      url: 'https://example.com/article#details',
      autoTranslateSameSite: true
    })).toMatchObject({translate: true, activation: TAB_ACTIVATION.MANUAL});
  });

  it('can disable same-site continuation without disabling registered sites', () => {
    expect(classifyNavigation({
      state: {activation: TAB_ACTIVATION.MANUAL, origin: 'https://example.com'},
      url: 'https://example.com/next',
      autoTranslateSameSite: false
    })).toMatchObject({translate: false});
    expect(classifyNavigation({
      state: {activation: TAB_ACTIVATION.MANUAL, origin: 'https://example.com'},
      url: 'https://example.com/next',
      autoTranslateSameSite: false,
      autoTranslateSites: ['example.com']
    })).toMatchObject({translate: true, activation: TAB_ACTIVATION.AUTO});
  });

  it('rejects a loading update that was made stale while awaiting settings', () => {
    expect(isNavigationStateCurrent(
      {generation: 10, documentToken: 'old-document'},
      {generation: 10, documentToken: 'old-document'}
    )).toBe(true);
    expect(isNavigationStateCurrent(
      {generation: 10, documentToken: 'old-document'},
      {generation: 11, documentToken: 'new-document'}
    )).toBe(false);
  });
});
