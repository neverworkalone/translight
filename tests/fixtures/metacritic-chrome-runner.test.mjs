import {describe, expect, it} from 'vitest';
import {
  evaluateResponsiveness,
  parseArgs,
  summarizePageSamples
} from './metacritic-chrome-runner.mjs';

describe('Metacritic Chrome runner', () => {
  it('parses persistent attach mode without changing the selected scenario URL', () => {
    expect(parseArgs([
      '--scenario=navigation',
      '--debugging-port=9222',
      '--browser-pid=1234',
      '--profile-dir=/private/tmp/translight-cft-profile',
      '--cycles=5'
    ])).toMatchObject({
      scenario: 'navigation',
      debuggingPort: 9222,
      browserPid: 1234,
      profileDir: '/private/tmp/translight-cft-profile',
      cycles: 5,
      url: 'https://www.metacritic.com/',
      urlProvided: false
    });
  });

  it('fails responsiveness when either browser signal exceeds its budget', () => {
    expect(evaluateResponsiveness({
      cdpPingSupported: true,
      maxCdpPingMs: 11,
      longTaskSupported: true,
      maxLongTaskMs: 329
    })).toEqual({
      cdpPingPass: true,
      longTaskPass: true,
      responsivenessPass: true
    });
    expect(evaluateResponsiveness({
      cdpPingSupported: true,
      maxCdpPingMs: 251,
      longTaskSupported: true,
      maxLongTaskMs: 329
    }).responsivenessPass).toBe(false);
    expect(evaluateResponsiveness({
      cdpPingSupported: true,
      maxCdpPingMs: 11,
      longTaskSupported: true,
      maxLongTaskMs: 501
    }).responsivenessPass).toBe(false);
  });

  it('reports translation drops and route changes from sampled page state', () => {
    expect(summarizePageSamples([
      {path: '/', translationCount: 8, emptyTranslationCount: 0},
      {path: '/game/star-wars-zero-company/', translationCount: 8, emptyTranslationCount: 0},
      {path: '/', translationCount: 0, emptyTranslationCount: 0}
    ], 8)).toMatchObject({
      routeChanges: 1,
      minimumTranslationCount: 0,
      maximumTranslationCount: 8,
      translationDropSamples: 1,
      emptyTranslationSamples: 0
    });
  });
});
