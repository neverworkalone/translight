// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  GENERATED_ATTRIBUTE,
  PRESENTATION_HASH_ATTRIBUTE,
  REPLACED_ATTRIBUTE,
  REPLACEMENT_TEXT_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  SOURCE_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  STYLED_REPLACEMENT_ATTRIBUTE,
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

  it('replaces the source text for replacement modes and restores it on cleanup', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'mode-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });
    renderer.insert({element: source, sourceId: 'mode-source', sourceHash: 'hash-1', translatedText: '번역'});

    expect(source.textContent).toBe('번역');
    expect(source.getAttribute(REPLACED_ATTRIBUTE)).toBe('true');
    expect(source.hasAttribute(STYLED_REPLACEMENT_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute('data-translight-style')).toBe(false);
    expect(source.getAttribute(SOURCE_HASH_ATTRIBUTE)).toBe('hash-1');
    expect(source.getAttribute(PRESENTATION_HASH_ATTRIBUTE)).toBeTruthy();
    expect(document.body.querySelector('translight-translation')).toBeNull();

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL});
    expect(source.textContent).toBe('번역');
    expect(document.body.firstElementChild).toBe(source);
    expect(document.body.lastElementChild?.tagName.toLowerCase()).toBe('translight-translation');
    expect(document.body.lastElementChild?.textContent).toBe('Original text');
    expect(document.body.lastElementChild?.hasAttribute('data-translight-style')).toBe(false);

    renderer.updatePresentation({displayStyle: TRANSLATION_STYLES.DOTTED_BORDER, bold: true, italic: true});
    expect(source.getAttribute(STYLED_REPLACEMENT_ATTRIBUTE)).toBe('true');
    expect(source.getAttribute('data-translight-style')).toBe(TRANSLATION_STYLES.DOTTED_BORDER);
    expect(source.querySelector(`[${REPLACEMENT_TEXT_ATTRIBUTE}="true"]`).getAttribute('data-translight-style'))
      .toBe(TRANSLATION_STYLES.DOTTED_BORDER);
    expect(document.body.lastElementChild.hasAttribute('data-translight-style')).toBe(false);
    expect(renderer.style.textContent).toContain('font-weight: 700');
    expect(renderer.style.textContent).toContain('font-style: italic');
    expect(renderer.style.textContent).toContain('font-synthesis: style !important');
    expect(renderer.style.textContent).toContain(
      'translight-translation[data-translight-session-id="mode-session"]:not([data-translight-role="original"])[data-translight-style="dotted-border"]'
    );

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION});
    expect(source.textContent).toBe('Original text');
    expect(document.body.lastElementChild?.textContent).toBe('번역');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
  });

  it('keeps highlight backgrounds at text height with half-size mini highlight padding', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'highlight-session'});
    renderer.insert({element: source, sourceId: 'highlight-source', translatedText: 'Highlighted text'});

    renderer.updatePresentation({displayStyle: TRANSLATION_STYLES.HIGHLIGHT});
    expect(document.querySelector('[data-translight-text="true"]')).not.toBeNull();
    expect(renderer.style.textContent).toContain('padding: 0 0.12em !important');
    expect(renderer.style.textContent).toContain('box-decoration-break: clone !important');
    expect(renderer.style.textContent).toContain('line-height: 1 !important');

    renderer.updatePresentation({displayStyle: TRANSLATION_STYLES.MINI_HIGHLIGHT});
    expect(renderer.style.textContent).toContain('padding: 0 0.06em !important');
    expect(renderer.style.textContent).toContain(
      'linear-gradient(to bottom, transparent 50%, var(--translight-style-color) 50%)'
    );
    renderer.removeAll();
  });

  it('keeps replacement-mode highlights on translated text instead of the whole source block', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'replacement-highlight-session',
      settings: {
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL,
        displayStyle: TRANSLATION_STYLES.HIGHLIGHT
      }
    });

    renderer.insert({element: source, sourceId: 'replacement-highlight-source', translatedText: '번역문'});

    const replacementText = source.querySelector(`[${REPLACEMENT_TEXT_ATTRIBUTE}="true"]`);
    expect(replacementText?.textContent).toBe('번역문');
    expect(replacementText?.getAttribute('data-translight-style')).toBe(TRANSLATION_STYLES.HIGHLIGHT);
    expect(source.getAttribute('data-translight-style')).toBe(TRANSLATION_STYLES.HIGHLIGHT);

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

    expect(mixed.getAttribute(REPLACED_ATTRIBUTE)).toBe('true');
    expect(mixed.firstChild?.textContent).toBe('Direct translation.');
    expect(nested.textContent).toBe('Nested translation.');
    expect(mixed.querySelectorAll('translight-translation')).toHaveLength(0);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<div id="mixed">Direct text.<p id="nested">Nested text.</p></div>');
  });

  it('keeps translations inside table cells in original-translation mode', () => {
    document.body.innerHTML = '<table><tbody><tr><td id="cell">Original cell</td></tr></tbody></table>';
    const cell = document.querySelector('#cell');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'table-session',
      settings: {translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION}
    });

    renderer.insert({
      element: cell,
      sourceId: 'table-source',
      sourceHash: 'table-hash',
      translatedText: 'Translated cell'
    });

    const translation = cell.querySelector('translight-translation');
    expect(translation?.parentElement).toBe(cell);
    expect(cell.closest('tr')?.querySelectorAll(':scope > td')).toHaveLength(1);
    expect(translation?.textContent).toBe('Translated cell');
    expect(renderer.style.textContent).toContain('td > translight-translation');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<table><tbody><tr><td id="cell">Original cell</td></tr></tbody></table>');
  });

  it.each(Object.values(TRANSLATION_STYLES))('applies and removes the %s style', (displayStyle) => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: `style-${displayStyle}`});

    renderer.insert({element: source, sourceId: `style-${displayStyle}`, translatedText: 'Styled translation'});
    renderer.updatePresentation({displayStyle});

    expect(document.querySelector('translight-translation').getAttribute('data-translight-style'))
      .toBe(displayStyle);
    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
  });

  it('replaces only the table cell text in translation-only mode', () => {
    document.body.innerHTML = '<table><tbody><tr><th id="cell">Original heading</th></tr></tbody></table>';
    const cell = document.querySelector('#cell');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'table-only-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });

    renderer.insert({
      element: cell,
      sourceId: 'table-only-source',
      sourceHash: 'table-only-hash',
      translatedText: 'Translated heading'
    });

    expect(cell.textContent).toBe('Translated heading');
    expect(cell.querySelector('translight-translation')).toBeNull();
    expect(cell.closest('tr')?.querySelectorAll(':scope > th')).toHaveLength(1);
    expect(cell.hasAttribute('data-translight-style')).toBe(false);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<table><tbody><tr><th id="cell">Original heading</th></tr></tbody></table>');
  });
});
