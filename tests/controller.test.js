import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController
} from '../src/content/controller.js';

function makeRuntime() {
  const listeners = [];
  return {
    listeners,
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      }
    },
    sendMessage() {
      return Promise.resolve();
    }
  };
}

afterEach(() => {
  delete globalThis[CONTENT_CONTROLLER_KEY];
  delete globalThis[DOCUMENT_TOKEN_KEY];
});

describe('content controller initialization', () => {
  it('registers one listener and one session across duplicate injections', async () => {
    const runtime = makeRuntime();
    const sessions = [];
    const createSession = (options) => {
      const session = {
        generation: options.generation,
        start: () => Promise.resolve(),
        stop: () => {},
        applyRouteDecision: vi.fn()
      };
      sessions.push(session);
      return session;
    };

    const first = installContentController({ runtime, createSession });
    const second = installContentController({ runtime, createSession });

    expect(second).toBe(first);
    expect(runtime.listeners).toHaveLength(1);
    await runtime.listeners[0]({ type: 'TRANSLATION_START', generation: 1 }, {}, () => {});
    expect(sessions).toHaveLength(1);
    runtime.listeners[0]({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 1,
      continueTranslation: true,
      documentToken: first.documentToken
    }, {}, () => {});
    expect(sessions[0].applyRouteDecision).toHaveBeenCalledWith(expect.objectContaining({
      routeGeneration: 1,
      continueTranslation: true
    }));
  });

  it('does not stop a session belonging to a different document', async () => {
    const runtime = makeRuntime();
    const sessions = [];
    const createSession = (options) => {
      const session = {
        generation: options.generation,
        start: () => Promise.resolve(),
        stop: vi.fn(),
        applyRouteDecision: vi.fn()
      };
      sessions.push(session);
      return session;
    };

    const controller = installContentController({runtime, createSession});
    await runtime.listeners[0]({
      type: 'TRANSLATION_START',
      generation: 6,
      documentToken: 'a-different-document'
    }, {}, () => {});
    expect(sessions).toHaveLength(0);

    await runtime.listeners[0]({
      type: 'TRANSLATION_START',
      generation: 7,
      documentToken: controller.documentToken
    }, {}, () => {});
    const session = sessions[0];
    session.stop.mockClear();

    runtime.listeners[0]({
      type: 'TRANSLATION_STOP',
      generation: 7,
      documentToken: 'a-different-document'
    }, {}, () => {});

    expect(session.stop).not.toHaveBeenCalled();
    expect(controller.currentSession).toBe(session);

    runtime.listeners[0]({
      type: 'TRANSLATION_ROUTE',
      routeGeneration: 2,
      continueTranslation: true,
      documentToken: 'a-different-document'
    }, {}, () => {});
    expect(session.applyRouteDecision).not.toHaveBeenCalled();
  });
});
