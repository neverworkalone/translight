// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  GENERATED_ATTRIBUTE,
  HIDDEN_ATTRIBUTE,
  HIDDEN_PLACEMENT_ATTRIBUTE,
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
import {collectTranslationBlocks, SEGMENT_ATTRIBUTE} from '../src/content/block-collector.js';
import {TRANSLATION_MODES, TRANSLATION_STYLES} from '../src/settings.js';
import {hashSourceText} from '../src/content/translation-queue.js';

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

  it('protects generated text from host list-item span styles', () => {
    document.head.innerHTML = `
      <style>
        .tableofcontents li span {
          position: absolute;
          height: 12px;
          width: 14px;
          margin: 8px;
          overflow: hidden;
          white-space: nowrap;
        }
      </style>
    `;
    document.body.innerHTML = '<ul class="tableofcontents"><li id="source">Roadmap</li></ul>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({ document, sessionId: 'host-style-session' });

    renderer.insert({ element: source, sourceId: 'host-style-source', translatedText: '로드맵' });

    const generatedText = source.querySelector('[data-translight-text="true"]');
    const computedStyle = window.getComputedStyle(generatedText);
    expect(computedStyle.position).toBe('static');
    expect(computedStyle.width).toBe('auto');
    expect(computedStyle.height).toBe('auto');
    expect(computedStyle.margin).toBe('0px');
    expect(computedStyle.display).toBe('inline');
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
    expect(source.hasAttribute('data-translight-style')).toBe(false);
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
    expect(source.hasAttribute('data-translight-style')).toBe(false);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<p id="source">Original text</p>');
  });

  it('preserves inline text nodes and re-translates changed inline content', () => {
    document.body.innerHTML = '<p id="source">Visit <a href="https://openai.com">OpenAI</a> docs</p>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'inline-session',
      settings: {
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL,
        displayStyle: TRANSLATION_STYLES.HIGHLIGHT
      }
    });

    renderer.insert({
      element: source,
      sourceId: 'inline-source',
      sourceHash: hashSourceText('Visit OpenAI docs'),
      translatedText: '오픈AI 방문'
    });

    expect(source.querySelector('a')?.textContent).not.toBe('OpenAI');
    expect(source.textContent).toBe('오픈AI 방문');
    expect(source.querySelector(`[${REPLACEMENT_TEXT_ATTRIBUTE}="true"]`)).not.toBeNull();
    expect(source.querySelector('a')?.textContent).not.toBe('');

    source.querySelector('a').textContent = 'OpenAI team';
    renderer.restoreChangedSources();
    const changedBlock = collectTranslationBlocks(document.body).find((block) => block.element === source);
    expect(changedBlock?.text).toBe('Visit OpenAI team docs');

    renderer.insert({...changedBlock, translatedText: '오픈AI 팀 방문'});
    expect(source.querySelector('a')?.textContent).not.toBe('OpenAI team');
    expect(source.textContent).toBe('오픈AI 팀 방문');
    expect([...source.querySelectorAll(`[${REPLACEMENT_TEXT_ATTRIBUTE}="true"]`)]
      .map((node) => node.textContent).join('')).toBe('오픈AI 팀 방문');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(
      '<p id="source">Visit <a href="https://openai.com">OpenAI team</a> docs</p>'
    );
  });

  it('falls back without emptying inline nodes when translation is too short to distribute', () => {
    document.body.innerHTML = '<p id="source"><a href="https://example.com">Open</a> or <em>close</em></p>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'short-inline-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });

    renderer.insert({
      element: source,
      sourceId: 'short-inline-source',
      sourceHash: hashSourceText('Open or close'),
      translatedText: '번역'
    });

    expect(source.textContent).toBe('Open or close');
    expect(source.querySelector('a')?.textContent).toBe('Open');
    expect(source.querySelector('em')?.textContent).toBe('close');
    expect(source.hasAttribute(REPLACED_ATTRIBUTE)).toBe(false);
    expect(source.getAttribute(HIDDEN_ATTRIBUTE)).toBe('true');
    expect(source.hasAttribute(HIDDEN_PLACEMENT_ATTRIBUTE)).toBe(false);
    expect(document.querySelector('translight-translation')?.textContent).toBe('번역');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(
      '<p id="source"><a href="https://example.com">Open</a> or <em>close</em></p>'
    );
  });

  it('keeps translation-original order when a short translation cannot be distributed', () => {
    document.body.innerHTML = '<p id="source"><a href="https://example.com">Open</a> or <em>close</em></p>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'short-inline-original-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL}
    });

    renderer.insert({
      element: source,
      sourceId: 'short-inline-original-source',
      sourceHash: hashSourceText('Open or close'),
      translatedText: '번역'
    });

    const translation = document.querySelector('translight-translation');
    expect(document.body.firstElementChild).toBe(translation);
    expect(document.body.lastElementChild).toBe(source);
    expect(translation?.textContent).toBe('번역');
    expect(source.textContent).toBe('Open or close');
    expect(source.querySelector('a')?.textContent).toBe('Open');
    expect(source.querySelector('em')?.textContent).toBe('close');
    expect(source.hasAttribute(REPLACED_ATTRIBUTE)).toBe(false);
    expect(source.hasAttribute(HIDDEN_ATTRIBUTE)).toBe(false);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(
      '<p id="source"><a href="https://example.com">Open</a> or <em>close</em></p>'
    );
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

  it('places direct-text paragraph translations at each paragraph boundary', () => {
    document.body.innerHTML = '<div id="guide">First paragraph.<br><br>Second paragraph.</div>';
    const guide = document.querySelector('#guide');
    const blocks = collectTranslationBlocks(document.body);
    const renderer = new TranslationRenderer({document, sessionId: 'segment-session'});

    blocks.forEach((block, index) => renderer.insert({
      ...block,
      translatedText: `Translated paragraph ${index + 1}`
    }));

    const translations = [...guide.querySelectorAll('translight-translation')];
    expect(translations).toHaveLength(2);
    expect(translations[0].previousElementSibling).toBe(blocks[0].element);
    expect(translations[1].previousElementSibling).toBe(blocks[1].element);
    expect(guide.querySelectorAll(`[${SEGMENT_ATTRIBUTE}="true"]`)).toHaveLength(2);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<div id="guide">First paragraph.<br><br>Second paragraph.</div>');
  });

  it.each(Object.values(TRANSLATION_STYLES))('styles only the replacement text in table cells for %s', (displayStyle) => {
    document.body.innerHTML = '<table><tbody><tr><td id="cell">Original cell</td></tr></tbody></table>';
    const cell = document.querySelector('#cell');
    const renderer = new TranslationRenderer({
      document,
      sessionId: `table-replacement-${displayStyle}`,
      settings: {
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL,
        displayStyle
      }
    });

    renderer.insert({
      element: cell,
      sourceId: `table-replacement-${displayStyle}`,
      sourceHash: `table-replacement-hash-${displayStyle}`,
      translatedText: 'Translated cell'
    });

    const replacement = cell.querySelector(`[${REPLACEMENT_TEXT_ATTRIBUTE}="true"]`);
    if (displayStyle === TRANSLATION_STYLES.NONE) {
      expect(replacement).toBeNull();
    } else {
      expect(replacement?.getAttribute('data-translight-style')).toBe(displayStyle);
    }
    expect(cell.hasAttribute('data-translight-style')).toBe(false);
    expect(cell.getAttribute(STYLED_REPLACEMENT_ATTRIBUTE)).toBe('true');

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
