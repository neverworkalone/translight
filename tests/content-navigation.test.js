// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController
} from '../src/content/controller.js';

afterEach(() => {
  vi.useRealTimers();
  delete globalThis[CONTENT_CONTROLLER_KEY];
  delete globalThis[DOCUMENT_TOKEN_KEY];
});

describe('content navigation notifications', () => {
  it('reports same-document hash navigation to the background', async () => {
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };

    const controller = installContentController({runtime});
    controller.currentSession = {
      isNavigationWatching: () => true,
      beginRouteChange: vi.fn()
    };
    history.pushState({}, '', '#Types');
    controller.navigationHandler();

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_NAVIGATION',
      previousUrl: `${location.origin}/wiki/Well-being`,
      currentUrl: `${location.origin}/wiki/Well-being#Types`,
      url: `${location.origin}/wiki/Well-being#Types`,
      documentToken: expect.any(String),
      routeGeneration: 1
    });
    expect(controller.currentSession.beginRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({routeGeneration: 1})
    );
    expect(controller.navigationHandler()).toBe(false);
  });

  it('reports its current location when automatic rules are refreshed', async () => {
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    let listener;
    const runtime = {
      onMessage: {
        addListener(next) {
          listener = next;
        }
      },
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };

    installContentController({runtime});
    listener({type: 'TRANSLATION_RULES_CHANGED'}, {}, () => {});
    await Promise.resolve();

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_RULES_CHANGED',
      documentToken: expect.any(String),
      url: `${location.origin}/wiki/Well-being`
    });
  });

  it('uses the session-scoped fallback watcher for pushState without patching history', () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/wiki/Well-being');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const controller = installContentController({runtime});
    const session = {
      isNavigationWatching: () => true,
      beginRouteChange: vi.fn()
    };
    controller.currentSession = session;
    controller.startNavigationWatcher(session);

    history.pushState({}, '', '/wiki/Well-being#Types');
    vi.advanceTimersByTime(499);
    expect(messages.filter(({type}) => type === 'CONTENT_NAVIGATION')).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_NAVIGATION',
      previousUrl: `${location.origin}/wiki/Well-being`,
      currentUrl: `${location.origin}/wiki/Well-being#Types`,
      routeGeneration: 1
    });
    controller.stopNavigationWatcher();
    vi.useRealTimers();
  });

  it('keeps a cached session and sends a resume handshake on pageshow', () => {
    history.replaceState({}, '', '/questions');
    const messages = [];
    const runtime = {
      onMessage: {addListener() {}},
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    };
    const controller = installContentController({runtime});
    const session = {
      isNavigationWatching: () => true,
      stop: vi.fn()
    };
    controller.currentSession = session;

    controller.pageLifecycleHandler({persisted: true});
    expect(session.stop).not.toHaveBeenCalled();

    controller.pageShowHandler({persisted: true});
    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_READY',
      documentToken: expect.any(String),
      url: `${location.origin}/questions`,
      resume: true,
      contentSessionActive: true
    });
    controller.stopNavigationWatcher();
  });
});
