// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  GENERATED_ATTRIBUTE,
  HIDDEN_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  SOURCE_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  TRANSLATED_ATTRIBUTE,
  TranslationRenderer
} from '../src/content/translation-renderer.js';
import {TRANSLATION_MODES, TRANSLATION_STYLES} from '../src/settings.js';

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
      translatedText: 'Translated original'
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
    const first = renderer.insert({ element: source, sourceId: 'source-2', translatedText: 'First translation' });
    const second = renderer.insert({ element: source, sourceId: 'source-2', translatedText: 'Second translation' });

    expect(second).toBe(first);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);

    renderer.removeAll();

    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
    expect(document.querySelector('style')).toBeNull();
    expect(source.hasAttribute(SOURCE_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute(TRANSLATED_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute(SESSION_ATTRIBUTE)).toBe(false);
  });

  it('does not duplicate a source element when a re-scan assigns a new source id', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({ document, sessionId: 'rescan-session' });
    const first = renderer.insert({
      element: source,
      sourceId: 'source-before-rescan',
      translatedText: 'First translation'
    });
    const second = renderer.insert({
      element: source,
      sourceId: 'source-after-rescan',
      translatedText: 'Updated translation'
    });

    expect(second).toBe(first);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    expect(second.textContent).toBe('Updated translation');
    expect(source.getAttribute(SOURCE_ATTRIBUTE)).toBe('source-after-rescan');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
  });

  it('keeps list items structurally inside their list', () => {
    document.body.innerHTML = '<ul><li id="source">List item</li></ul>';
    const source = document.querySelector('#source');
    const list = source.parentElement;
    const renderer = new TranslationRenderer({ document, sessionId: 'list-session' });

    renderer.insert({ element: source, sourceId: 'list-source', translatedText: 'List item translation' });

    expect(list.children).toHaveLength(1);
    expect(source.querySelector('translight-translation').textContent).toBe('List item translation');
    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<ul><li id="source">List item</li></ul>');
  });

  it.each(['flex', 'grid'])('does not create a second %s item for a layout child', (display) => {
    document.body.innerHTML = `<div id="layout" style="display:${display}"><div id="source">Layout child</div></div>`;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({ document, sessionId: `${display}-session` });

    renderer.insert({ element: source, sourceId: `${display}-source`, translatedText: 'Layout child translation' });

    expect(layout.children).toHaveLength(1);
    expect(source.querySelector('translight-translation').textContent).toBe('Layout child translation');
    renderer.removeAll();
    expect(document.body.innerHTML).toBe(
      `<div id="layout" style="display:${display}"><div id="source">Layout child</div></div>`
    );
  });

  it('reorders or hides original text without retranslating and restores it on cleanup', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'mode-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });
    renderer.insert({element: source, sourceId: 'mode-source', sourceHash: 'hash-1', translatedText: '번역'});

    expect(source.hasAttribute(HIDDEN_ATTRIBUTE)).toBe(true);
    expect(source.getAttribute(SOURCE_HASH_ATTRIBUTE)).toBe('hash-1');
    expect(document.body.querySelector('translight-translation').textContent).toBe('번역');

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL});
    expect(source.hasAttribute(HIDDEN_ATTRIBUTE)).toBe(false);
    expect(document.body.firstElementChild?.tagName.toLowerCase()).toBe('translight-translation');

    renderer.updatePresentation({displayStyle: TRANSLATION_STYLES.DOTTED_BORDER, bold: true, italic: true});
    expect(document.body.firstElementChild.getAttribute('data-translight-style')).toBe(TRANSLATION_STYLES.DOTTED_BORDER);
    expect(renderer.style.textContent).toContain('font-weight: 700');
    expect(renderer.style.textContent).toContain('font-style: italic');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
  });

  it('keeps mixed parent and nested block translations visible in translation-only mode', () => {
    document.body.innerHTML = '<div id="mixed">Direct text.<p id="nested">Nested text.</p></div>';
    const mixed = document.querySelector('#mixed');
    const nested = document.querySelector('#nested');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'mixed-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });

    renderer.insert({
      element: mixed,
      sourceId: 'mixed-source',
      sourceHash: 'mixed-hash',
      mixedContent: true,
      translatedText: 'Direct translation.'
    });
    renderer.insert({
      element: nested,
      sourceId: 'nested-source',
      sourceHash: 'nested-hash',
      translatedText: 'Nested translation.'
    });

    expect(mixed.getAttribute('data-translight-hidden-placement')).toBe('mixed');
    expect(mixed.querySelector('translight-translation').textContent).toBe('Direct translation.');
    expect(mixed.querySelectorAll('translight-translation')).toHaveLength(2);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<div id="mixed">Direct text.<p id="nested">Nested text.</p></div>');
  });
});
