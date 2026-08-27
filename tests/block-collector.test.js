// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectTranslationBlocks,
  hasVisibleBlockDescendant,
  resetSourceSequence
} from '../src/content/block-collector.js';
import {hashSourceText} from '../src/content/translation-queue.js';

describe('collectTranslationBlocks', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
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

  it('does not collect standalone handles as translatable blocks', () => {
    document.body.innerHTML = `
      <div id="handle">@dreyaleigh</div>
      <p>WOW. The intro preview shots are remarkable!</p>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'WOW. The intro preview shots are remarkable!'
    ]);
  });

  it('treats a marked node as fresh when its renderer record is gone', () => {
    document.body.innerHTML = `
      <p
        data-translight-source-id="stale-source"
        data-translight-source-hash="stale-hash"
        data-translight-session-id="old-session"
      >Freshly rendered content.</p>
    `;

    const blocks = collectTranslationBlocks(document.body, {
      isActiveSource: () => false
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Freshly rendered content.');
    expect(blocks[0].sourceId).not.toBe('stale-source');
  });

  it('ignores visually hidden accessibility text in page layout blocks', () => {
    document.head.innerHTML = `
      <style>
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
      </style>
    `;
    document.body.innerHTML = `
      <div id="header" style="display:flex">
        <div id="menu"><a href="#"><span class="sr-only">Open menu</span></a></div>
        <div id="search"><span class="sr-only">Search or jump to...</span></div>
      </div>
      <div id="content">
        <span class="sr-only">Screen reader context</span>
        <span>Visible article text.</span>
      </div>
      <h2 class="sr-only">Navigation Menu</h2>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text))
      .toEqual(['Visible article text.']);
  });

  it('stops visible nested-block checks after the first visible candidate', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    let visited = 0;
    const descendants = {
      *[Symbol.iterator]() {
        visited += 1;
        yield first;
        visited += 1;
        yield second;
      }
    };
    const root = {querySelectorAll: () => descendants};

    expect(hasVisibleBlockDescendant(root)).toBe(true);
    expect(visited).toBe(1);
  });

  it('does not check visibility for excluded segment descendants', () => {
    const root = document.createElement('div');
    root.innerHTML = Array.from({length: 100}, (_, index) =>
      `<span data-translight-segment="true">Segment ${index}</span>`
    ).join('');
    document.body.appendChild(root);
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');

    try {
      expect(hasVisibleBlockDescendant(
        root,
        undefined,
        (descendant) => !descendant.matches('[data-translight-segment="true"]')
      )).toBe(false);
      expect(getComputedStyleSpy).not.toHaveBeenCalled();
    } finally {
      getComputedStyleSpy.mockRestore();
    }
  });

  it('does not re-collect text that the renderer has replaced for presentation', () => {
    document.body.innerHTML = `
      <p
        data-translight-source-id="source-1"
        data-translight-source-hash="source-hash"
        data-translight-presentation-hash="${hashSourceText('Presented translation')}"
      >Presented translation</p>
    `;

    expect(collectTranslationBlocks(document.body)).toEqual([]);
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

  it('collects direct text from semantic sections such as a Craigslist posting body', () => {
    document.body.innerHTML = `
      <section id="postingbody">
        <div class="print-information" hidden>
          <p>QR Code Link to This Post</p>
        </div>
        <br>
        Are you a player looking to join a long established team in Korea?<br>
        <br>
        We have been running since 2011 and are looking for new players for our upcoming league season.<br>
        <br>
        Get in touch with your Kakao ID or phone number.
      </section>
    `;

    const body = document.querySelector('#postingbody');
    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'Are you a player looking to join a long established team in Korea?',
      'We have been running since 2011 and are looking for new players for our upcoming league season.',
      'Get in touch with your Kakao ID or phone number.'
    ]);
    expect(blocks.every(({element}) => element.parentElement === body)).toBe(true);
  });

  it('anchors mixed direct-text segments around nested blocks in document order', () => {
    document.body.innerHTML = `
      <div id="mixed">
        <h2>Section heading</h2>
        First paragraph.<div><br></div>
        Second paragraph.<p>Nested block.</p>Third paragraph.
      </div>
    `;

    const mixed = document.querySelector('#mixed');
    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'Section heading',
      'First paragraph.',
      'Second paragraph.',
      'Nested block.',
      'Third paragraph.'
    ]);
    expect(blocks.filter(({element}) => element.matches('[data-translight-segment="true"]')))
      .toHaveLength(3);
    expect(mixed.innerHTML).toContain(
      '<h2>Section heading</h2><span data-translight-segment="true"'
    );
    expect(mixed.querySelector('p')?.previousElementSibling?.matches('[data-translight-segment="true"]'))
      .toBe(true);
    expect(mixed.lastElementChild?.matches('[data-translight-segment="true"]')).toBe(true);
  });

  it('splits direct text paragraphs separated by double line breaks', () => {
    document.body.innerHTML = `
      <div id="guide">
        First paragraph with a <a href="#first">link</a>.<br><br>
        Second paragraph with an <strong>inline label</strong>.
      </div>
    `;

    const guide = document.querySelector('#guide');
    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'First paragraph with a link.',
      'Second paragraph with an inline label.'
    ]);
    expect(blocks.every(({element}) => element.parentElement === guide)).toBe(true);
    expect(guide.querySelectorAll('[data-translight-segment="true"]')).toHaveLength(2);
    expect(collectTranslationBlocks(document.body).map((block) => block.sourceId))
      .toEqual(blocks.map((block) => block.sourceId));
  });

  it('splits blank-line paragraphs inside a nested YouTube attributed description', () => {
    document.body.innerHTML = `
      <div id="expanded">
        <yt-attributed-string>
          <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">
            <span class="ytAttributedStringLinkInheritColor">First paragraph.\n\nSecond paragraph.\n\nThird paragraph.</span>
            <span class="ytAttributedStringLinkInheritColor"><a href="#chapter">0:00</a> Intro</span>
          </span>
        </yt-attributed-string>
      </div>
    `;

    const expanded = document.querySelector('#expanded');
    const blocks = collectTranslationBlocks(expanded);

    expect(blocks.map((block) => block.text)).toEqual([
      'First paragraph.',
      'Second paragraph.',
      'Third paragraph.'
    ]);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);

    for (const block of blocks) {
      block.element.setAttribute('data-translight-source-id', block.sourceId);
      block.element.setAttribute('data-translight-source-hash', block.sourceHash);
    }
    expect(collectTranslationBlocks(expanded, {isActiveSource: () => true})).toEqual([]);
  });

  it('splits blank-line paragraphs inside a Goodreads formatted review', () => {
    document.body.innerHTML = `
      <div id="review-text">
        <span class="Formatted">First review paragraph has enough English text to translate.<br><br>Second review paragraph has enough English text to translate as well.<br><br>Third review paragraph remains separate from the others.</span>
      </div>
    `;

    const reviewText = document.querySelector('#review-text');
    const formatted = document.querySelector('.Formatted');
    const blocks = collectTranslationBlocks(reviewText);

    expect(blocks.map((block) => block.text)).toEqual([
      'First review paragraph has enough English text to translate.',
      'Second review paragraph has enough English text to translate as well.',
      'Third review paragraph remains separate from the others.'
    ]);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
    expect(blocks.every(({element}) => element.parentElement === formatted)).toBe(true);
    expect(formatted.querySelectorAll('[data-translight-segment="true"]')).toHaveLength(3);
  });

  it('splits Goodreads paragraphs around nested blockquotes', () => {
    document.body.innerHTML = `
      <div id="review-text">
        <span class="Formatted">
          First review paragraph has enough English text to translate.<br><br>
          Second review paragraph has enough English text to translate as well.<br><br>
          <blockquote><em>First quoted paragraph has enough English text to translate.</em></blockquote><br><br>
          Third review paragraph has enough English text to translate too.<br><br>
          <blockquote><br><div><em>Second quoted paragraph has enough English text to translate.</em></div></blockquote><br><br>
          Final review paragraph has enough English text to translate.
        </span>
      </div>
    `;

    const blocks = collectTranslationBlocks(document.querySelector('#review-text'));

    expect(blocks.map((block) => block.text)).toEqual([
      'First review paragraph has enough English text to translate.',
      'Second review paragraph has enough English text to translate as well.',
      'First quoted paragraph has enough English text to translate.',
      'Third review paragraph has enough English text to translate too.',
      'Second quoted paragraph has enough English text to translate.',
      'Final review paragraph has enough English text to translate.'
    ]);
    expect(blocks.filter(({element}) => element.matches('[data-translight-segment="true"]')))
      .toHaveLength(4);
    expect(blocks.some(({text}) => text.includes('First review paragraph') && text.includes('Final review paragraph')))
      .toBe(false);
  });

  it.each([
    ['hidden', '<span hidden>Hidden first paragraph.<br><br>Hidden second paragraph.</span>'],
    ['excluded', '<code>Excluded first paragraph.<br><br>Excluded second paragraph.</code>'],
    ['generated', '<span data-translight-generated="true">Generated first paragraph.<br><br>Generated second paragraph.</span>']
  ])('does not let a %s descendant hide visible Goodreads review paragraphs', (_label, ignoredContent) => {
    document.body.innerHTML = `
      <div id="review-text">
        Visible first paragraph has enough English text.
        ${ignoredContent}
        Visible second paragraph has enough English text.
      </div>
    `;

    const reviewText = document.querySelector('#review-text');
    const ignored = reviewText.querySelector('[hidden],code,[data-translight-generated="true"]');
    const ignoredMarkup = ignored.outerHTML;
    const blocks = collectTranslationBlocks(reviewText);

    expect(blocks.map((block) => block.text)).toEqual([
      'Visible first paragraph has enough English text. Visible second paragraph has enough English text.'
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].element).toBe(reviewText);
    expect(ignored.outerHTML).toBe(ignoredMarkup);
    expect(ignored.querySelector('[data-translight-segment="true"]')).toBeNull();
  });

  it('keeps source coverage across sibling formatted review containers and unsplit surrounding text', () => {
    document.body.innerHTML = '<div id="review-text">Introductory review text has enough English words.<span class="Formatted">First review paragraph has enough English text.<br><br>Second review paragraph has enough English text.</span><span class="Formatted">Third review paragraph has enough English text.<br><br>Fourth review paragraph has enough English text.</span>Concluding review text has enough English words.</div>';

    const reviewText = document.querySelector('#review-text');
    const blocks = collectTranslationBlocks(reviewText);
    const secondPass = collectTranslationBlocks(reviewText);

    expect(blocks.map((block) => block.text)).toEqual([
      'Introductory review text has enough English words.',
      'First review paragraph has enough English text.',
      'Second review paragraph has enough English text.',
      'Third review paragraph has enough English text.',
      'Fourth review paragraph has enough English text.',
      'Concluding review text has enough English words.'
    ]);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
    expect(secondPass.map((block) => block.text)).toEqual(blocks.map((block) => block.text));
  });

  it('keeps source coverage through nested inline wrappers around formatted paragraphs', () => {
    document.body.innerHTML = '<div id="review-text"><span class="outer-one">Introductory outer text has enough English words.<span class="outer-two">Introductory inner text has enough English words.<span class="Formatted">First review paragraph has enough English text.<br><br>Second review paragraph has enough English text.</span>Concluding inner text has enough English words.</span>Concluding outer text has enough English words.</span></div>';

    const reviewText = document.querySelector('#review-text');
    const blocks = collectTranslationBlocks(reviewText);
    const secondPass = collectTranslationBlocks(reviewText);

    expect(blocks.map((block) => block.text)).toEqual([
      'Introductory outer text has enough English words.',
      'Introductory inner text has enough English words.',
      'First review paragraph has enough English text.',
      'Second review paragraph has enough English text.',
      'Concluding inner text has enough English words.',
      'Concluding outer text has enough English words.'
    ]);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
    expect(secondPass.map((block) => block.text)).toEqual(blocks.map((block) => block.text));
  });

  it('collects plain table cells without collecting the table row', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Column heading</th></tr></thead>
        <tbody><tr><td>First cell</td><td>Second cell</td></tr></tbody>
      </table>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'Column heading',
      'First cell',
      'Second cell'
    ]);
  });

  it('splits table-cell paragraphs without moving them out of the cell', () => {
    document.body.innerHTML = `
      <table><tbody><tr><td id="cell">First cell paragraph.<br><br>Second cell paragraph.</td></tr></tbody></table>
    `;

    const cell = document.querySelector('#cell');
    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'First cell paragraph.',
      'Second cell paragraph.'
    ]);
    expect(blocks.every(({element}) => element.parentElement === cell)).toBe(true);
  });

  it('filters localized UI blocks while keeping English content under a Korean root', () => {
    document.documentElement.lang = 'ko-KR';
    document.body.lang = 'ko-KR';
    document.body.innerHTML = `
      <header lang="ko"><p>검색하고 설정을 확인하세요.</p></header>
      <article>
        <h1>English post title</h1>
        <p>English post content that should be translated.</p>
      </article>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'English post title',
      'English post content that should be translated.'
    ]);

    document.documentElement.removeAttribute('lang');
    document.body.removeAttribute('lang');
  });
});
