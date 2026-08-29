import {describe, expect, it, vi} from 'vitest';
import {
  ProcessSampler,
  evaluateCpuRecovery,
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

  it('uses fixed idle and post-scenario CPU windows for the recovery gate', () => {
    const samples = (totalCpu) => Array.from({length: 8}, () => ({totalCpu}));

    expect(evaluateCpuRecovery({
      supported: true,
      baselineSamples: samples(20),
      recoverySamples: samples(25)
    })).toMatchObject({
      baselineSampleCount: 8,
      recoverySampleCount: 8,
      baselineAverageTotalCpu: 20,
      recoveryAverageTotalCpu: 25,
      cpuRecovered: true
    });
    expect(evaluateCpuRecovery({
      supported: true,
      baselineSamples: samples(20),
      recoverySamples: samples(90)
    }).cpuRecovered).toBe(false);
    expect(evaluateCpuRecovery({
      supported: false,
      baselineSamples: samples(20),
      recoverySamples: samples(25)
    }).cpuRecovered).toBe(false);
    expect(evaluateCpuRecovery({
      supported: true,
      baselineSamples: samples(20).slice(0, 7),
      recoverySamples: samples(25)
    }).cpuRecovered).toBe(false);
  });

  it('does not use cleanup samples in the scenario-immediate recovery window', async () => {
    vi.useFakeTimers();
    const cpuValues = [
      20,
      ...Array.from({length: 8}, () => 20),
      ...Array.from({length: 8}, () => 90),
      ...Array.from({length: 3}, () => 5)
    ];
    try {
      const sampler = new ProcessSampler(123, {
        sampleIntervalMs: 250,
        readProcesses: async () => [{
          pid: 123,
          ppid: 1,
          cpu: cpuValues.shift(),
          rssKb: 1,
          command: 'Chrome'
        }]
      });

      await sampler.start();
      const baseline = sampler.captureBaseline();
      await vi.advanceTimersByTimeAsync(250 * 8);
      await baseline;
      const recovery = sampler.captureRecovery();
      await vi.advanceTimersByTimeAsync(250 * 8);
      await recovery;
      const result = await sampler.stop();

      expect(result.sampleCount).toBe(17);
      expect(result.baselineSampleCount).toBe(8);
      expect(result.recoverySampleCount).toBe(8);
      expect(result.recoveryAverageTotalCpu).toBe(90);
      expect(result.cpuRecovered).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks failed process sampling unsupported for performance validation', async () => {
    const sampler = new ProcessSampler(123, {
      readProcesses: async () => []
    });

    await sampler.start();
    await sampler.captureBaseline();
    await sampler.captureRecovery();
    const result = await sampler.stop();

    expect(result.supported).toBe(false);
    expect(result.error).toContain('No Chrome processes found');
    expect(result.cpuRecovered).toBe(false);
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
