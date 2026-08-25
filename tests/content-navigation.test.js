// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_CONTROLLER_KEY,
  DOCUMENT_TOKEN_KEY,
  installContentController
} from '../src/content/controller.js';

afterEach(() => {
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

    installContentController({runtime});
    history.pushState({}, '', '#Types');
    await Promise.resolve();

    expect(messages.at(-1)).toMatchObject({
      type: 'CONTENT_NAVIGATION',
      url: `${location.origin}/wiki/Well-being#Types`
    });
  });
});
