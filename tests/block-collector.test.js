// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { collectTranslationBlocks, resetSourceSequence } from '../src/content/block-collector.js';

describe('collectTranslationBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetSourceSequence();
  });

  it('collects visible leaf blocks once and keeps document order', () => {
    document.body.innerHTML = `
      <nav><a href="#">Home</a><a href="#">Docs</a><a href="#">About</a></nav>
      <h1>Useful English heading</h1>
      <div class="article"><p>Hello <strong>world</strong>.</p></div>
      <div class="wrapper"><div>Nested leaf content is meaningful.</div></div>
      <pre>const shouldNotTranslate = true;</pre>
      <div hidden>Hidden content</div>
      <div contenteditable="true">Editor content</div>
      <p>!! --</p>
    `;

    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'Useful English heading',
      'Hello world.',
      'Nested leaf content is meaningful.'
    ]);
    expect(new Set(blocks.map((block) => block.sourceId)).size).toBe(3);
  });

  it('does not include generated nodes or source nodes already marked by Translight', () => {
    document.body.innerHTML = `
      <p data-translight-source-id="source-1">Already translated</p>
      <translight-translation data-translight-generated="true">Already translated</translight-translation>
      <p>Fresh paragraph</p>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual(['Fresh paragraph']);
  });

  it('keeps direct parent text when a block child is also present', () => {
    document.body.innerHTML = `
      <div id="mixed">Direct <strong>parent</strong> text.<p>Nested block text.</p></div>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'Direct parent text.',
      'Nested block text.'
    ]);
  });
});
