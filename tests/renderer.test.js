// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  GENERATED_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  SOURCE_ATTRIBUTE,
  TRANSLATED_ATTRIBUTE,
  TranslationRenderer
} from '../src/content/translation-renderer.js';

describe('TranslationRenderer', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<p id="source">Original text</p>';
  });

  it('inserts a translate=no node without changing original text', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({ document, sessionId: 'session-1' });
    const translation = renderer.insert({
      element: source,
      sourceId: 'source-1',
      translatedText: '원문 번역'
    });

    expect(source.textContent).toBe('Original text');
    expect(translation.tagName.toLowerCase()).toBe('translight-translation');
    expect(translation.getAttribute('translate')).toBe('no');
    expect(translation.getAttribute(GENERATED_ATTRIBUTE)).toBe('true');
    expect(translation.getAttribute(SOURCE_ATTRIBUTE)).toBe('source-1');
    expect(source.getAttribute(TRANSLATED_ATTRIBUTE)).toBe('true');
    expect(source.getAttribute(SESSION_ATTRIBUTE)).toBe('session-1');
  });

  it('prevents duplicate insertion and completely restores the DOM on cleanup', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({ document, sessionId: 'session-2' });
    const first = renderer.insert({ element: source, sourceId: 'source-2', translatedText: '첫 번역' });
    const second = renderer.insert({ element: source, sourceId: 'source-2', translatedText: '두 번역' });

    expect(second).toBe(first);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);

    renderer.removeAll();

    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
    expect(document.querySelector('style')).toBeNull();
    expect(source.hasAttribute(SOURCE_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute(TRANSLATED_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute(SESSION_ATTRIBUTE)).toBe(false);
  });
});
