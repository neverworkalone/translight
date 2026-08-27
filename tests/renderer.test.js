// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(renderer.style.textContent).toContain('overflow-anchor: none !important');
    expect(renderer.style.textContent).not.toContain('html[data-translight-scroll-anchor="none"]');
    expect(document.documentElement.hasAttribute('data-translight-scroll-anchor')).toBe(false);
    renderer.removeAll();
    expect(document.documentElement.hasAttribute('data-translight-scroll-anchor')).toBe(false);
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

  it('places inline-list translations outside a replaceable containing list item', () => {
    document.body.innerHTML = `
      <ul id="awards">
        <li id="card" style="display:flex;flex-wrap:wrap">
          <a href="/awards">Awards</a>
          <div>
            <ul id="inline-list" style="display:inline">
              <li id="source"><span>1 win &amp; 3 nominations total</span></li>
            </ul>
          </div>
        </li>
      </ul>
    `;
    const source = document.querySelector('#source');
    const card = document.querySelector('#card');
    const list = document.querySelector('#awards');
    const renderer = new TranslationRenderer({document, sessionId: 'inline-list-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'inline-list-source',
      sourceHash: hashSourceText(source.textContent),
      translatedText: '총 1개의 우승 및 3개의 후보 지명'
    });

    expect(translation.parentElement).toBe(list);
    expect(translation.previousElementSibling).toBe(card);
    expect(source.querySelector('translight-translation')).toBeNull();
    expect(card.querySelector('translight-translation')).toBeNull();

    renderer.removeAll();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    expect(source.textContent).toBe('1 win & 3 nominations total');
  });

  it('rebinds an inline-list translation after the host replaces its source item', () => {
    document.body.innerHTML = `
      <ul id="awards">
        <li id="card" style="display:flex;flex-wrap:wrap">
          <a href="/awards">Awards</a>
          <div>
            <ul id="inline-list" style="display:inline">
              <li id="source"><span>1 win &amp; 3 nominations total</span></li>
            </ul>
          </div>
        </li>
      </ul>
    `;
    const source = document.querySelector('#source');
    const card = document.querySelector('#card');
    const list = document.querySelector('#awards');
    const renderer = new TranslationRenderer({document, sessionId: 'inline-rebind-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'inline-rebind-source',
      sourceHash: hashSourceText(source.textContent),
      translatedText: '총 1개의 우승 및 3개의 후보 지명'
    });

    const replacementList = document.createElement('ul');
    replacementList.id = 'inline-list';
    replacementList.style.display = 'inline';
    replacementList.innerHTML = '<li id="replacement"><span>1 win &amp; 3 nominations total</span></li>';
    source.parentElement.replaceWith(replacementList);
    const replacement = replacementList.querySelector('#replacement');

    renderer.pruneDisconnected();

    expect(renderer.hasRecord(replacement)).toBe(true);
    expect(translation.isConnected).toBe(true);
    expect(translation.parentElement).toBe(list);
    expect(translation.previousElementSibling).toBe(card);
    expect(replacement.getAttribute(SOURCE_ATTRIBUTE)).toBe('inline-rebind-source');
    expect(replacement.getAttribute(TRANSLATED_ATTRIBUTE)).toBe('true');

    renderer.removeAll();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    expect(replacement.textContent).toBe('1 win & 3 nominations total');
  });

  it('does not bind duplicate inline-list records to the same replacement item', () => {
    document.body.innerHTML = `
      <ul id="awards">
        <li id="card" style="display:flex;flex-wrap:wrap">
          <div>
            <ul id="inline-list" style="display:inline">
              <li id="source-one"><span>1 win &amp; 3 nominations total</span></li>
              <li id="source-two"><span>1 win &amp; 3 nominations total</span></li>
            </ul>
          </div>
        </li>
      </ul>
    `;
    const sourceOne = document.querySelector('#source-one');
    const sourceTwo = document.querySelector('#source-two');
    const renderer = new TranslationRenderer({document, sessionId: 'inline-duplicate-session'});
    renderer.insert({
      element: sourceOne,
      sourceId: 'inline-duplicate-one',
      sourceHash: hashSourceText(sourceOne.textContent),
      translatedText: '총 1개의 우승 및 3개의 후보 지명'
    });
    renderer.insert({
      element: sourceTwo,
      sourceId: 'inline-duplicate-two',
      sourceHash: hashSourceText(sourceTwo.textContent),
      translatedText: '총 1개의 우승 및 3개의 후보 지명'
    });

    const replacementList = document.createElement('ul');
    replacementList.id = 'inline-list';
    replacementList.style.display = 'inline';
    replacementList.innerHTML = `
      <li id="replacement-one"><span>1 win &amp; 3 nominations total</span></li>
      <li id="replacement-two"><span>1 win &amp; 3 nominations total</span></li>
    `;
    document.querySelector('#inline-list').replaceWith(replacementList);
    const replacementOne = replacementList.querySelector('#replacement-one');
    const replacementTwo = replacementList.querySelector('#replacement-two');

    renderer.pruneDisconnected();

    expect(renderer.hasRecord(replacementOne)).toBe(true);
    expect(renderer.hasRecord(replacementTwo)).toBe(true);
    expect(new Set(Array.from(renderer.records.values(), (record) => record.element)).size).toBe(2);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(2);

    renderer.removeAll();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    expect(replacementOne.textContent).toBe('1 win & 3 nominations total');
    expect(replacementTwo.textContent).toBe('1 win & 3 nominations total');
  });

  it('limits recovery to one attempt when a host repeatedly removes a translation', () => {
    document.body.innerHTML = '<ul><li id="source">List item</li></ul>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'rebind-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'rebind-source',
      sourceHash: hashSourceText('List item'),
      translatedText: '목록 항목'
    });

    translation.remove();
    expect(renderer.getMissingTranslations()).toEqual([source]);
    expect(renderer.restoreMissingTranslations({elements: [source]})).toEqual({
      restored: [source],
      invalid: []
    });
    expect(source.querySelector('translight-translation')).toBe(translation);

    translation.remove();
    expect(renderer.getMissingTranslations()).toEqual([]);
    expect(renderer.restoreMissingTranslations({elements: [source]})).toEqual({
      restored: [],
      invalid: []
    });

    renderer.resetRecoveryAttempts();
    expect(renderer.getMissingTranslations()).toEqual([source]);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<ul><li id="source">List item</li></ul>');
  });

  it('does not move a disconnected source record onto a new element', () => {
    document.body.innerHTML = '<ul><li id="source">List item</li></ul>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'disconnected-session'});
    renderer.insert({
      element: source,
      sourceId: 'disconnected-source',
      sourceHash: hashSourceText('List item'),
      translatedText: '목록 항목'
    });

    const replacement = document.createElement('li');
    replacement.id = 'source';
    replacement.textContent = 'List item';
    source.replaceWith(replacement);
    renderer.pruneDisconnected();

    expect(renderer.hasRecord(replacement)).toBe(false);
    expect(replacement.querySelector('translight-translation')).toBeNull();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);

    renderer.removeAll();
    expect(document.body.innerHTML).toBe('<ul><li id="source">List item</li></ul>');
  });

  it('does not reattach a translation when the live source changed or became hidden', () => {
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'validation-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'validation-source',
      sourceHash: hashSourceText('Original text'),
      translatedText: '원문 번역'
    });

    translation.remove();
    source.textContent = 'Changed source text';
    expect(renderer.restoreMissingTranslations({elements: [source]})).toEqual({
      restored: [],
      invalid: [source]
    });
    expect(source.querySelector('translight-translation')).toBeNull();

    renderer.remove(source);
    document.body.innerHTML = '<p id="source" hidden>Hidden source text</p>';
    const hiddenSource = document.querySelector('#source');
    renderer.insert({
      element: hiddenSource,
      sourceId: 'hidden-source',
      sourceHash: hashSourceText('Hidden source text'),
      translatedText: '숨겨진 원문 번역'
    });
    hiddenSource.nextElementSibling?.remove();

    expect(renderer.restoreMissingTranslations({elements: [hiddenSource]})).toEqual({
      restored: [],
      invalid: [hiddenSource]
    });
    renderer.removeAll();
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

  it('does not replace visually hidden accessibility text in a visible source block', () => {
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
      <div id="source">
        <span class="sr-only">Screen reader label</span>
        <span id="visible">Visible label</span>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'hidden-label-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });

    renderer.insert({
      element: source,
      sourceId: 'hidden-label-source',
      sourceHash: hashSourceText('Visible label'),
      text: 'Visible label',
      translatedText: '번역'
    });

    expect(source.querySelector('.sr-only')?.textContent).toBe('Screen reader label');
    expect(source.querySelector('#visible')?.textContent).toBe('번역');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(`
      <div id="source">
        <span class="sr-only">Screen reader label</span>
        <span id="visible">Visible label</span>
      </div>
    `);
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

  it.each(['flex', 'grid'])('places a translation beside a %s source container', (display) => {
    document.body.innerHTML = `
      <div id="layout" style="display:flex">
        <div id="source" style="display:${display};width:50px;white-space:nowrap">LIVE</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({ document, sessionId: `${display}-source-session` });

    const translation = renderer.insert({
      element: source,
      sourceId: `${display}-source-container`,
      translatedText: '라이브'
    });

    expect(translation.parentElement).toBe(layout);
    expect(translation.previousElementSibling).toBe(source);
    expect(source.querySelector('translight-translation')).toBeNull();
    expect(translation.style.getPropertyValue('width')).toBe('');
    renderer.removeAll();
    expect(document.body.innerHTML).toBe(`
      <div id="layout" style="display:flex">
        <div id="source" style="display:${display};width:50px;white-space:nowrap">LIVE</div>
      </div>
    `);
  });

  it('keeps a flex source inside its grid cell', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex;width:50px;white-space:nowrap">LIVE</div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'grid-source-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'grid-source-container',
      translatedText: '라이브'
    });

    expect(translation.parentElement).not.toBe(source);
    expect(translation.parentElement?.tagName.toLowerCase()).toBe('span');
    expect(translation.parentElement?.getAttribute('data-translight-layout-wrapper')).toBe('true');
    expect(translation.parentElement?.parentElement).toBe(layout);
    expect(translation.parentElement?.previousElementSibling).toBe(source);
    expect(source.parentElement).toBe(layout);
    expect(translation.style.getPropertyValue('width')).toBe('');
    expect(translation.style.getPropertyValue('margin')).toBe('0px');
    expect(renderer.style.textContent).toContain('flex: 0 0 auto !important');
    renderer.removeAll();
    expect(document.body.innerHTML).toBe(`
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex;width:50px;white-space:nowrap">LIVE</div>
        <div id="tabs">ALL</div>
      </div>
    `);
  });

  it('leaves explicitly placed grid sources in their original outer layout', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:40px 60px 80px 1fr">
        <div id="source" style="display:flex;grid-column:2 / span 2;grid-row:3;order:7">LIVE</div>
        <div id="other">Other content</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const originalStyle = source.getAttribute('style');
    const renderer = new TranslationRenderer({document, sessionId: 'explicit-grid-source-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'explicit-grid-source',
      translatedText: '라이브'
    });

    expect(source.parentElement).toBe(layout);
    expect(source.getAttribute('style')).toBe(originalStyle);
    expect(translation.parentElement?.parentElement).toBe(layout);
    expect(translation.parentElement?.previousElementSibling).toBe(source);
    expect(translation.parentElement?.style.getPropertyValue('grid-column')).toBe('1 / -1');
    expect(translation.parentElement?.style.getPropertyValue('grid-row')).toBe('auto');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(`
      <div id="layout" style="display:grid;grid-template-columns:40px 60px 80px 1fr">
        <div id="source" style="display:flex;grid-column:2 / span 2;grid-row:3;order:7">LIVE</div>
        <div id="other">Other content</div>
      </div>
    `);
  });

  it('removes an owned grid wrapper when the host detaches its source', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'detached-grid-source-session'});
    renderer.insert({element: source, sourceId: 'detached-grid-source', translatedText: '라이브'});
    const wrapper = document.querySelector('[data-translight-layout-wrapper]');

    source.remove();
    renderer.pruneDisconnected();

    expect(renderer.hasRecord(source)).toBe(false);
    expect(wrapper?.isConnected).toBe(false);
    expect(document.querySelector('[data-translight-layout-wrapper]')).toBeNull();
    renderer.removeAll();
  });

  it('removes an owned grid wrapper when the host reparents its source', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
      </div>
      <div id="destination"></div>
    `;
    const source = document.querySelector('#source');
    const destination = document.querySelector('#destination');
    const renderer = new TranslationRenderer({document, sessionId: 'reparented-grid-source-session'});
    renderer.insert({element: source, sourceId: 'reparented-grid-source', translatedText: '라이브'});

    destination.appendChild(source);
    renderer.removeAll();

    expect(destination.firstElementChild).toBe(source);
    expect(document.querySelector('[data-translight-layout-wrapper]')).toBeNull();
    expect(source.textContent).toBe('LIVE');
  });

  it('matches the source block typography when its parent uses a smaller base size', () => {
    document.body.innerHTML = `
      <section id="article-body" style="font-size:10px;line-height:12.31px">
        <div class="content-block-regular">
          <p id="source" style="font-size:18px;line-height:28.8px">Article paragraph</p>
        </div>
      </section>
    `;
    const source = document.querySelector('#source');
    const sourceStyle = window.getComputedStyle(source);
    const renderer = new TranslationRenderer({document, sessionId: 'source-typography-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'source-typography-source',
      translatedText: '번역된 문단'
    });

    expect(sourceStyle.fontSize).toBe('18px');
    expect(sourceStyle.lineHeight).toBe('28.8px');
    expect(translation.style.getPropertyValue('font-size')).toBe(sourceStyle.fontSize);
    expect(translation.style.getPropertyValue('line-height')).toBe(sourceStyle.lineHeight);

    renderer.removeAll();
  });

  it('matches the source block width and horizontal margins for sibling translations', () => {
    document.head.innerHTML = `
      <style>
        .article-body { width: 100%; }
        .article-body .paragraph { width: 644px; margin-left: auto; margin-right: auto; }
      </style>
    `;
    document.body.innerHTML = `
      <div class="article-body">
        <div id="source" class="paragraph">Article paragraph</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const sourceStyle = window.getComputedStyle(source);
    const renderer = new TranslationRenderer({document, sessionId: 'source-layout-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'source-layout-source',
      translatedText: '번역된 문단'
    });

    expect(translation.style.getPropertyValue('width')).toBe(sourceStyle.width);
    expect(translation.style.getPropertyValue('margin-left')).toBe(sourceStyle.marginLeft);
    expect(translation.style.getPropertyValue('margin-right')).toBe(sourceStyle.marginRight);
    expect(window.getComputedStyle(translation).width).toBe(sourceStyle.width);

    renderer.removeAll();
  });

  it('uses the untransformed layout width for sibling translations', () => {
    document.head.innerHTML = `
      <style>
        .scaled { transform: scale(0.8); }
        .scaled .paragraph { box-sizing: border-box; width: 1000px; padding: 20px; }
      </style>
    `;
    document.body.innerHTML = `
      <div class="scaled">
        <div id="source" class="paragraph">Article paragraph</div>
      </div>
    `;
    const source = document.querySelector('#source');
    Object.defineProperty(source, 'offsetWidth', {configurable: true, value: 1000});
    const visualMeasurement = vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      left: 100,
      right: 900
    });
    const renderer = new TranslationRenderer({document, sessionId: 'transformed-layout-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'transformed-layout-source',
      translatedText: '번역된 문단'
    });

    expect(translation.style.getPropertyValue('width')).toBe('1000px');
    expect(visualMeasurement).not.toHaveBeenCalled();

    renderer.removeAll();
  });

  it('syncs only records affected by a horizontal resize and ignores height-only changes', () => {
    const previousResizeObserver = window.ResizeObserver;
    const observers = [];
    class ResizeObserverStub {
      constructor(callback) {
        this.callback = callback;
        this.targets = new Set();
        observers.push(this);
      }

      observe(target) {
        this.targets.add(target);
      }

      unobserve(target) {
        this.targets.delete(target);
      }

      disconnect() {
        this.targets.clear();
      }

      emit(entries) {
        this.callback(entries);
      }
    }

    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub
    });
    let renderer;
    try {
      document.body.innerHTML = `
        <div id="first-container" style="width:800px">
          <p id="first-source" style="width:600px">First paragraph</p>
        </div>
        <div id="second-container" style="width:800px">
          <p id="second-source" style="width:600px">Second paragraph</p>
        </div>
      `;
      const firstSource = document.querySelector('#first-source');
      const secondSource = document.querySelector('#second-source');
      const firstContainer = document.querySelector('#first-container');
      const secondContainer = document.querySelector('#second-container');
      renderer = new TranslationRenderer({document, sessionId: 'targeted-layout-session'});
      const firstTranslation = renderer.insert({
        element: firstSource,
        sourceId: 'targeted-layout-first',
        translatedText: '첫 번째 번역'
      });
      const secondTranslation = renderer.insert({
        element: secondSource,
        sourceId: 'targeted-layout-second',
        translatedText: '두 번째 번역'
      });
      const firstWrites = vi.spyOn(firstTranslation.style, 'setProperty');
      const secondWrites = vi.spyOn(secondTranslation.style, 'setProperty');
      const observer = observers[0];

      firstSource.style.width = '700px';
      observer.emit([{
        target: firstSource,
        borderBoxSize: [{inlineSize: 700, blockSize: 24}],
        contentRect: {width: 700, height: 24}
      }]);

      expect(firstWrites.mock.calls.some(([property]) => property === 'width')).toBe(true);
      expect(secondWrites).not.toHaveBeenCalled();

      firstWrites.mockClear();
      secondWrites.mockClear();
      secondSource.style.width = '650px';
      observer.emit([{
        target: secondContainer,
        borderBoxSize: [{inlineSize: 900, blockSize: 100}],
        contentRect: {width: 900, height: 100}
      }]);

      expect(firstWrites).not.toHaveBeenCalled();
      expect(secondWrites.mock.calls.some(([property]) => property === 'width')).toBe(true);

      firstWrites.mockClear();
      secondWrites.mockClear();
      observer.emit([{
        target: secondContainer,
        borderBoxSize: [{inlineSize: 900, blockSize: 200}],
        contentRect: {width: 900, height: 200}
      }]);

      expect(firstWrites).not.toHaveBeenCalled();
      expect(secondWrites).not.toHaveBeenCalled();
      expect(observer.targets.has(firstContainer)).toBe(true);
    } finally {
      renderer?.removeAll();
      if (previousResizeObserver === undefined) delete window.ResizeObserver;
      else window.ResizeObserver = previousResizeObserver;
    }
  });

  it('does not reuse content-box min/max widths on the border-box translation', () => {
    document.head.innerHTML = `
      <style>
        .content-box-source {
          box-sizing: content-box;
          width: 600px;
          min-width: 600px;
          max-width: 600px;
          padding: 0 20px;
        }
      </style>
    `;
    document.body.innerHTML = '<div id="source" class="content-box-source">Article paragraph</div>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'content-box-layout-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'content-box-layout-source',
      translatedText: '번역된 문단'
    });

    expect(translation.style.getPropertyValue('width')).toBe('640px');
    expect(translation.style.getPropertyValue('min-width')).toBe('');
    expect(translation.style.getPropertyValue('max-width')).toBe('');

    renderer.removeAll();
  });

  it('coalesces viewport-wide layout sync requests', () => {
    const previousRequestAnimationFrame = window.requestAnimationFrame;
    const previousCancelAnimationFrame = window.cancelAnimationFrame;
    vi.useFakeTimers();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback) => setTimeout(callback, 0)
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: (handle) => clearTimeout(handle)
    });
    let renderer;
    try {
      renderer = new TranslationRenderer({document, sessionId: 'coalesced-layout-session'});
      const syncLayouts = vi.spyOn(renderer, 'syncLayouts');

      renderer.scheduleLayoutSync();
      renderer.scheduleLayoutSync();
      vi.runOnlyPendingTimers();

      expect(syncLayouts).toHaveBeenCalledTimes(1);
    } finally {
      renderer?.removeAll();
      if (previousRequestAnimationFrame === undefined) delete window.requestAnimationFrame;
      else window.requestAnimationFrame = previousRequestAnimationFrame;
      if (previousCancelAnimationFrame === undefined) delete window.cancelAnimationFrame;
      else window.cancelAnimationFrame = previousCancelAnimationFrame;
      vi.useRealTimers();
    }
  });

  it('matches the typography of a nested source text wrapper', () => {
    document.body.innerHTML = `
      <div id="source" style="font-size:14px;line-height:20px">
        <yt-attributed-string>
          <span id="comment-text" style="font-size:16px;line-height:24px">Comment text</span>
        </yt-attributed-string>
      </div>
    `;
    const source = document.querySelector('#source');
    const commentText = document.querySelector('#comment-text');
    const renderer = new TranslationRenderer({document, sessionId: 'nested-typography-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'nested-typography-source',
      translatedText: '댓글 번역'
    });

    expect(translation.style.getPropertyValue('font-size'))
      .toBe(window.getComputedStyle(commentText).fontSize);
    expect(translation.style.getPropertyValue('line-height'))
      .toBe(window.getComputedStyle(commentText).lineHeight);

    renderer.removeAll();
  });

  it.each([
    ['a leading drop cap', '<span class="drop-cap" style="font-size:48px;line-height:48px">A</span> long article paragraph.'],
    ['a leading superscript marker', '<sup style="font-size:10px;line-height:12px">1</sup> Article paragraph with a note marker.']
  ])('keeps the block typography when %s is a minority fragment', (_label, content) => {
    document.body.innerHTML = `
      <p id="source" style="font-size:16px;line-height:24px">${content}</p>
    `;
    const source = document.querySelector('#source');
    const sourceStyle = window.getComputedStyle(source);
    const renderer = new TranslationRenderer({document, sessionId: 'minority-typography-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'minority-typography-source',
      translatedText: '번역된 문단'
    });

    expect(translation.style.getPropertyValue('font-size')).toBe(sourceStyle.fontSize);
    expect(translation.style.getPropertyValue('line-height')).toBe(sourceStyle.lineHeight);

    renderer.removeAll();
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

  it('keeps original-translation order when a short translation cannot be distributed', () => {
    document.body.innerHTML = '<p id="source"><a href="https://example.com">Open</a> or <em>close</em></p>';
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'short-inline-original-translation-session',
      settings: {translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION}
    });

    renderer.insert({
      element: source,
      sourceId: 'short-inline-original-translation-source',
      sourceHash: hashSourceText('Open or close'),
      translatedText: '번역'
    });

    const translation = document.querySelector('translight-translation');
    expect(document.body.firstElementChild).toBe(source);
    expect(document.body.lastElementChild).toBe(translation);
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

  it.each([
    [TRANSLATION_MODES.ORIGINAL_TRANSLATION, 'original-translation'],
    [TRANSLATION_MODES.TRANSLATION_ORIGINAL, 'translation-original']
  ])('keeps %s order for Goodreads-style mixed review content', (mode, label) => {
    document.body.innerHTML = `
      <div id="source">
        <span class="Formatted">
          Opening review text with <i>inline emphasis</i> and enough content.<br><br>
          <blockquote>Quoted review text remains a nested block.</blockquote><br><br>
          Closing review paragraph also has enough content.
        </span>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: `mixed-order-${label}`,
      settings: {translationMode: mode}
    });

    renderer.insert({
      element: source,
      sourceId: `mixed-order-source-${label}`,
      sourceHash: hashSourceText(source.textContent),
      mixedContent: true,
      translatedText: '번역된 리뷰입니다. 충분히 긴 번역문입니다.'
    });

    const translation = source.querySelector('translight-translation');
    expect(translation).not.toBeNull();
    expect(source.lastElementChild).toBe(translation);
    expect(source.querySelector('.Formatted')?.nextElementSibling).toBe(translation);

    renderer.removeAll();
    expect(source.querySelector('translight-translation')).toBeNull();
    expect(source.textContent).toContain('Opening review text with');
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

  it('places mixed card translations after direct text that follows nested metadata', () => {
    document.body.innerHTML = `
      <article id="card">
        <h3 id="headline"><div class="category">Meta</div><span class="headline-text">Facebook and Instagram face changes in US as Meta settles teen addiction lawsuit for $18bn</span></h3>
      </article>
    `;
    const headline = document.querySelector('#headline');
    const blocks = collectTranslationBlocks(document.body);
    const titleBlock = blocks.find((block) => block.element === headline);
    const renderer = new TranslationRenderer({document, sessionId: 'guardian-placement-session'});

    for (const block of blocks) {
      renderer.insert({...block, translatedText: `ko:${block.text}`});
    }

    const titleTranslation = document.querySelector(
      `translight-translation[data-translight-source-id="${titleBlock.sourceId}"]`
    );
    const originalHeadline = headline.querySelector('.headline-text');

    expect(titleBlock.mixedContent).toBe(true);
    expect(titleTranslation?.parentElement).toBe(headline);
    expect(titleTranslation?.previousElementSibling).toBe(originalHeadline);
    expect(originalHeadline?.nextElementSibling).toBe(titleTranslation);

    renderer.removeAll();
    expect(document.body.innerHTML).toContain(
      '<span class="headline-text">Facebook and Instagram face changes in US as Meta settles teen addiction lawsuit for $18bn</span>'
    );
    expect(document.querySelector('translight-translation')).toBeNull();
  });

  it('reuses mixed source text nodes during placement', () => {
    const textRunCount = 100;
    const textRuns = Array.from({length: textRunCount}, (_, index) =>
      `<span>Headline text run ${index + 1}</span>`
    ).join('');
    document.body.innerHTML = `<h3 id="source"><div>Meta</div>${textRuns}</h3>`;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'guardian-style-query-session'});
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');

    try {
      renderer.insert({
        element: source,
        sourceId: 'guardian-style-query-source',
        mixedContent: true,
        translatedText: '번역된 제목'
      });

      expect(getComputedStyleSpy).toHaveBeenCalledTimes(textRunCount + 3);
    } finally {
      getComputedStyleSpy.mockRestore();
      renderer.removeAll();
    }
  });

  it('keeps mixed placement after same-text host node replacement during recovery', () => {
    document.body.innerHTML = '<h3 id="source"><div id="category">Meta</div><span id="headline">Guardian headline</span></h3>';
    const source = document.querySelector('#source');
    const headline = document.querySelector('#headline');
    const renderer = new TranslationRenderer({document, sessionId: 'guardian-recovery-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'guardian-recovery-source',
      sourceHash: hashSourceText('Guardian headline'),
      mixedContent: true,
      translatedText: '가디언 제목'
    });

    headline.firstChild.replaceWith(document.createTextNode('Guardian headline'));
    translation.remove();

    expect(renderer.restoreMissingTranslations({elements: [source]})).toEqual({
      restored: [source],
      invalid: []
    });
    expect([...source.children]).toEqual([
      document.querySelector('#category'),
      headline,
      translation
    ]);

    renderer.removeAll();
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
