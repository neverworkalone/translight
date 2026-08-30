import {describe, expect, it, vi} from 'vitest';
import {
  ProcessSampler,
  createChromeLaunchSpec,
  evaluateCpuRecovery,
  evaluateResponsiveness,
  finalizeLayoutReport,
  parseArgs,
  resolveTestedCommit,
  summarizePageSamples,
  summarizeRecoveryResponsiveness
} from './metacritic-chrome-runner.mjs';

describe('Metacritic Chrome runner', () => {
  it('fails when a fixture geometry snapshot exceeds its tolerance', () => {
    const report = finalizeLayoutReport({
      supported: true,
      tolerancePx: 1,
      baseline: [{selector: '#root', x: 10, width: 100}],
      snapshots: [{
        label: 'incremental',
        snapshot: [{selector: '#root', x: 12, width: 100}]
      }]
    });

    expect(report.pass).toBe(false);
    expect(report.failures).toEqual([{
      label: 'incremental',
      selector: '#root',
      property: 'x',
      expected: 10,
      actual: 12
    }]);
  });

  it('parses explicit dummy provider settings', () => {
    expect(parseArgs([
      '--provider=dummy',
      '--dummy-profile=expanded',
      '--dummy-delay-ms=37',
      '--cycles=2'
    ])).toMatchObject({
      provider: 'dummy',
      dummyProfile: 'expanded',
      dummyDelayMs: 37,
      cycles: 2
    });
  });

  it('defaults to background browser launch on macOS and supports explicit overrides', () => {
    expect(parseArgs([]).background).toBe(process.platform === 'darwin');
    expect(parseArgs(['--background']).background).toBe(true);
    expect(parseArgs(['--foreground']).background).toBe(false);
  });

  it('uses macOS open -g for an app-bundled browser while preserving browser arguments', () => {
    const chromePath = '/tmp/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
    const browserArgs = ['--remote-debugging-port=1234', 'about:blank'];

    expect(createChromeLaunchSpec({
      chromePath,
      args: browserArgs,
      background: true,
      platform: 'darwin'
    })).toEqual({
      command: 'open',
      args: [
        '-g',
        '-a',
        '/tmp/Google Chrome for Testing.app',
        '--args',
        ...browserArgs
      ],
      background: true
    });
    expect(createChromeLaunchSpec({
      chromePath,
      args: browserArgs,
      background: true,
      platform: 'linux'
    })).toEqual({command: chromePath, args: browserArgs, background: false});
  });

  it('rejects invalid dummy provider settings', () => {
    expect(() => parseArgs(['--provider=mock'])).toThrow(/--provider must be real or dummy/u);
    expect(() => parseArgs(['--dummy-profile=short'])).toThrow(/--dummy-profile must be normal or expanded/u);
    expect(() => parseArgs(['--dummy-delay-ms=-1'])).toThrow(/--dummy-delay-ms must be an integer/u);
  });

  it('rejects a stale extension bundle in local launch mode', () => {
    const checkoutCommit = 'b'.repeat(40);
    const loadedCommit = 'a'.repeat(40);

    expect(() => resolveTestedCommit({
      loadedBuild: {commit: loadedCommit, dirty: false},
      checkoutCommit,
      checkoutDirty: false,
      attachMode: false
    })).toThrow(new RegExp(`does not match checkout HEAD ${checkoutCommit}`, 'u'));
  });

  it('marks a matching local launch bundle commit as verified', () => {
    const commit = 'a'.repeat(40);

    expect(resolveTestedCommit({
      loadedBuild: {commit, dirty: false},
      checkoutCommit: commit,
      checkoutDirty: false,
      attachMode: false
    })).toEqual({
      testedCommit: commit,
      testedCommitSource: 'loaded-extension-build',
      testedCommitVerified: true,
      testedCommitAvailable: true
    });
  });

  it('uses the loaded extension commit for attach mode without claiming checkout verification', () => {
    const loadedCommit = 'a'.repeat(40);
    const result = resolveTestedCommit({
      loadedBuild: {commit: loadedCommit, dirty: true},
      checkoutCommit: 'b'.repeat(40),
      checkoutDirty: true,
      attachMode: true
    });

    expect(result).toEqual({
      testedCommit: loadedCommit,
      testedCommitSource: 'loaded-extension-build',
      testedCommitVerified: false,
      testedCommitAvailable: true
    });
  });

  it('rejects a launch bundle that has no valid build commit', () => {
    expect(() => resolveTestedCommit({
      loadedBuild: {kind: 'test', testBuild: true, commit: 'unknown'},
      checkoutCommit: 'b'.repeat(40),
      checkoutDirty: false,
      attachMode: false
    })).toThrow(/does not report a valid build commit/u);
  });

  it('blocks a local launch when the loaded extension bundle is dirty', () => {
    const commit = 'a'.repeat(40);

    expect(() => resolveTestedCommit({
      loadedBuild: {commit, dirty: true},
      checkoutCommit: commit,
      checkoutDirty: false,
      attachMode: false
    })).toThrow(/loaded extension build is dirty/u);
  });

  it('blocks a local launch when the current checkout is dirty', () => {
    const commit = 'a'.repeat(40);

    expect(() => resolveTestedCommit({
      loadedBuild: {commit, dirty: false},
      checkoutCommit: commit,
      checkoutDirty: true,
      attachMode: false
    })).toThrow(/current checkout is dirty/u);
  });

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

  it('passes an immediate rolling CPU recovery window', () => {
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

  it('allows a responsive five-second CPU spike when a rolling window recovers', async () => {
    vi.useFakeTimers();
    const cpuValues = [
      20,
      ...Array.from({length: 8}, () => 20),
      ...Array.from({length: 20}, () => 100),
      ...Array.from({length: 8}, () => 20),
      ...Array.from({length: 3}, () => 5)
    ];
    try {
      const sampler = new ProcessSampler(123, {
        sampleIntervalMs: 250,
        now: () => Date.now(),
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
      let recoveryDone = false;
      recovery.then(() => {
        recoveryDone = true;
      });
      for (let tick = 0; tick < 40 && !recoveryDone; tick += 1) {
        await vi.advanceTimersByTimeAsync(250);
      }
      await recovery;
      const result = await sampler.stop();

      expect(result.sampleCount).toBe(35);
      expect(result.baselineSampleCount).toBe(8);
      expect(result.recoverySampleCount).toBe(26);
      expect(result.recoveryWindowCount).toBe(19);
      expect(result.recoveryWindowFound).toBe(true);
      expect(result.recoveryTimeMs).toBe(6500);
      expect(result.recoveryAverageTotalCpu).toBe(40);
      expect(result.cpuRecovered).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails CPU recovery when the rolling window never recovers before timeout', async () => {
    vi.useFakeTimers();
    const cpuValues = [
      20,
      ...Array.from({length: 8}, () => 20),
      ...Array.from({length: 40}, () => 100)
    ];
    try {
      const sampler = new ProcessSampler(123, {
        sampleIntervalMs: 250,
        now: () => Date.now(),
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
      let recoveryDone = false;
      recovery.then(() => {
        recoveryDone = true;
      });
      for (let tick = 0; tick < 40 && !recoveryDone; tick += 1) {
        await vi.advanceTimersByTimeAsync(250);
      }
      await recovery;
      const result = await sampler.stop();

      expect(result.recoverySampleCount).toBe(40);
      expect(result.recoveryTimedOut).toBe(true);
      expect(result.recoveryWindowFound).toBe(false);
      expect(result.recoveryTimeMs).toBeNull();
      expect(result.supported).toBe(true);
      expect(result.cpuRecovered).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails recovery responsiveness when a ping or long-task budget is exceeded', () => {
    const cpuRecovery = evaluateCpuRecovery({
      supported: true,
      baselineSamples: Array.from({length: 8}, () => ({totalCpu: 20})),
      recoverySamples: Array.from({length: 8}, () => ({totalCpu: 20}))
    });
    expect(cpuRecovery.cpuRecovered).toBe(true);

    expect(summarizeRecoveryResponsiveness({
      pings: [10, 251],
      probe: {supported: true, maxLongTaskMs: 100}
    })).toMatchObject({
      cdpPingPass: false,
      longTaskPass: true,
      responsivenessPass: false
    });
    expect(summarizeRecoveryResponsiveness({
      pings: [10],
      probe: {supported: true, maxLongTaskMs: 501}
    })).toMatchObject({
      cdpPingPass: true,
      longTaskPass: false,
      responsivenessPass: false
    });
    expect(summarizeRecoveryResponsiveness({
      pings: [],
      probe: {supported: true, maxLongTaskMs: 100}
    }).responsivenessPass).toBe(false);
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
