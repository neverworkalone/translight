#!/usr/bin/env node

import {execFile, spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION_PATH = resolve(REPOSITORY_ROOT, 'dist');
const DEFAULT_ARTICLE_URL =
  'https://www.metacritic.com/pictures/august-september-2026-game-preview-wolverine-silent-hill-townfall-control-resonant/5';
const DEFAULT_HOMEPAGE_URL = 'https://www.metacritic.com/';
const DEFAULT_OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, 'artifacts/metacritic-chrome');
const BROWSER_CANDIDATES = [
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/opt/homebrew/bin/chromium',
  '/usr/local/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];
const DEFAULT_CYCLES = 3;
const DEFAULT_SETTLE_MS = 250;
const DEFAULT_TRANSLATION_WAIT_MS = 30_000;
const DEFAULT_NAVIGATION_WAIT_MS = 30_000;
const PROCESS_SAMPLE_INTERVAL_MS = 250;
const PAGE_SAMPLE_INTERVAL_MS = 100;
let nextTranslationGeneration = Date.now();

function usage() {
  return `Usage:
  npm run test:metacritic:chrome -- [options]

Options:
  --scenario=gallery|navigation   Reproduce the article gallery or homepage flow
  --url=<url>                     Start URL (defaults to the selected scenario)
  --cycles=<number>               Scroll/back cycles (default: ${DEFAULT_CYCLES})
  --settle-ms=<number>            Delay after each scroll (default: ${DEFAULT_SETTLE_MS})
  --translation-wait-ms=<number>  Wait for the first translation (default: ${DEFAULT_TRANSLATION_WAIT_MS})
  --output-dir=<path>             Directory for JSON, trace, and screenshots
  --chrome=<path>                 Chromium-based browser executable path
  --profile-dir=<path>            Keep/use an explicit Chrome user-data directory
  --skip-build                    Do not run npm run build before launching Chrome
  --skip-translation              Do not send TRANSLATION_START; test browser flow only
  --keep-browser                  Leave the launched Chrome running after the run
  --keep-profile                  Keep the temporary profile after the run
  --help                          Show this help
`;
}

class ValidationBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationBlockedError';
  }
}

function parseNumber(value, name, {minimum = 0} = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}.`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    scenario: 'gallery',
    url: null,
    cycles: DEFAULT_CYCLES,
    settleMs: DEFAULT_SETTLE_MS,
    translationWaitMs: DEFAULT_TRANSLATION_WAIT_MS,
    outputDir: DEFAULT_OUTPUT_DIRECTORY,
    chromePath: null,
    profileDir: null,
    skipBuild: false,
    skipTranslation: false,
    keepBrowser: false,
    keepProfile: false
  };

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (argument === '--skip-build') {
      options.skipBuild = true;
      continue;
    }
    if (argument === '--skip-translation') {
      options.skipTranslation = true;
      continue;
    }
    if (argument === '--keep-browser') {
      options.keepBrowser = true;
      continue;
    }
    if (argument === '--keep-profile') {
      options.keepProfile = true;
      continue;
    }

    const separator = argument.indexOf('=');
    if (separator < 0) throw new Error(`Unknown option: ${argument}`);
    const name = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    switch (name) {
      case '--scenario':
        if (!['gallery', 'navigation'].includes(value)) {
          throw new Error('--scenario must be gallery or navigation.');
        }
        options.scenario = value;
        break;
      case '--url':
        options.url = value;
        break;
      case '--cycles':
        options.cycles = parseNumber(value, '--cycles', {minimum: 1});
        break;
      case '--settle-ms':
        options.settleMs = parseNumber(value, '--settle-ms');
        break;
      case '--translation-wait-ms':
        options.translationWaitMs = parseNumber(value, '--translation-wait-ms', {minimum: 1});
        break;
      case '--output-dir':
        options.outputDir = resolve(value);
        break;
      case '--chrome':
        options.chromePath = resolve(value);
        break;
      case '--profile-dir':
        options.profileDir = resolve(value);
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  options.url ??= options.scenario === 'gallery' ? DEFAULT_ARTICLE_URL : DEFAULT_HOMEPAGE_URL;
  return options;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = address?.port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error('Could not allocate a local debugging port.');
  return port;
}

async function fetchJson(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(2000)});
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

function isOfficialGoogleChrome(path) {
  return /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome$/u.test(path);
}

async function resolveBrowserPath(requestedPath) {
  if (requestedPath) return resolve(requestedPath);
  for (const candidate of BROWSER_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new ValidationBlockedError(
    'No extension-capable Chromium binary was found. Install Chromium or Chrome for Testing, ' +
    'then pass --chrome=/path/to/browser. The official Google Chrome app is not supported because ' +
    'it ignores --load-extension.'
  );
}

function assertExtensionCapableBrowser(path) {
  if (isOfficialGoogleChrome(path)) {
    throw new ValidationBlockedError(
      'The official Google Chrome app ignores --load-extension and --disable-extensions-except. ' +
      'Use Chromium or Chrome for Testing with --chrome=/path/to/browser.'
    );
  }
}

async function waitForDevTools(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      if (version.webSocketDebuggerUrl) return version;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`Chrome DevTools did not start on port ${port}: ${lastError?.message ?? 'timeout'}`);
}

async function listTargets(port) {
  return fetchJson(`http://127.0.0.1:${port}/json/list`);
}

async function waitForTarget(port, predicate, timeoutMs = 15_000, description = 'Chrome DevTools target') {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    const targets = await listTargets(port);
    lastTargets = targets;
    const target = targets.find(predicate);
    if (target?.webSocketDebuggerUrl) return target;
    await wait(100);
  }
  const available = lastTargets
    .map((target) => `${target.type}:${target.url || target.title || target.id}`)
    .join(', ');
  throw new Error(`Timed out waiting for ${description}. Available targets: ${available || 'none'}`);
}

class CdpConnection {
  constructor(webSocketUrl, name) {
    this.webSocketUrl = webSocketUrl;
    this.name = name;
    this.socket = null;
    this.nextCommandId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;
    socket.on('message', (data) => this.#handleMessage(data));
    socket.on('close', () => {
      const error = new Error(`${this.name} DevTools connection closed.`);
      for (const {reject, timer} of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    });
    await new Promise((resolvePromise, reject) => {
      const onOpen = () => {
        socket.off('error', onError);
        resolvePromise();
      };
      const onError = (error) => {
        socket.off('open', onOpen);
        reject(error);
      };
      socket.once('open', onOpen);
      socket.once('error', onError);
    });
    return this;
  }

  #handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`${message.error.message ?? 'CDP error'} (${this.name}: ${message.id})`));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 15_000) {
    return new Promise((resolvePromise, reject) => {
      let timer;
      const remove = this.on(method, (params) => {
        let matches = false;
        try {
          matches = predicate(params);
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }
        if (!matches) return;
        cleanup();
        resolvePromise(params);
      });
      const cleanup = () => {
        remove();
        clearTimeout(timer);
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${method} on ${this.name}.`));
      }, timeoutMs);
    });
  }

  async send(method, params = {}, timeoutMs = 30_000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.name} DevTools connection is not open.`);
    }
    const id = ++this.nextCommandId;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method} on ${this.name}.`));
      }, timeoutMs);
      this.pending.set(id, {resolve: resolvePromise, reject, timer});
      this.socket.send(JSON.stringify({id, method, params}));
    });
  }

  close() {
    this.socket?.terminate();
    this.socket = null;
  }
}

async function connectTarget(target, name) {
  return new CdpConnection(target.webSocketDebuggerUrl, name).connect();
}

function isTranslightManifest(manifest) {
  return manifest?.background?.service_worker === 'background.js' &&
    manifest.permissions?.includes('scripting') &&
    manifest.content_scripts?.some((script) => script.js?.includes('content.js'));
}

async function waitForTranslightWorker(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastWorkers = [];
  while (Date.now() < deadline) {
    const targets = await listTargets(port);
    const workers = targets.filter((target) => target.type === 'service_worker' &&
      target.url.startsWith('chrome-extension://'));
    lastWorkers = workers;
    for (const target of workers) {
      let connection;
      try {
        connection = await connectTarget(target, 'extension service worker candidate');
        await connection.send('Runtime.enable');
        const manifest = await evaluate(connection, 'chrome.runtime.getManifest()', 'extension service worker');
        if (isTranslightManifest(manifest)) return {connection, target, manifest};
      } catch {
        // The worker may be stopping while the target list is refreshed.
      }
      connection?.close();
    }
    await wait(100);
  }
  const available = lastWorkers.map((target) => target.url).join(', ');
  throw new Error(
    'Timed out waiting for the Translight extension service worker. ' +
    `Available extension workers: ${available || 'none'}`
  );
}

async function runCommand(command, args, {cwd = REPOSITORY_ROOT} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {cwd, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise({stdout, stderr});
      } else {
        reject(new Error(`${command} exited with ${code ?? signal}.`));
      }
    });
  });
}

async function ensureLocalServer(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) return null;
  try {
    await fetch(url, {signal: AbortSignal.timeout(1000)});
    return null;
  } catch {
    const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
      cwd: REPOSITORY_ROOT,
      stdio: 'ignore'
    });
    try {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(url, {signal: AbortSignal.timeout(1000)});
          if (response.ok) return server;
        } catch {
          // Vite is still starting.
        }
        await wait(100);
      }
      throw new Error(`Vite did not start for ${url}.`);
    } catch (error) {
      server.kill('SIGTERM');
      throw error;
    }
  }
}

function parsePsRow(line) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/u);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    cpu: Number(match[3]),
    rssKb: Number(match[4]),
    command: match[5]
  };
}

async function readChromeProcesses(rootPid) {
  const {stdout} = await execFileAsync('ps', ['-axo', 'pid=,ppid=,pcpu=,rss=,command=']);
  const rows = stdout.split('\n').map(parsePsRow).filter(Boolean);
  const children = new Map();
  for (const row of rows) {
    const siblings = children.get(row.ppid) ?? [];
    siblings.push(row);
    children.set(row.ppid, siblings);
  }
  const selected = new Map();
  const pending = [rootPid];
  while (pending.length) {
    const pid = pending.shift();
    if (selected.has(pid)) continue;
    const row = rows.find((candidate) => candidate.pid === pid);
    if (row) selected.set(pid, row);
    for (const child of children.get(pid) ?? []) pending.push(child.pid);
  }
  return [...selected.values()];
}

class ProcessSampler {
  constructor(rootPid) {
    this.rootPid = rootPid;
    this.samples = [];
    this.timer = null;
    this.inFlight = false;
    this.error = null;
  }

  start() {
    this.timer = setInterval(() => void this.sample(), PROCESS_SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
    void this.sample();
  }

  async sample() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const processes = await readChromeProcesses(this.rootPid);
      this.samples.push({
        elapsedMs: Math.round(performance.now() * 100) / 100,
        totalCpu: processes.reduce((sum, process) => sum + process.cpu, 0),
        maxProcessCpu: Math.max(...processes.map((process) => process.cpu), 0),
        rssKb: processes.reduce((sum, process) => sum + process.rssKb, 0),
        processes: processes.map(({pid, ppid, cpu, rssKb, command}) => ({pid, ppid, cpu, rssKb, command}))
      });
    } catch (error) {
      this.error ??= error.message;
    } finally {
      this.inFlight = false;
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.sample();
    const maxTotalCpu = Math.max(...this.samples.map((sample) => sample.totalCpu), 0);
    const maxProcessCpu = Math.max(...this.samples.map((sample) => sample.maxProcessCpu), 0);
    return {
      supported: !this.error,
      error: this.error,
      sampleCount: this.samples.length,
      maxTotalCpu: Math.round(maxTotalCpu * 100) / 100,
      maxProcessCpu: Math.round(maxProcessCpu * 100) / 100,
      samples: this.samples
    };
  }
}

class PageSampler {
  constructor(page, readStats) {
    this.page = page;
    this.readStats = readStats;
    this.samples = [];
    this.timer = null;
    this.inFlight = false;
    this.error = null;
  }

  start() {
    this.timer = setInterval(() => void this.sample(), PAGE_SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
    void this.sample();
  }

  async sample() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.samples.push(await this.readStats());
    } catch (error) {
      this.error ??= error.message;
    } finally {
      this.inFlight = false;
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.sample();
    return {supported: !this.error, error: this.error, sampleCount: this.samples.length, samples: this.samples};
  }
}

async function evaluate(connection, expression, name = 'page') {
  const response = await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ?? 'Runtime evaluation failed.';
    throw new Error(`${name} evaluation failed: ${description}`);
  }
  return response.result?.value;
}

async function readPageStats(page) {
  return evaluate(page, `(() => {
    const translationNodes = [...document.querySelectorAll('translight-translation')]
      .filter((node) => node.isConnected);
    const generatedNodes = [...document.querySelectorAll('[data-translight-generated="true"]')]
      .filter((node) => node.isConnected);
    return {
      atMs: performance.now(),
      url: location.href,
      path: location.pathname,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      translationCount: translationNodes.length,
      emptyTranslationCount: translationNodes.filter((node) => !node.textContent.trim()).length,
      generatedCount: generatedNodes.length,
      bodyTextLength: document.body?.innerText?.length ?? 0
    };
  })()`);
}

async function readPerformanceMetrics(page) {
  const response = await page.send('Performance.getMetrics');
  return Object.fromEntries((response.metrics ?? []).map(({name, value}) => [name, value]));
}

function diffMetrics(before, after) {
  const result = {};
  for (const [name, value] of Object.entries(after)) {
    if (typeof value === 'number' && typeof before[name] === 'number') {
      result[name] = value - before[name];
    }
  }
  return result;
}

async function measureAction(page, label, action) {
  const before = await readPerformanceMetrics(page);
  const startedAt = performance.now();
  await action();
  const after = await readPerformanceMetrics(page);
  return {
    label,
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    metrics: diffMetrics(before, after)
  };
}

async function startTracing(page) {
  await page.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: [
      'devtools.timeline',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-v8.cpu_profiler'
    ].join(',')
  });
}

async function stopTracing(page) {
  const completed = page.waitForEvent('Tracing.tracingComplete', () => true, 30_000);
  await page.send('Tracing.end');
  const {stream} = await completed;
  if (!stream) throw new Error('Tracing completed without a readable stream.');
  const chunks = [];
  let eof = false;
  while (!eof) {
    const chunk = await page.send('IO.read', {handle: stream});
    chunks.push(chunk.data ?? '');
    eof = chunk.eof === true;
  }
  await page.send('IO.close', {handle: stream}).catch(() => {});
  return chunks.join('');
}

async function saveScreenshot(page, path) {
  const {data} = await page.send('Page.captureScreenshot', {format: 'png'});
  await writeFile(path, data, 'base64');
}

async function navigate(page, url) {
  const loadEvent = page.waitForEvent('Page.loadEventFired', () => true, DEFAULT_NAVIGATION_WAIT_MS);
  await page.send('Page.navigate', {url});
  await loadEvent.catch(() => {});
  await wait(1500);
}

async function waitForFirstTranslation(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let stats = await readPageStats(page);
  while (Date.now() < deadline) {
    if (stats.translationCount > 0) return {ready: true, stats};
    await wait(250);
    stats = await readPageStats(page);
  }
  return {ready: false, stats, reason: 'No translation node appeared before the timeout.'};
}

async function waitForStableTranslations(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let stats = await readPageStats(page);
  let previousCount = -1;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    if (stats.translationCount > 0 && stats.emptyTranslationCount === 0) {
      stableSamples = stats.translationCount === previousCount ? stableSamples + 1 : 1;
      if (stableSamples >= 3) return {ready: true, stats};
      previousCount = stats.translationCount;
    } else {
      stableSamples = 0;
      previousCount = stats.translationCount;
    }
    await wait(250);
    stats = await readPageStats(page);
  }
  return {
    ready: false,
    stats,
    reason: 'Translation count did not remain stable before the timeout.'
  };
}

async function scrollTo(page, y, settleMs) {
  await evaluate(page, `window.scrollTo(0, ${Math.max(0, Math.round(y))})`);
  await wait(settleMs);
}

async function scrollToTop(page, settleMs) {
  return measureAction(page, 'scroll-top', () => scrollTo(page, 0, settleMs));
}

async function scrollThroughPage(page, settleMs, {label = 'scroll'} = {}) {
  const actions = [];
  let lastHeight = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const stats = await readPageStats(page);
    const step = Math.max(240, Math.floor(stats.viewportHeight * 0.8));
    const height = stats.scrollHeight;
    for (let y = 0; y <= height; y += step) {
      actions.push(await measureAction(page, `${label}-${pass}-${y}`, () => scrollTo(page, y, settleMs)));
    }
    await scrollTo(page, height, settleMs);
    const finalStats = await readPageStats(page);
    if (finalStats.scrollHeight === lastHeight && finalStats.scrollY >= height - 4) break;
    lastHeight = finalStats.scrollHeight;
  }
  return actions;
}

async function findAndScrollToText(page, text) {
  const serialized = JSON.stringify(text);
  return evaluate(page, `(() => {
    const needle = ${serialized}.toLowerCase();
    const candidates = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,section,article,div')];
    const match = candidates.find((element) => element.textContent.trim().toLowerCase().includes(needle));
    if (!match) return null;
    match.scrollIntoView({block: 'center'});
    return {text: match.textContent.trim().slice(0, 200), tag: match.tagName};
  })()`);
}

async function findLinkByText(page, text) {
  const serialized = JSON.stringify(text);
  return evaluate(page, `(() => {
    const needle = ${serialized}.toLowerCase();
    const links = [...document.querySelectorAll('a[href]')];
    const exact = links.find((link) => link.textContent.trim().toLowerCase().includes(needle));
    if (exact) return {href: exact.href, text: exact.textContent.trim().slice(0, 200)};
    const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .find((element) => element.textContent.trim().toLowerCase().includes('new and notable'));
    const container = heading?.closest('section,article,div');
    const fallback = [...(container?.querySelectorAll('a[href]') ?? [])][0];
    return fallback ? {href: fallback.href, text: fallback.textContent.trim().slice(0, 200)} : null;
  })()`);
}

async function clickLink(page, link) {
  const serialized = JSON.stringify(link.href);
  const beforeUrl = await evaluate(page, 'location.href');
  await evaluate(page, `(() => {
    const target = [...document.querySelectorAll('a[href]')].find((link) => link.href === ${serialized});
    target?.click();
    return Boolean(target);
  })()`);
  const deadline = Date.now() + DEFAULT_NAVIGATION_WAIT_MS;
  while (Date.now() < deadline) {
    const currentUrl = await evaluate(page, 'location.href');
    if (currentUrl !== beforeUrl) return {navigated: true, url: currentUrl};
    await wait(200);
  }
  await navigate(page, link.href);
  return {navigated: true, url: link.href, fallbackNavigation: true};
}

async function goBack(page, expectedUrl) {
  const beforeUrl = await evaluate(page, 'location.href');
  await evaluate(page, 'history.back()');
  const deadline = Date.now() + DEFAULT_NAVIGATION_WAIT_MS;
  while (Date.now() < deadline) {
    const currentUrl = await evaluate(page, 'location.href');
    if (currentUrl !== beforeUrl && (!expectedUrl || currentUrl === expectedUrl)) {
      await wait(1200);
      return currentUrl;
    }
    await wait(200);
  }
  throw new Error(`Back navigation did not leave ${beforeUrl}.`);
}

async function evaluateExtension(worker, expression) {
  return evaluate(worker, expression, 'extension service worker');
}

async function startTranslation(worker) {
  const generation = ++nextTranslationGeneration;
  const result = await evaluateExtension(worker, `(async () => {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (!tab?.id) throw new Error('No active tab was found.');
    const generation = ${generation};
    const message = {type: 'TRANSLATION_START', generation, activation: 'manual'};
    let lastError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
        return {tabId: tab.id, generation, url: tab.url ?? '', attempts: attempt + 1};
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('Could not reach the Translight content script after 20 attempts: ' +
      (lastError?.message ?? 'unknown error'));
  })()`);
  return result;
}

async function stopTranslation(worker, tabId, generation) {
  if (!tabId) return;
  const expression = `(async () => {
    try {
      await chrome.tabs.sendMessage(${tabId}, {type: 'TRANSLATION_STOP', generation: ${generation}});
      return true;
    } catch {
      return false;
    }
  })()`;
  await evaluateExtension(worker, expression).catch(() => false);
}

function summarizePageSamples(samples, baselineTranslationCount = 0) {
  const translationCounts = samples.map((sample) => sample.translationCount);
  const paths = [...new Set(samples.map((sample) => sample.path).filter(Boolean))];
  const drops = baselineTranslationCount > 0
    ? samples.filter((sample) => sample.translationCount < baselineTranslationCount).length
    : 0;
  return {
    sampleCount: samples.length,
    paths,
    routeChanges: Math.max(paths.length - 1, 0),
    minimumTranslationCount: Math.min(...translationCounts, 0),
    maximumTranslationCount: Math.max(...translationCounts, 0),
    emptyTranslationSamples: samples.filter((sample) => sample.emptyTranslationCount > 0).length,
    translationDropSamples: drops,
    final: samples.at(-1) ?? null
  };
}

function summarizeConsoleResult(result) {
  const summary = {...result};
  if (summary.process) {
    summary.process = {...summary.process};
    delete summary.process.samples;
  }
  if (summary.pageSamples) {
    summary.pageSamples = {...summary.pageSamples};
    delete summary.pageSamples.samples;
  }
  if (Array.isArray(summary.actions)) {
    summary.actionCount = summary.actions.length;
    delete summary.actions;
  }
  return summary;
}

async function runGalleryScenario({page, worker, options, result}) {
  const scenario = result.scenario;
  let translationStart = null;
  let baseline = await readPageStats(page);
  if (!options.skipTranslation) {
    translationStart = await startTranslation(worker);
    result.translationStart = {requested: true, ...translationStart};
    const first = await waitForFirstTranslation(page, options.translationWaitMs);
    result.translationReady = first;
    baseline = first.stats;
  } else {
    result.translationStart = {requested: false};
  }

  const sampler = new PageSampler(page, () => readPageStats(page));
  sampler.start();
  const actions = [];
  for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
    actions.push(...await scrollThroughPage(page, options.settleMs, {label: `gallery-cycle-${cycle}`}));
    actions.push(await scrollToTop(page, options.settleMs));
  }
  const pageSamples = await sampler.stop();
  result.actions = actions;
  result.pageSamples = pageSamples;
  result.pageSummary = summarizePageSamples(pageSamples.samples, baseline.translationCount);
  result.beforeStop = await readPageStats(page);
  if (translationStart) {
    await stopTranslation(worker, translationStart.tabId, translationStart.generation);
    await wait(500);
  }
  result.afterStop = await readPageStats(page);
  result.restoredAfterStop = result.afterStop.translationCount === 0 && result.afterStop.generatedCount === 0;
  result.testPassed = result.pageSummary.routeChanges > 0 &&
    (options.skipTranslation || result.translationReady?.ready === true) &&
    result.pageSummary.emptyTranslationSamples === 0 &&
    (options.skipTranslation || result.restoredAfterStop);
  scenario.completed = true;
}

async function runNavigationScenario({page, worker, options, result}) {
  let translationStart = null;
  result.translationReadyByRoute = [];
  const homeUrl = await evaluate(page, 'location.href');
  const sampler = new PageSampler(page, () => readPageStats(page));
  sampler.start();
  const actions = [];
  if (!options.skipTranslation) {
    translationStart = await startTranslation(worker);
    result.translationStart = {requested: true, ...translationStart};
    result.translationReady = await waitForFirstTranslation(page, options.translationWaitMs);
    result.translationReadyByRoute.push({cycle: 0, phase: 'home', ...result.translationReady});
  } else {
    result.translationStart = {requested: false};
  }
  actions.push(...await scrollThroughPage(page, options.settleMs, {label: 'home'}));
  if (!(await findAndScrollToText(page, 'Latest News'))) {
    throw new Error('Could not find the Latest News section.');
  }
  if (!options.skipTranslation) {
    result.homepageTranslationSettled = await waitForStableTranslations(page, options.translationWaitMs);
  }
  await wait(options.settleMs);
  result.latestNews = await readPageStats(page);
  actions.push(await scrollToTop(page, options.settleMs));

  const link = await findLinkByText(page, 'Star Wars Zero Company');
  if (!link) throw new Error('Could not find a New and Notable link.');
  result.detailLink = link;

  const routes = [];
  for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
    const click = await clickLink(page, link);
    routes.push({cycle, phase: 'detail', url: click.url});
    await wait(1200);
    if (!options.skipTranslation) {
      await stopTranslation(worker, translationStart?.tabId, translationStart?.generation);
      translationStart = await startTranslation(worker);
      const detailReady = await waitForFirstTranslation(page, options.translationWaitMs);
      result.translationReadyByRoute.push({cycle, phase: 'detail', ...detailReady});
    }
    actions.push(...await scrollThroughPage(page, options.settleMs, {label: `detail-cycle-${cycle}`}));
    const returnedUrl = await goBack(page, homeUrl);
    routes.push({cycle, phase: 'home', url: returnedUrl});
    if (!options.skipTranslation) {
      const returnedHomeReady = await waitForFirstTranslation(page, options.translationWaitMs);
      result.translationReadyByRoute.push({cycle, phase: 'home-returned', ...returnedHomeReady});
    }
    await scrollToTop(page, options.settleMs);
    await wait(500);
    if (cycle < options.cycles && !options.skipTranslation) {
      await stopTranslation(worker, translationStart?.tabId, translationStart?.generation);
      translationStart = await startTranslation(worker);
      const homeReady = await waitForFirstTranslation(page, options.translationWaitMs);
      result.translationReadyByRoute.push({cycle, phase: 'home-restarted', ...homeReady});
    }
  }
  const pageSamples = await sampler.stop();
  result.actions = actions;
  result.routes = routes;
  result.pageSamples = pageSamples;
  result.pageSummary = summarizePageSamples(pageSamples.samples);
  result.beforeStop = await readPageStats(page);
  if (translationStart) {
    await stopTranslation(worker, translationStart.tabId, translationStart.generation);
    await wait(500);
  }
  result.afterStop = await readPageStats(page);
  result.restoredAfterStop = result.afterStop.translationCount === 0 && result.afterStop.generatedCount === 0;
  const allTranslationsReady = options.skipTranslation ||
    result.homepageTranslationSettled?.ready === true &&
    result.translationReadyByRoute.every(({ready}) => ready === true);
  result.testPassed = routes.length === options.cycles * 2 && result.pageSummary.routeChanges > 0 &&
    allTranslationsReady && (options.skipTranslation || result.restoredAfterStop);
  result.scenario.completed = true;
}

async function launchChrome(options, port, profileDir) {
  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--enable-automation',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    options.url
  ];
  return spawn(options.chromePath, args, {cwd: REPOSITORY_ROOT, stdio: 'ignore'});
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  options.chromePath = await resolveBrowserPath(options.chromePath);
  assertExtensionCapableBrowser(options.chromePath);
  if (!existsSync(options.chromePath)) throw new Error(`Chrome executable not found: ${options.chromePath}`);
  if (!options.skipBuild) await runCommand('npm', ['run', 'build']);
  if (!existsSync(resolve(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(`Built extension not found at ${EXTENSION_PATH}. Run npm run build first.`);
  }
  await mkdir(options.outputDir, {recursive: true});
  const localServer = await ensureLocalServer(options.url);
  const port = await getFreePort();
  const ownsProfile = !options.profileDir;
  const profileDir = options.profileDir ?? `/private/tmp/translight-chrome-${process.pid}-${Date.now()}`;
  await mkdir(profileDir, {recursive: true});
  const chrome = await launchChrome(options, port, profileDir);
  const processSampler = new ProcessSampler(chrome.pid);
  processSampler.start();
  let page;
  let worker;
  let trace = null;
  let tracingStarted = false;
  const result = {
    runner: 'metacritic-chrome-runner',
    startedAt,
    commit: (await execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: REPOSITORY_ROOT})).stdout.trim(),
    scenario: {name: options.scenario, url: options.url, cycles: options.cycles},
    chrome: {path: options.chromePath, pid: chrome.pid, debuggingPort: port},
    profile: {path: profileDir, temporary: ownsProfile, kept: options.keepProfile || !ownsProfile},
    extension: {path: EXTENSION_PATH, loaded: false},
    outputDir: options.outputDir,
    testPassed: false
  };

  try {
    await waitForDevTools(port);
    const pageTarget = await waitForTarget(port, (target) => target.type === 'page', 15_000, 'a page target');
    page = await connectTarget(pageTarget, 'page');
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Performance.enable');
    const extension = await waitForTranslightWorker(port);
    const extensionTarget = extension.target;
    worker = extension.connection;
    result.extension.loaded = true;
    result.extension.id = new URL(extensionTarget.url).hostname;
    result.extension.workerUrl = extensionTarget.url;
    result.extension.version = extension.manifest.version;
    // The initial URL can finish before Chrome has loaded the unpacked
    // extension. Reload once the worker is visible so the content script is
    // installed in the page we are about to exercise.
    await navigate(page, options.url);
    result.pageReloadedAfterExtensionLoad = true;
    await startTracing(page);
    tracingStarted = true;
    if (options.scenario === 'gallery') {
      await runGalleryScenario({page, worker, options, result});
    } else {
      await runNavigationScenario({page, worker, options, result});
    }
  } catch (error) {
    result.error = {message: error.message, stack: error.stack};
    result.testPassed = false;
    if (page) {
      result.failureStats = await readPageStats(page).catch(() => null);
      await saveScreenshot(page, resolve(options.outputDir, 'failure.png')).catch(() => {});
    }
  } finally {
    if (page && tracingStarted) {
      try {
        trace = await stopTracing(page);
      } catch (error) {
        result.traceError = error.message;
      }
    }
    result.tracePath = resolve(options.outputDir, 'trace.json');
    if (trace != null) await writeFile(result.tracePath, trace);
    result.process = await processSampler.stop();
    worker?.close();
    page?.close();
    if (!options.keepBrowser) {
      chrome.kill('SIGTERM');
      await wait(500);
      if (!chrome.killed) chrome.kill('SIGKILL');
    } else chrome.unref?.();
    if (localServer) localServer.kill('SIGTERM');
    if (ownsProfile && !options.keepProfile) {
      await rm(profileDir, {recursive: true, force: true});
    }
    result.finishedAt = new Date().toISOString();
    result.profile.cleaned = ownsProfile && !options.keepProfile;
    await writeFile(resolve(options.outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(JSON.stringify(summarizeConsoleResult(result), null, 2));
  if (!result.testPassed) process.exitCode = 1;
}

main().catch((error) => {
  const prefix = error instanceof ValidationBlockedError ? 'validation blocked: ' : '';
  console.error(`${prefix}${error.stack ?? error.message}`);
  process.exitCode = error instanceof ValidationBlockedError ? 2 : 1;
});
