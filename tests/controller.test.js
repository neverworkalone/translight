import { afterEach, describe, expect, it } from 'vitest';
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
        stop: () => {}
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
  });
});
