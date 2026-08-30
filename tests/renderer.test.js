// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATED_ATTRIBUTE,
  HIDDEN_ATTRIBUTE,
  HIDDEN_PLACEMENT_ATTRIBUTE,
  PSNPROFILES_OVERVIEW_ATTRIBUTE,
  PRESENTATION_HASH_ATTRIBUTE,
  REPLACED_ATTRIBUTE,
  REPLACEMENT_TEXT_ATTRIBUTE,
  SESSION_ATTRIBUTE,
  SOURCE_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  STYLED_REPLACEMENT_ATTRIBUTE,
  TABLE_LINK_GROUP_ATTRIBUTE,
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

  it('removes generated block spacing inside fixed-height flex titles', () => {
    document.head.innerHTML = `
      <style>
        .title { display: flex; height: 40px; padding: 5px; }
        .title h3 { display: block; font-size: 14px; line-height: 16px; }
      </style>
    `;
    document.body.innerHTML = `
      <div id="header"><div class="navigation"></div></div>
      <div id="banner"><div class="guide-info"></div></div>
      <div class="title flex v-align">
        <h3 class="grow" id="source">Roadmap</h3>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'fixed-title-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'fixed-title-source',
      translatedText: '로드맵'
    });

    expect(renderer.records.get('fixed-title-source')?.placement).toBe('inside');
    expect(translation.style.getPropertyValue('margin')).toBe('0px');
    expect(window.getComputedStyle(translation).margin).toBe('0px');
    const generatedText = translation.querySelector('[data-translight-text="true"]');
    expect(generatedText.style.getPropertyValue('display')).toBe('inline-block');
    expect(window.getComputedStyle(generatedText).display).toBe('inline-block');
  });

  it('translates PSNProfiles overview labels inside their badges without repeating values', () => {
    document.body.innerHTML = `
      <div id="header"><div class="navigation"></div></div>
      <div id="banner"><div class="guide-info"></div></div>
      <div class="overview-info">
        <span class="tag">
          <span class="typo-top">3/10</span><br>
          <span class="typo-bottom">Difficulty</span>
        </span>
        <span class="tag">
          <span class="typo-top">1</span><br>
          <span class="typo-bottom">Playthrough</span>
        </span>
        <span class="tag">
          <span class="typo-top">20</span><br>
          <span class="typo-bottom">Hours</span>
        </span>
      </div>
    `;
    const renderer = new TranslationRenderer({document, sessionId: 'psnprofiles-overview-session'});
    const blocks = collectTranslationBlocks(document.body);
    const translations = blocks.map((block, index) => renderer.insert({
      ...block,
      translatedText: ['난이도', '플레이스루', '시간'][index]
    }));
    const firstTranslation = translations[0];
    const overview = document.querySelector('.overview-info');

    expect(blocks.map((block) => block.text)).toEqual(['Difficulty', 'Playthrough', 'Hours']);
    expect(translations).toHaveLength(3);
    expect(translations.every((translation) =>
      translation.getAttribute(PSNPROFILES_OVERVIEW_ATTRIBUTE) === 'true'
    )).toBe(true);
    expect(translations.map((translation) => translation.textContent)).toEqual([
      '난이도',
      '플레이스루',
      '시간'
    ]);
    expect(overview.querySelectorAll(':scope > .tag > translight-translation')).toHaveLength(3);
    expect(overview.querySelector(':scope > translight-translation')).toBeNull();
    expect(overview.querySelectorAll('.typo-top')).toHaveLength(3);
    expect(overview.querySelectorAll('.typo-top')[0].textContent).toBe('3/10');
    expect(overview.querySelectorAll('.typo-top')[1].textContent).toBe('1');
    expect(overview.querySelectorAll('.typo-top')[2].textContent).toBe('20');
    expect(renderer.style.textContent).toContain('display: inline !important');
    expect(renderer.style.textContent).toContain('margin: 0 0 0 0.35em !important');

    renderer.removeAll();
    document.body.innerHTML = `
      <div class="overview-info">Generic overview text</div>
    `;
    const genericOverview = document.querySelector('.overview-info');
    const genericRenderer = new TranslationRenderer({document, sessionId: 'generic-overview-session'});
    const [genericBlock] = collectTranslationBlocks(document.body);
    const genericTranslation = genericRenderer.insert({
      ...genericBlock,
      translatedText: '일반 개요 텍스트'
    });

    expect(firstTranslation.isConnected).toBe(false);
    expect(genericTranslation.hasAttribute(PSNPROFILES_OVERVIEW_ATTRIBUTE)).toBe(false);
    expect(genericTranslation.previousElementSibling).toBe(genericOverview);

    genericRenderer.removeAll();
  });

  it.each(['flex', 'grid'])('does not treat resolved auto-height %s headings as fixed outside PSNProfiles', (display) => {
    document.head.innerHTML = `
      <style>
        .title { display: ${display}; height: auto; }
        .title h3 { display: block; font-size: 14px; line-height: 16px; }
      </style>
    `;
    document.body.innerHTML = `
      <div class="title" id="auto-title">
        <h3 id="source">Auto-height heading</h3>
      </div>
    `;
    const source = document.querySelector('#source');
    const parent = document.querySelector('#auto-title');
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = originalGetComputedStyle(element);
      if (element !== parent) return style;
      return new Proxy(style, {
        get(target, property, receiver) {
          if (property === 'height') return '40px';
          if (property === 'getPropertyValue') {
            return (name) => name === 'height' ? '40px' : target.getPropertyValue(name);
          }
          return Reflect.get(target, property, receiver);
        }
      });
    });
    const renderer = new TranslationRenderer({document, sessionId: `auto-height-${display}-session`});

    try {
      const translation = renderer.insert({
        element: source,
        sourceId: `auto-height-${display}-source`,
        translatedText: '자동 높이 제목'
      });

      expect(translation.style.getPropertyValue('margin')).toBe('');
      const generatedText = translation.querySelector('[data-translight-text="true"]');
      expect(generatedText.style.getPropertyValue('display')).toBe('');
    } finally {
      renderer.removeAll();
      getComputedStyleSpy.mockRestore();
    }
  });

  it('does not copy host layout dimensions from generated segment wrappers', () => {
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
    document.body.innerHTML = `
      <ul class="tableofcontents">
        <li id="source-parent">
          <span ${SEGMENT_ATTRIBUTE}="true" data-translight-segment-id="source-segment">
            Roadmap
          </span>
        </li>
      </ul>
    `;
    const source = document.querySelector(`[${SEGMENT_ATTRIBUTE}="true"]`);
    const renderer = new TranslationRenderer({document, sessionId: 'segment-layout-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'source-segment',
      translatedText: '로드맵'
    });

    expect(translation.style.width).toBe('');
    expect(translation.style.marginLeft).toBe('');
    expect(translation.style.marginRight).toBe('');
    expect(window.getComputedStyle(translation).width).not.toBe('14px');
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

  it('keeps CSS table-cell sources inside their existing table layout', () => {
    document.head.innerHTML = `
      <style>
        .arrange { display: table; }
        .arrange > .arrange-unit { display: table-cell; }
      </style>
    `;
    document.body.innerHTML = `
      <div id="wrap" class="arrange">
        <div id="icon" class="arrange-unit">icon</div>
        <div id="source" class="arrange-unit">Offers delivery</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#wrap');
    const renderer = new TranslationRenderer({document, sessionId: 'table-cell-session'});

    const translation = renderer.insert({
      element: source,
      sourceId: 'table-cell-source',
      translatedText: '배달 가능'
    });

    expect(translation.parentElement).toBe(source);
    expect(layout.children).toHaveLength(2);
    expect(source.querySelector('translight-translation')).toBe(translation);
    expect(renderer.records.get('table-cell-source')?.placement).toBe('inside');

    renderer.removeAll();
    expect(document.body.innerHTML).toBe(`
      <div id="wrap" class="arrange">
        <div id="icon" class="arrange-unit">icon</div>
        <div id="source" class="arrange-unit">Offers delivery</div>
      </div>
    `);
  });

  it('keeps a flex source inside its grid cell while anchoring the translation below it', () => {
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

    expect(translation.parentElement).toBe(source);
    expect(source.parentElement).toBe(layout);
    expect(source.style.getPropertyValue('position')).toBe('relative');
    expect(source.style.getPropertyPriority('position')).toBe('important');
    expect(translation.style.getPropertyValue('position')).toBe('absolute');
    expect(translation.style.getPropertyValue('top')).toBe('100%');
    expect(translation.style.getPropertyValue('left')).toBe('0px');
    expect(translation.style.getPropertyValue('width')).toBe('max-content');
    expect(translation.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(translation.style.getPropertyValue('margin')).toBe('0px');
    expect(renderer.style.textContent).toContain('flex: 0 0 auto !important');
    vi.spyOn(translation, 'getBoundingClientRect').mockReturnValue({height: 29.7});
    renderer.syncLayouts();
    expect(layout.style.getPropertyValue('margin-bottom')).toBe('30px');
    renderer.removeAll();
    expect(layout.style.getPropertyValue('margin-bottom')).toBe('');
    expect(source.style.getPropertyValue('position')).toBe('');
    expect(source.style.getPropertyValue('display')).toBe('flex');
    expect(source.style.getPropertyValue('width')).toBe('50px');
    expect(source.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(layout.querySelector('#tabs')?.textContent).toBe('ALL');
  });

  it('keeps an anchored translation visible when translation-only cannot replace flex text nodes', () => {
    document.head.innerHTML = '<style>.grid-source { display:flex; }</style>';
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" class="grid-source"><span>L</span><span>I</span><span>V</span><span>E</span></div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'grid-fallback-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });
    const translation = renderer.insert({
      element: source,
      sourceId: 'grid-fallback-source',
      translatedText: '번역'
    });

    expect(translation.parentElement).toBe(source);
    expect(source.getAttribute(HIDDEN_ATTRIBUTE)).toBe('true');
    expect(source.getAttribute(HIDDEN_PLACEMENT_ATTRIBUTE)).toBe('anchored');
    expect(source.style.getPropertyValue('display')).toBe('flex');
    expect(source.style.getPropertyPriority('display')).toBe('important');
    expect(window.getComputedStyle(source).display).toBe('flex');
    expect(renderer.style.textContent).toContain(
      '[data-translight-hidden-placement="anchored"] {\n      visibility: hidden !important;'
    );
    expect(renderer.style.textContent).toContain(
      '[data-translight-hidden-placement="anchored"] > translight-translation {\n      visibility: visible !important;'
    );

    renderer.removeAll();
    expect(source.style.getPropertyValue('display')).toBe('');
    expect(source.textContent).toBe('LIVE');
  });

  it('places an unsafe multi-row grid translation outside the grid', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:100px 100px;grid-auto-rows:20px">
        <div id="source" style="display:flex">One</div>
        <div style="display:flex">Two</div>
        <div style="display:flex">Three</div>
        <div style="display:flex">Four</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'multi-row-grid-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'multi-row-grid-source',
      translatedText: '첫 번째'
    });

    expect(translation.parentElement).toBe(layout.parentElement);
    expect(translation.parentElement).not.toBe(layout);
    expect(translation.style.getPropertyValue('position')).toBe('');
    expect(source.querySelector('translight-translation')).toBeNull();
    expect(renderer.records.get('multi-row-grid-source')?.placement?.kind)
      .toBe('grid-layout-external');

    renderer.removeAll();
    expect(layout.children).toHaveLength(4);
    expect(source.textContent).toBe('One');
  });

  it('places a clipped grid translation outside the grid without adding a host item', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex;overflow:hidden">LIVE</div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'clipped-grid-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'clipped-grid-source',
      translatedText: '라이브'
    });

    expect(translation.parentElement).toBe(layout.parentElement);
    expect(translation.parentElement).not.toBe(layout);
    expect(translation.style.getPropertyValue('position')).toBe('');
    expect(source.querySelector('translight-translation')).toBeNull();
    expect(Array.from(layout.children).map((child) => child.id || child.textContent))
      .toEqual(['source', 'tabs']);
    expect(renderer.records.get('clipped-grid-source')?.placement?.kind)
      .toBe('grid-layout-external');

    renderer.removeAll();
    expect(layout.children).toHaveLength(2);
    expect(source.textContent).toBe('LIVE');
  });

  it('keeps external grid translations in source order across async insertion and updates', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
        <div id="source-0" style="display:flex">One</div>
        <div id="source-1" style="display:flex">Two</div>
        <div id="source-2" style="display:flex">Three</div>
      </div>
    `;
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-order-session'});
    const sources = [0, 1, 2].map((index) => document.querySelector(`#source-${index}`));
    const insert = (index, text) => renderer.insert({
      element: sources[index],
      sourceId: `external-grid-order-${index}`,
      translatedText: text
    });
    const translationOrder = () => Array.from(document.body.children)
      .filter((child) => child.matches('translight-translation'))
      .map((child) => child.textContent);

    insert(2, 'T2');
    insert(0, 'T0');
    insert(1, 'T1');

    expect(translationOrder()).toEqual(['T0', 'T1', 'T2']);
    expect(Array.from(layout.children).map((child) => child.id)).toEqual([
      'source-0',
      'source-1',
      'source-2'
    ]);

    insert(0, 'T0 updated');
    expect(translationOrder()).toEqual(['T0 updated', 'T1', 'T2']);

    renderer.removeAll();
  });

  it('keeps external grid translations ordered when the grid is the host tail', () => {
    const run = (insertionOrder, sessionId, update = false) => {
      document.body.innerHTML = '';
      const host = document.createElement('div');
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px';
      layout.style.gridTemplateRows = '20px 20px 20px';
      const sources = [0, 1, 2].map((index) => {
        const source = document.createElement('div');
        source.id = `tail-source-${index}`;
        source.style.display = 'flex';
        source.textContent = `Item ${index}`;
        layout.appendChild(source);
        return source;
      });
      host.appendChild(layout);
      document.body.appendChild(host);

      const renderer = new TranslationRenderer({document, sessionId});
      for (const index of insertionOrder) {
        renderer.insert({
          element: sources[index],
          sourceId: `tail-source-${index}`,
          translatedText: `T${index}`
        });
      }
      if (update) {
        renderer.insert({
          element: sources[0],
          sourceId: 'tail-source-0',
          translatedText: 'T0 updated'
        });
      }
      const translations = () => Array.from(host.children)
        .filter((child) => child.matches('translight-translation'))
        .map((child) => child.textContent);
      const result = translations();
      renderer.removeAll();
      return {host, layout, result};
    };

    expect(run([0, 1, 2], 'grid-tail-forward').result).toEqual(['T0', 'T1', 'T2']);
    expect(run([2, 1, 0], 'grid-tail-reverse').result).toEqual(['T0', 'T1', 'T2']);
    expect(run([2, 0, 1], 'grid-tail-async-update', true).result)
      .toEqual(['T0 updated', 'T1', 'T2']);
  });

  it('rebuilds external grid order after source moves and updates', () => {
    const run = ({removeMovedSource = false, sessionId}) => {
      document.body.innerHTML = '';
      const host = document.createElement('div');
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px';
      layout.style.gridTemplateRows = '20px 20px 20px 20px';
      const sources = {};
      for (const id of ['A', 'B', 'C']) {
        const source = document.createElement('div');
        source.id = `moved-source-${id}`;
        source.style.display = 'flex';
        source.textContent = id;
        layout.appendChild(source);
        sources[id] = source;
      }
      host.appendChild(layout);
      const following = document.createElement('p');
      following.textContent = 'Following content';
      host.appendChild(following);
      document.body.appendChild(host);

      const renderer = new TranslationRenderer({document, sessionId});
      for (const id of ['A', 'B', 'C']) {
        renderer.insert({element: sources[id], sourceId: id, translatedText: id});
      }

      layout.appendChild(sources.A);
      if (removeMovedSource) {
        renderer.remove(sources.A);
      } else {
        renderer.insert({element: sources.A, sourceId: 'A', translatedText: 'A updated'});
      }

      const sourceX = document.createElement('div');
      sourceX.style.display = 'flex';
      sourceX.textContent = 'X';
      layout.insertBefore(sourceX, sources.B);
      expect(() => renderer.insert({element: sourceX, sourceId: 'X', translatedText: 'X'}))
        .not.toThrow();

      const translationOrder = Array.from(host.children)
        .filter((child) => child.matches('translight-translation'))
        .map((child) => child.textContent);
      const sourceOrder = Array.from(layout.children).map((child) => child.textContent);
      renderer.removeAll();
      return {translationOrder, sourceOrder, hostChildCount: host.children.length};
    };

    expect(run({sessionId: 'moved-grid-update'})).toEqual({
      translationOrder: ['X', 'B', 'C', 'A updated'],
      sourceOrder: ['X', 'B', 'C', 'A'],
      hostChildCount: 2
    });
    expect(run({removeMovedSource: true, sessionId: 'moved-grid-remove'})).toEqual({
      translationOrder: ['X', 'B', 'C'],
      sourceOrder: ['X', 'B', 'C', 'A'],
      hostChildCount: 2
    });
  });

  it('does not resurrect an external translation suppressed by translation-only replacement', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px">
          <div id="source" style="display:flex">Original</div>
          <div id="control">Control</div>
        </div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'suppressed-external-grid',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });
    const translation = renderer.insert({
      element: source,
      sourceId: 'suppressed-external-grid-source',
      translatedText: 'Translated'
    });

    expect(translation.isConnected).toBe(false);

    layout.appendChild(source);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(translation.isConnected).toBe(false);
    expect(renderer.records.get('suppressed-external-grid-source')?.translationSuppressed)
      .toBe(true);

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION});
    expect(translation.isConnected).toBe(true);
    expect(renderer.records.get('suppressed-external-grid-source')?.translationSuppressed)
      .toBe(false);

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ONLY});
    expect(translation.isConnected).toBe(false);
    renderer.removeAll();
  });

  it('reconciles active external translations when sources move during layout sync', () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="source-c" style="display:flex">C</div>
        </div>
      </div>
    `;
    const host = document.querySelector('#host');
    const layout = document.querySelector('#layout');
    const sourceA = document.querySelector('#source-a');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-sync-move'});
    for (const id of ['a', 'b', 'c']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-sync-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    layout.appendChild(sourceA);
    renderer.syncLayouts();

    expect(Array.from(host.children)
      .filter((child) => child.matches('translight-translation'))
      .map((child) => child.textContent))
      .toEqual(['B', 'C', 'A']);
    renderer.removeAll();
  });

  it('reconciles active external translations from source mutations without manual layout sync', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="source-c" style="display:flex">C</div>
        </div>
      </div>
    `;
    const host = document.querySelector('#host');
    const layout = document.querySelector('#layout');
    const sourceA = document.querySelector('#source-a');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-observer-sync'});
    for (const id of ['a', 'b', 'c']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-observer-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    layout.appendChild(sourceA);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Array.from(host.children)
      .filter((child) => child.matches('translight-translation'))
      .map((child) => child.textContent))
      .toEqual(['B', 'C', 'A']);
    renderer.removeAll();
  });

  it('does not resurrect external translations when presentation changes before a queued sync', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="source-c" style="display:flex">C</div>
        </div>
      </div>
    `;
    const host = document.querySelector('#host');
    const layout = document.querySelector('#layout');
    const sourceA = document.querySelector('#source-a');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-pending-mode'});
    for (const id of ['a', 'b', 'c']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-pending-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    const queuedSyncs = [];
    const view = document.defaultView;
    const originalQueueMicrotask = view.queueMicrotask;
    view.queueMicrotask = (callback) => queuedSyncs.push(callback);
    try {
      layout.appendChild(sourceA);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(queuedSyncs).toHaveLength(1);

      renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ONLY});
      queuedSyncs.shift()();

      expect(host.querySelectorAll('translight-translation')).toHaveLength(0);
      expect(renderer.records.get('external-grid-pending-a')?.translationSuppressed)
        .toBe(true);
    } finally {
      view.queueMicrotask = originalQueueMicrotask;
      renderer.removeAll();
    }
  });

  it('ignores a queued external sync after renderer teardown', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="source-c" style="display:flex">C</div>
        </div>
      </div>
    `;
    const layout = document.querySelector('#layout');
    const sourceA = document.querySelector('#source-a');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-pending-teardown'});
    for (const id of ['a', 'b', 'c']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-teardown-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    const queuedSyncs = [];
    const view = document.defaultView;
    const originalQueueMicrotask = view.queueMicrotask;
    view.queueMicrotask = (callback) => queuedSyncs.push(callback);
    try {
      layout.appendChild(sourceA);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(queuedSyncs).toHaveLength(1);

      renderer.removeAll();
      queuedSyncs.shift()();

      expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
      expect(renderer.records.size).toBe(0);
    } finally {
      view.queueMicrotask = originalQueueMicrotask;
      renderer.removeAll();
    }
  });

  it('batches a burst of external source moves into one group sync', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="source-c" style="display:flex">C</div>
        </div>
      </div>
    `;
    const host = document.querySelector('#host');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-burst'});
    for (const id of ['a', 'b', 'c']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-burst-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    const schedule = vi.spyOn(renderer, 'scheduleGridExternalGroupSync');
    layout.appendChild(document.querySelector('#source-a'));
    layout.appendChild(document.querySelector('#source-b'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(Array.from(host.children)
      .filter((child) => child.matches('translight-translation'))
      .map((child) => child.textContent))
      .toEqual(['C', 'A', 'B']);
    schedule.mockRestore();
    renderer.removeAll();
  });

  it('does not rebuild external grid order for unrelated child mutations', async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="layout" style="display:grid;grid-template-columns:100px;grid-template-rows:20px 20px 20px">
          <div id="source-a" style="display:flex">A</div>
          <div id="source-b" style="display:flex">B</div>
          <div id="control">Control</div>
        </div>
      </div>
    `;
    const layout = document.querySelector('#layout');
    const control = document.querySelector('#control');
    const renderer = new TranslationRenderer({document, sessionId: 'external-grid-control-mutation'});
    for (const id of ['a', 'b']) {
      renderer.insert({
        element: document.querySelector(`#source-${id}`),
        sourceId: `external-grid-control-${id}`,
        translatedText: id.toUpperCase()
      });
    }

    let sourceComparisons = 0;
    const nodePrototype = document.defaultView.Node.prototype;
    const originalCompareDocumentPosition = nodePrototype.compareDocumentPosition;
    nodePrototype.compareDocumentPosition = function(other) {
      if (this.parentNode === layout && other?.parentNode === layout) sourceComparisons += 1;
      return originalCompareDocumentPosition.call(this, other);
    };
    try {
      layout.appendChild(control);
      await new Promise((resolve) => setTimeout(resolve, 0));
      renderer.syncLayouts();
    } finally {
      nodePrototype.compareDocumentPosition = originalCompareDocumentPosition;
      renderer.removeAll();
    }

    expect(sourceComparisons).toBe(0);
  });

  it('keeps incremental external grid insertion within the order-index budget', () => {
    const measureIncrementalOrderWork = (sourceCount, sessionId) => {
      document.body.innerHTML = '';
      const host = document.createElement('div');
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px 100px';
      layout.style.gridTemplateRows = Array(Math.ceil(sourceCount / 2)).fill('20px').join(' ');
      host.appendChild(layout);
      document.body.appendChild(host);

      let sourceComparisons = 0;
      const nodePrototype = document.defaultView.Node.prototype;
      const originalCompareDocumentPosition = nodePrototype.compareDocumentPosition;
      nodePrototype.compareDocumentPosition = function(other) {
        if (this.parentNode === layout && other?.parentNode === layout) sourceComparisons += 1;
        return originalCompareDocumentPosition.call(this, other);
      };
      const renderer = new TranslationRenderer({document, sessionId});
      try {
        for (let index = 0; index < sourceCount; index += 1) {
          const source = document.createElement('div');
          source.style.display = 'flex';
          source.textContent = `Item ${index}`;
          layout.appendChild(source);
          renderer.insert({
            element: source,
            sourceId: `${sessionId}-${index}`,
            translatedText: `T${index}`
          });
        }
      } finally {
        nodePrototype.compareDocumentPosition = originalCompareDocumentPosition;
        renderer.removeAll();
      }
      return sourceComparisons;
    };
    const budget = (sourceCount) => sourceCount * Math.ceil(Math.log2(sourceCount + 1)) * 5;
    const small = measureIncrementalOrderWork(250, 'incremental-grid-order-250');
    const large = measureIncrementalOrderWork(500, 'incremental-grid-order-500');

    expect(small).toBeLessThan(budget(250));
    expect(large).toBeLessThan(budget(500));
  });

  it('bounds external grid ordering work without scanning the host children', () => {
    const measureExternalOrderWork = (sourceCount, sessionId) => {
      document.body.innerHTML = '';
      const host = document.createElement('div');
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px 100px';
      layout.style.gridTemplateRows = Array(Math.ceil(sourceCount / 2)).fill('20px').join(' ');
      const sources = [];
      for (let index = 0; index < sourceCount; index += 1) {
        const source = document.createElement('div');
        source.style.display = 'flex';
        source.textContent = `Item ${index}`;
        layout.appendChild(source);
        sources.push(source);
      }
      host.appendChild(layout);
      document.body.appendChild(host);

      let hostChildIterations = 0;
      const hostChildren = host.children;
      const originalHostIterator = hostChildren[Symbol.iterator].bind(hostChildren);
      Object.defineProperty(hostChildren, Symbol.iterator, {
        configurable: true,
        value() {
          const iterator = originalHostIterator();
          return {
            next() {
              const result = iterator.next();
              if (!result.done) hostChildIterations += 1;
              return result;
            },
            [Symbol.iterator]() {
              return this;
            }
          };
        }
      });

      let sourceComparisons = 0;
      const nodePrototype = document.defaultView.Node.prototype;
      const originalCompareDocumentPosition = nodePrototype.compareDocumentPosition;
      nodePrototype.compareDocumentPosition = function(other) {
        if (this.parentNode === layout && other?.parentNode === layout) sourceComparisons += 1;
        return originalCompareDocumentPosition.call(this, other);
      };

      const renderer = new TranslationRenderer({document, sessionId});
      try {
        for (let index = 0; index < sourceCount; index += 1) {
          renderer.insert({
            element: sources[index],
            sourceId: `${sessionId}-${index}`,
            translatedText: `번역 ${index}`
          });
        }
      } finally {
        nodePrototype.compareDocumentPosition = originalCompareDocumentPosition;
        renderer.removeAll();
      }
      return {hostChildIterations, sourceComparisons};
    };

    const small = measureExternalOrderWork(500, 'external-order-small');
    const large = measureExternalOrderWork(1000, 'external-order-large');

    expect(small.hostChildIterations).toBe(0);
    expect(large.hostChildIterations).toBe(0);
    expect(small.sourceComparisons).toBeGreaterThan(0);
    expect(large.sourceComparisons).toBeLessThanOrEqual(small.sourceComparisons * 3);
  });

  it('clears anchored translation styles when a grid source becomes a normal sibling', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'grid-to-block-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'grid-to-block-source',
      translatedText: '라이브'
    });
    const record = renderer.records.get('grid-to-block-source');

    expect(record.placement.kind).toBe('grid-layout-anchored');
    expect(translation.style.getPropertyValue('position')).toBe('absolute');

    layout.style.display = 'block';
    renderer.syncLayouts();

    expect(record.placement).toBe('sibling');
    expect(translation.parentElement).toBe(layout);
    for (const property of ['position', 'top', 'right', 'bottom', 'left', 'width',
      'max-width', 'white-space', 'margin']) {
      expect(translation.style.getPropertyValue(property)).toBe('');
    }

    renderer.removeAll();
  });

  it('keeps an unsafe grid translation-only fallback visible outside the grid', () => {
    document.head.innerHTML = '<style>.grid-source { display:flex; }</style>';
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" class="grid-source" style="overflow:hidden">
          <span>L</span><span>I</span><span>V</span><span>E</span>
        </div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'external-grid-fallback-session',
      settings: {translationMode: TRANSLATION_MODES.TRANSLATION_ONLY}
    });
    const translation = renderer.insert({
      element: source,
      sourceId: 'external-grid-fallback-source',
      translatedText: '번역'
    });

    expect(renderer.records.get('external-grid-fallback-source')?.placement?.kind)
      .toBe('grid-layout-external');
    expect(translation.parentElement).toBe(layout.parentElement);
    expect(source.getAttribute(HIDDEN_ATTRIBUTE)).toBe('true');
    expect(source.getAttribute(HIDDEN_PLACEMENT_ATTRIBUTE)).toBe('grid-external');
    expect(source.style.getPropertyValue('display')).toBe('flex');
    expect(source.style.getPropertyPriority('display')).toBe('important');
    expect(window.getComputedStyle(source).visibility).toBe('hidden');
    expect(window.getComputedStyle(translation).visibility).toBe('visible');
    expect(Array.from(layout.children).map((child) => child.id)).toEqual(['source', 'tabs']);

    renderer.removeAll();
    expect(source.style.getPropertyValue('display')).toBe('');
    expect(source.textContent.replace(/\s+/gu, '')).toBe('LIVE');
  });

  it('re-evaluates an anchored grid placement after rows or overflow become unsafe', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
        <div id="tabs">ALL</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'grid-recheck-session'});
    const translation = renderer.insert({
      element: source,
      sourceId: 'grid-recheck-source',
      translatedText: '라이브'
    });
    const record = renderer.records.get('grid-recheck-source');

    expect(record.placement.kind).toBe('grid-layout-anchored');
    expect(translation.parentElement).toBe(source);

    layout.style.gridTemplateColumns = '60px';
    layout.style.gridTemplateRows = '20px 20px';
    renderer.syncLayouts();

    expect(record.placement.kind).toBe('grid-layout-external');
    expect(translation.parentElement).toBe(layout.parentElement);
    expect(source.parentElement).toBe(layout);
    expect(source.style.getPropertyValue('position')).toBe('');
    expect(Array.from(layout.children).map((child) => child.id)).toEqual(['source', 'tabs']);

    layout.style.gridTemplateColumns = '60px 1fr';
    layout.style.gridTemplateRows = '';
    renderer.syncLayouts();
    expect(record.placement.kind).toBe('grid-layout-anchored');
    expect(translation.parentElement).toBe(source);

    source.style.overflow = 'hidden';
    renderer.syncLayouts();
    expect(record.placement.kind).toBe('grid-layout-external');
    expect(translation.parentElement).toBe(layout.parentElement);

    source.style.overflow = '';
    renderer.syncLayouts();
    expect(record.placement.kind).toBe('grid-layout-anchored');
    expect(translation.parentElement).toBe(source);

    renderer.removeAll();
  });

  it('short-circuits explicit multi-row grids and caches implicit multi-row checks', () => {
    const createGrid = ({explicitRows}) => {
      document.body.innerHTML = '';
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px 100px';
      layout.style.gridAutoRows = '20px';
      if (explicitRows) layout.style.gridTemplateRows = '20px 20px';
      for (let index = 0; index < 120; index += 1) {
        const source = document.createElement('div');
        source.id = `source-${index}`;
        source.style.display = 'flex';
        source.textContent = `Item ${index}`;
        layout.appendChild(source);
      }
      const control = document.createElement('div');
      control.id = 'control';
      control.textContent = 'ALL';
      layout.appendChild(control);
      document.body.appendChild(layout);
      return layout;
    };

    const measureChildEnumeration = (layout, sourceCount, sessionId) => {
      const children = layout.children;
      let iterations = 0;
      const originalIterator = children[Symbol.iterator].bind(children);
      Object.defineProperty(children, Symbol.iterator, {
        configurable: true,
        value() {
          iterations += 1;
          return originalIterator();
        }
      });
      const renderer = new TranslationRenderer({document, sessionId});
      for (let index = 0; index < sourceCount; index += 1) {
        renderer.insert({
          element: layout.querySelector(`#source-${index}`),
          sourceId: `${sessionId}-${index}`,
          translatedText: `번역 ${index}`
        });
      }
      renderer.removeAll();
      return iterations;
    };

    expect(measureChildEnumeration(createGrid({explicitRows: true}), 120, 'explicit-grid-cache'))
      .toBe(0);
    expect(measureChildEnumeration(createGrid({explicitRows: false}), 120, 'implicit-grid-cache'))
      .toBe(1);
  });

  it('bounds long explicit row-track analysis across N and 2N insertions', () => {
    const measureLongRowWork = (sourceCount, sessionId) => {
      document.body.innerHTML = '';
      const layout = document.createElement('div');
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = '100px 100px';
      layout.style.gridTemplateRows = Array(Math.ceil(sourceCount / 2)).fill('20px').join(' ');
      for (let index = 0; index < sourceCount; index += 1) {
        const source = document.createElement('div');
        source.id = `long-source-${index}`;
        source.style.display = 'flex';
        source.textContent = `Item ${index}`;
        layout.appendChild(source);
      }
      document.body.appendChild(layout);

      const children = layout.children;
      let childEnumerations = 0;
      const originalIterator = children[Symbol.iterator].bind(children);
      Object.defineProperty(children, Symbol.iterator, {
        configurable: true,
        value() {
          childEnumerations += 1;
          return originalIterator();
        }
      });
      const originalTest = RegExp.prototype.test;
      let whitespaceScans = 0;
      RegExp.prototype.test = function(value) {
        if (this.source === '\\s' && this.flags === 'u') whitespaceScans += 1;
        return originalTest.call(this, value);
      };

      const renderer = new TranslationRenderer({document, sessionId});
      try {
        for (let index = 0; index < sourceCount; index += 1) {
          renderer.insert({
            element: layout.querySelector(`#long-source-${index}`),
            sourceId: `${sessionId}-${index}`,
            translatedText: `번역 ${index}`
          });
        }
      } finally {
        RegExp.prototype.test = originalTest;
        renderer.removeAll();
      }
      return {childEnumerations, whitespaceScans};
    };

    const small = measureLongRowWork(120, 'long-row-small');
    const large = measureLongRowWork(240, 'long-row-large');

    expect(small.childEnumerations).toBe(0);
    expect(large.childEnumerations).toBe(0);
    expect(small.whitespaceScans).toBeLessThanOrEqual(32);
    expect(large.whitespaceScans).toBeLessThanOrEqual(32);
  });

  it('flushes shared grid reservations once and skips unchanged margin writes', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:repeat(3,1fr)">
        <div id="source-one" style="display:flex">One</div>
        <div id="source-two" style="display:flex">Two</div>
        <div id="source-three" style="display:flex">Three</div>
      </div>
    `;
    const layout = document.querySelector('#layout');
    const renderer = new TranslationRenderer({document, sessionId: 'shared-grid-reservation-session'});
    const translations = ['source-one', 'source-two', 'source-three'].map((id, index) => {
      const source = document.querySelector(`#${id}`);
      const translation = renderer.insert({
        element: source,
        sourceId: `shared-grid-source-${index}`,
        translatedText: `번역 ${index + 1}`
      });
      vi.spyOn(translation, 'getBoundingClientRect').mockReturnValue({height: 20});
      return translation;
    });
    const marginWriteSpy = vi.spyOn(layout.style, 'setProperty');

    renderer.syncLayouts();

    expect(translations).toHaveLength(3);
    expect(marginWriteSpy.mock.calls.filter(([property]) => property === 'margin-bottom'))
      .toHaveLength(1);
    marginWriteSpy.mockClear();
    renderer.syncLayouts();
    expect(marginWriteSpy.mock.calls.filter(([property]) => property === 'margin-bottom'))
      .toHaveLength(0);

    renderer.removeAll();
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
    expect(source.style.getPropertyValue('grid-column')).toBe('2 / span 2');
    expect(source.style.getPropertyValue('grid-row')).toBe('3');
    expect(source.style.getPropertyValue('order')).toBe('7');
    expect(translation.parentElement).toBe(source);

    renderer.removeAll();
    expect(source.style.getPropertyValue('position')).toBe('');
    expect(source.style.getPropertyValue('grid-column')).toBe('2 / span 2');
    expect(source.style.getPropertyValue('grid-row')).toBe('3');
    expect(source.style.getPropertyValue('order')).toBe('7');
    expect(source.textContent).toBe('LIVE');
  });

  it('removes an anchored grid translation when the host detaches its source', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
      </div>
    `;
    const source = document.querySelector('#source');
    const renderer = new TranslationRenderer({document, sessionId: 'detached-grid-source-session'});
    renderer.insert({element: source, sourceId: 'detached-grid-source', translatedText: '라이브'});
    const translation = source.querySelector('translight-translation');

    source.remove();
    renderer.pruneDisconnected();

    expect(renderer.hasRecord(source)).toBe(false);
    expect(translation?.isConnected).toBe(false);
    renderer.removeAll();
  });

  it('removes an anchored grid translation when the host reparents its source', () => {
    document.body.innerHTML = `
      <div id="layout" style="display:grid;grid-template-columns:60px 1fr">
        <div id="source" style="display:flex">LIVE</div>
      </div>
      <div id="destination"></div>
    `;
    const source = document.querySelector('#source');
    const destination = document.querySelector('#destination');
    const renderer = new TranslationRenderer({document, sessionId: 'reparented-grid-source-session'});
    const translation = renderer.insert({element: source, sourceId: 'reparented-grid-source', translatedText: '라이브'});

    destination.appendChild(source);
    renderer.removeAll();

    expect(destination.firstElementChild).toBe(source);
    expect(translation.isConnected).toBe(false);
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

  it('renders each linked table value as a separate highlighted item', () => {
    document.body.innerHTML = `
      <table><tbody><tr>
        <td id="multi">
          <nobr><a href="#fbi-investigator">FBI Investigator</a></nobr>
          <nobr><a href="#nerd">Nerd</a></nobr>
        </td>
        <td id="single"><nobr><a href="#interactive-drama">Interactive Drama</a></nobr></td>
      </tr></tbody></table>
    `;
    const renderer = new TranslationRenderer({document, sessionId: 'multi-link-spacing-session'});
    const blocks = collectTranslationBlocks(document.body);
    const translated = new Map([
      ['FBI Investigator', 'FBI 수사관'],
      ['Nerd', '괴짜'],
      ['Interactive Drama', '인터랙티브 드라마']
    ]);
    for (const block of blocks) {
      renderer.insert({...block, translatedText: translated.get(block.text)});
    }

    const multiCell = document.querySelector('#multi');
    const group = multiCell.querySelector(`[${TABLE_LINK_GROUP_ATTRIBUTE}="true"]`);
    const items = [...group.children];
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.textContent)).toEqual(['FBI 수사관', '괴짜']);
    expect(items[0].nextElementSibling).toBe(items[1]);
    expect(items.every((item) => item.matches('translight-translation'))).toBe(true);
    expect(multiCell.querySelectorAll(':scope > translight-translation')).toHaveLength(0);
    expect(document.querySelector('#single')?.querySelector('translight-translation')?.textContent)
      .toBe('인터랙티브 드라마');
    expect(renderer.style.textContent).toContain('margin-left: 0.35em !important');

    renderer.removeAll();
    expect(document.querySelector(`[${TABLE_LINK_GROUP_ATTRIBUTE}]`)).toBeNull();
  });

  it('keeps linked table translations in source order when results arrive out of order', () => {
    document.body.innerHTML = `
      <table><tbody><tr><td id="multi-order">
        <nobr><a href="#first">First value</a></nobr>
        <nobr><a href="#second">Second value</a></nobr>
        <nobr><a href="#third">Third value</a></nobr>
      </td></tr></tbody></table>
    `;
    const renderer = new TranslationRenderer({document, sessionId: 'multi-link-order-session'});
    const blocks = collectTranslationBlocks(document.body);
    const byText = new Map(blocks.map((block) => [block.text, block]));

    renderer.insert({...byText.get('Third value'), translatedText: '셋째'});
    renderer.insert({...byText.get('First value'), translatedText: '첫째'});
    renderer.insert({...byText.get('Second value'), translatedText: '둘째'});

    const cell = document.querySelector('#multi-order');
    const group = cell.querySelector(`[${TABLE_LINK_GROUP_ATTRIBUTE}="true"]`);
    expect([...group.children].map((item) => item.textContent)).toEqual(['첫째', '둘째', '셋째']);

    renderer.remove(byText.get('Second value').element);
    expect([...group.children].map((item) => item.textContent)).toEqual(['첫째', '셋째']);
    renderer.remove(byText.get('First value').element);
    renderer.remove(byText.get('Third value').element);
    expect(cell.querySelector(`[${TABLE_LINK_GROUP_ATTRIBUTE}="true"]`)).toBeNull();
  });

  it('keeps linked table placement writes linear as a cell grows', () => {
    const measure = (itemCount, sessionId) => {
      document.body.innerHTML = `
        <table><tbody><tr><td id="multi-scale">
          ${Array.from({length: itemCount}, (_, index) => `
            <nobr><a href="#value-${index}">Table value ${index}</a></nobr>
          `).join('')}
        </td></tr></tbody></table>
      `;
      const renderer = new TranslationRenderer({document, sessionId});
      const blocks = collectTranslationBlocks(document.body);
      const nodePrototype = document.defaultView.Node.prototype;
      const originalInsertBefore = nodePrototype.insertBefore;
      let groupInsertions = 0;
      nodePrototype.insertBefore = function(node, reference) {
        if (this.getAttribute?.(TABLE_LINK_GROUP_ATTRIBUTE) === 'true') groupInsertions += 1;
        return originalInsertBefore.call(this, node, reference);
      };

      try {
        for (const block of [...blocks].reverse()) {
          renderer.insert({...block, translatedText: `번역 ${block.text}`});
        }
        return {blocks, groupInsertions};
      } finally {
        nodePrototype.insertBefore = originalInsertBefore;
        renderer.removeAll();
      }
    };

    const smaller = measure(50, 'multi-link-scale-50');
    const larger = measure(100, 'multi-link-scale-100');

    expect(smaller.blocks).toHaveLength(50);
    expect(larger.blocks).toHaveLength(100);
    expect(smaller.groupInsertions).toBeLessThanOrEqual(51);
    expect(larger.groupInsertions).toBeLessThanOrEqual(smaller.groupInsertions * 2);
  });

  it('restores linked table presentation when switching translation modes', () => {
    document.body.innerHTML = `
      <table><tbody><tr><td id="multi-modes">
        <nobr><a href="#first">First value</a></nobr>
        <nobr><a href="#second">Second value</a></nobr>
      </td></tr></tbody></table>
    `;
    const renderer = new TranslationRenderer({
      document,
      sessionId: 'multi-link-modes-session',
      settings: {translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION}
    });
    const blocks = collectTranslationBlocks(document.body);
    const translations = new Map([
      ['First value', '첫째'],
      ['Second value', '둘째']
    ]);
    for (const block of blocks) renderer.insert({...block, translatedText: translations.get(block.text)});

    const cell = document.querySelector('#multi-modes');
    const groupSelector = `[${TABLE_LINK_GROUP_ATTRIBUTE}="true"]`;
    const sourceLinks = () => [...cell.querySelectorAll('a')].map((link) => link.textContent);
    const groupTexts = () => [...cell.querySelector(groupSelector)?.children ?? []]
      .map((item) => item.textContent);

    expect(sourceLinks()).toEqual(['First value', 'Second value']);
    expect(groupTexts()).toEqual(['첫째', '둘째']);

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ONLY});
    expect(sourceLinks()).toEqual(['첫째', '둘째']);
    expect(cell.querySelector(groupSelector)).toBeNull();

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION});
    expect(sourceLinks()).toEqual(['First value', 'Second value']);
    expect(groupTexts()).toEqual(['첫째', '둘째']);

    renderer.updatePresentation({translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL});
    expect(sourceLinks()).toEqual(['첫째', '둘째']);
    expect(groupTexts()).toEqual(['First value', 'Second value']);

    renderer.removeAll();
    expect(document.querySelector('#multi-modes')?.textContent.replace(/[\t\r\n ]+/g, ' ').trim())
      .toBe('First value Second value');
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
