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

  it('ignores custom navigation items while keeping nearby article text', () => {
    document.body.innerHTML = `
      <bsp-nav class="MainNavigation">
        <ul class="MainNavigation-items">
          <li data-nav-items-item>
            <div class="MainNavigationItem" data-mainnav-item>
              <div class="MainNavigationItem-text" data-has-dropdown>
                <a href="/science">Science</a>
              </div>
            </div>
          </li>
          <li data-nav-items-item>
            <div class="MainNavigationItem" data-mainnav-item>
              <div class="MainNavigationItem-text" data-has-dropdown>
                <span class="MainNavigationItem-more" data-nav-moretrigger>More</span>
              </div>
            </div>
          </li>
        </ul>
      </bsp-nav>
      <div class="MainNavigation"><div>Archive</div></div>
      <p>Article text remains translatable.</p>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'Article text remains translatable.'
    ]);
  });

  it('keeps PSNProfiles shell chrome out of the translation blocks', () => {
    document.body.innerHTML = `
      <div id="header">
        <div class="header">
          <div class="navigation"><ul><li><a href="/guides">Guides</a></li></ul></div>
        </div>
      </div>
      <div id="banner">
        <div class="banner-overlay">
          <div class="guide-info">
            <h3>Beyond: Two Souls Trophy Guide</h3>
            <div class="intro">A story-based guide introduction.</div>
          </div>
          <div class="stats">230 User Favourites</div>
          <div class="title-bar">Guide details</div>
        </div>
      </div>
      <main id="content" class="page"><p>Guide body remains translatable.</p></main>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'Guide body remains translatable.'
    ]);
  });

  it('keeps PSNProfiles shell chrome out while the guide body is still mounting', () => {
    document.body.innerHTML = `
      <div id="header">
        <div class="navigation"><a href="/guides">Guides</a></div>
      </div>
      <div id="banner">
        <div class="guide-info">
          <h3>Beyond: Two Souls Trophy Guide</h3>
        </div>
      </div>
      <p>Guide body remains translatable.</p>
    `;

    expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
      'Guide body remains translatable.'
    ]);
  });

  it('does not let PSNProfiles TOC segmentation wrappers hide the source link', () => {
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
      <ul class="nav tableofcontents zebra">
        <li id="source" class="ellipsis">
          <span class="icon-sprite bronze"></span>

          <a href="#source">Somebody Else?</a>
        </li>
      </ul>
    `;

    const blocks = collectTranslationBlocks(document.body);
    const source = blocks.find((block) => block.text === 'Somebody Else?')?.element;

    expect(source?.matches('[data-translight-segment="true"]')).toBe(true);
    expect(source?.style.getPropertyValue('display')).toBe('contents');
    expect(source?.style.getPropertyPriority('display')).toBe('important');
    expect(source?.querySelector('a')?.textContent).toBe('Somebody Else?');
  });

  it.each(['has-navigation', 'layout-with-navigation', 'AppWithNavigation'])
    ('does not treat ordinary layout class %s as a navigation container', (className) => {
      document.body.innerHTML = `
        <div class="${className}">
          <main>
            <h1>Article heading remains translatable.</h1>
            <p>Article paragraph remains translatable.</p>
          </main>
        </div>
      `;

      expect(collectTranslationBlocks(document.body).map((block) => block.text)).toEqual([
        'Article heading remains translatable.',
        'Article paragraph remains translatable.'
      ]);
    });

  it('collects linked figure captions but ignores image-replacement logos', () => {
    document.body.innerHTML = `
      <header>
        <h1 class="site-logo">
          <a class="logo replace" href="/">Letterboxd — Your life in film</a>
        </h1>
      </header>
      <figure class="article-media">
        <img alt="Gromit from Wallace &amp; Gromit">
        <figcaption class="figure-caption caption">
          Gromit from&nbsp;<em><a href="#gromit">Wallace &amp; Gromit: The Curse of the Were-Rabbit</a></em>,
          Shadow from&nbsp;<em><a href="#shadow">Homeward Bound: The Incredible Journey</a></em>,
          Jack (Uggie) from&nbsp;<em><a href="#artist">The Artist</a></em>.
        </figcaption>
      </figure>
      <p>Article content remains translatable.</p>
    `;

    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'Gromit from Wallace & Gromit: The Curse of the Were-Rabbit, Shadow from Homeward Bound: The Incredible Journey, Jack (Uggie) from The Artist.',
      'Article content remains translatable.'
    ]);
    expect(blocks.some((block) => block.text.includes('Letterboxd'))).toBe(false);
    expect(document.querySelector('.site-logo')?.hasAttribute('data-translight-source-id')).toBe(false);
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

  it('keeps direct guide prose when nested blocks contain unrelated links', () => {
    const unrelatedLinks = Array.from({length: 60}, (_, index) =>
      `<a href="#trophy-${index}">Trophy Guide Link ${index}</a>`
    ).join('');
    document.body.innerHTML = `
      <div class="step-original guide">
        <h1>Stage 1: Playthrough</h1>
        <table><tbody><tr><td><div>Overview</div></td></tr></tbody></table>
        <div><br></div>
        Your first playthrough will be focused on achieving all the endings required for
        <img alt="Trophy"><a href="#perfect-crime">Perfect Crime</a>.
        This trophy is highly missable, and it requires specific decisions from the beginning of the game.
        <a href="#order"><strong>Playthrough Order / Miscellaneous Trophies</strong></a> section.<br>
        <div class="roadmap-intended-trophies">${unrelatedLinks}</div>
      </div>
    `;

    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.some(({text}) => text.startsWith(
      'Your first playthrough will be focused on achieving all the endings required for'
    ))).toBe(true);
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

  it('splits Booking property paragraphs across inline labels', () => {
    document.body.innerHTML = `
      <div data-capla-component-boundary="b-property-web-property-page/PropertyDescriptionDesktop">
        <p data-testid="property-description" class="booking-property-description"><b>Prime Location:</b> OUTRIGGER Waikiki Beachcomber Hotel in Honolulu offers easy access to Waikiki Beach, a 3-minute walk away. Nearby attractions include Royal Hawaiian Shopping Center (984 feet) and Royal Hawaiian Theater (4-minute walk). Honolulu International Airport is 9.3 mi from the property.

<b>Exceptional Facilities:</b> Guests enjoy a swimming pool with stunning views, a sun terrace, and a family-friendly restaurant serving American cuisine. Additional amenities include a hot tub, fitness center, yoga classes, and film nights.

<b>Comfortable Accommodations:</b> Rooms feature air-conditioning, balconies with sea or city views, private bathrooms, and modern amenities such as tea and coffee makers, hairdryers, and free toiletries. Family rooms and sofa beds cater to all travelers.

<b>Dining Experience:</b> The on-site restaurant offers American cuisine with vegetarian and gluten-free options. Breakfast includes local specialties, warm dishes, and fresh fruits. A pool bar and coffee shop provide additional dining options.</p>
      </div>
    `;

    const description = document.querySelector('[data-testid="property-description"]');
    const blocks = collectTranslationBlocks(document.body);

    expect(blocks.map((block) => block.text)).toEqual([
      'Prime Location: OUTRIGGER Waikiki Beachcomber Hotel in Honolulu offers easy access to Waikiki Beach, a 3-minute walk away. Nearby attractions include Royal Hawaiian Shopping Center (984 feet) and Royal Hawaiian Theater (4-minute walk). Honolulu International Airport is 9.3 mi from the property.',
      'Exceptional Facilities: Guests enjoy a swimming pool with stunning views, a sun terrace, and a family-friendly restaurant serving American cuisine. Additional amenities include a hot tub, fitness center, yoga classes, and film nights.',
      'Comfortable Accommodations: Rooms feature air-conditioning, balconies with sea or city views, private bathrooms, and modern amenities such as tea and coffee makers, hairdryers, and free toiletries. Family rooms and sofa beds cater to all travelers.',
      'Dining Experience: The on-site restaurant offers American cuisine with vegetarian and gluten-free options. Breakfast includes local specialties, warm dishes, and fresh fruits. A pool bar and coffee shop provide additional dining options.'
    ]);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
    expect(blocks.every(({element}) => element.parentElement === description)).toBe(true);
    expect(description.querySelectorAll('[data-translight-segment="true"]')).toHaveLength(4);
  });

  it('keeps surrounding text when splitting a nested inline newline container', () => {
    document.body.innerHTML = '<p id="description">This introduction explains the hotel location.<span><b>Facilities: </b>Guests can use the hotel swimming pool.\n\n<b>Rooms: </b>Each room has a balcony with sea views.</span> This final note explains the cancellation policy.</p>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'This introduction explains the hotel location.',
      'Facilities: Guests can use the hotel swimming pool.',
      'Rooms: Each room has a balcony with sea views.',
      'This final note explains the cancellation policy.'
    ];
    const blocks = collectTranslationBlocks(description);
    const secondPass = collectTranslationBlocks(description);

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(secondPass.map((block) => block.text)).toEqual(expectedTexts);
    expect(new Set(blocks.map((block) => block.text)).size).toBe(expectedTexts.length);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
  });

  it('keeps surrounding text across sibling inline newline containers', () => {
    document.body.innerHTML = '<p id="description">Opening note has enough English words.<span><b>First: </b>First inline paragraph has enough English words.\n\n<b>Second: </b>Second inline paragraph has enough English words.</span>Middle note has enough English words.<span><b>Third: </b>Third inline paragraph has enough English words.\n\n<b>Fourth: </b>Fourth inline paragraph has enough English words.</span>Closing note has enough English words.</p>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'Opening note has enough English words.',
      'First: First inline paragraph has enough English words.',
      'Second: Second inline paragraph has enough English words.',
      'Middle note has enough English words.',
      'Third: Third inline paragraph has enough English words.',
      'Fourth: Fourth inline paragraph has enough English words.',
      'Closing note has enough English words.'
    ];
    const blocks = collectTranslationBlocks(description);

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(new Set(blocks.map((block) => block.text)).size).toBe(expectedTexts.length);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
  });

  it('keeps surrounding text when a nested text node is split directly', () => {
    document.body.innerHTML = '<p id="description">Introductory note has enough English words.<span>First inline paragraph has enough English words.\n\nSecond inline paragraph has enough English words.</span>Concluding note has enough English words.</p>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'Introductory note has enough English words.',
      'First inline paragraph has enough English words.',
      'Second inline paragraph has enough English words.',
      'Concluding note has enough English words.'
    ];
    const blocks = collectTranslationBlocks(description);

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
  });

  it('keeps inline labels and trailing text around a partially split nested text node', () => {
    document.body.innerHTML = '<p id="description">Opening hotel description has enough English words. <span><b>Facilities: </b>Guests can use the hotel swimming pool.\n\nGuests can also use the hotel spa. <b>Rooms: </b>Each room has a balcony with sea views.</span> Final cancellation policy has enough English words.</p>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'Opening hotel description has enough English words.',
      'Facilities: Guests can use the hotel swimming pool.',
      'Guests can also use the hotel spa. Rooms: Each room has a balcony with sea views.',
      'Final cancellation policy has enough English words.'
    ];
    const blocks = collectTranslationBlocks(description);

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(new Set(blocks.map((block) => block.text)).size).toBe(expectedTexts.length);
    expect(blocks.every(({element}) => element.matches('[data-translight-segment="true"]')))
      .toBe(true);
  });

  it('does not create nested segments when ancestor and descendant text both contain breaks', () => {
    document.body.innerHTML = '<p id="description">Opening hotel description has enough English words.\n\n<b>Facilities: </b><span>Guests can use the hotel swimming pool.\n\nGuests can also use the hotel spa.</span> Final cancellation policy has enough English words.</p>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'Opening hotel description has enough English words.',
      'Facilities:',
      'Guests can use the hotel swimming pool.',
      'Guests can also use the hotel spa.',
      'Final cancellation policy has enough English words.'
    ];
    const blocks = collectTranslationBlocks(description);
    const secondPass = collectTranslationBlocks(description);
    const segments = Array.from(description.querySelectorAll('[data-translight-segment="true"]'));

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(secondPass.map((block) => block.text)).toEqual(expectedTexts);
    expect(segments).toHaveLength(expectedTexts.length);
    expect(segments.every((segment) =>
      segment.querySelector('[data-translight-segment="true"]') === null
    )).toBe(true);
  });

  it('keeps ancestor and descendant br paragraphs as non-overlapping segments', () => {
    document.body.innerHTML = '<div id="description"><span><span>Guests can use the hotel swimming pool.<br><br>Guests can also use the hotel spa.</span> Outer facilities note has enough English words.<br><br>Final outer note has enough English words.</span></div>';

    const description = document.querySelector('#description');
    const expectedTexts = [
      'Guests can use the hotel swimming pool.',
      'Guests can also use the hotel spa.',
      'Outer facilities note has enough English words.',
      'Final outer note has enough English words.'
    ];
    const blocks = collectTranslationBlocks(description);
    const secondPass = collectTranslationBlocks(description);
    const segments = Array.from(description.querySelectorAll('[data-translight-segment="true"]'));

    expect(blocks.map((block) => block.text)).toEqual(expectedTexts);
    expect(secondPass.map((block) => block.text)).toEqual(expectedTexts);
    expect(segments).toHaveLength(expectedTexts.length);
    expect(segments.every((segment) =>
      segment.querySelector('[data-translight-segment="true"]') === null
    )).toBe(true);
  });

  it('keeps inline paragraph segmentation within a linear query budget', () => {
    const measure = (paragraphCount) => {
      document.body.innerHTML = `
        <div data-capla-component-boundary="b-property-web-property-page/PropertyDescriptionDesktop">
          ${Array.from({length: paragraphCount}, (_, index) => `
            <p data-testid="property-description-${index}"><b>Prime Location:</b> OUTRIGGER Waikiki Beachcomber Hotel offers easy access to Waikiki Beach.

<b>Exceptional Facilities:</b> Guests enjoy a swimming pool with stunning views and a family-friendly restaurant.

<b>Comfortable Accommodations:</b> Rooms feature air-conditioning, balconies, private bathrooms, and modern amenities.

<b>Dining Experience:</b> The on-site restaurant offers American cuisine with vegetarian and gluten-free options.</p>
          `).join('')}
        </div>
      `;

      const originalQuerySelectorAll = Element.prototype.querySelectorAll;
      let queryCalls = 0;
      let returnedNodes = 0;
      Element.prototype.querySelectorAll = function (...args) {
        queryCalls += 1;
        const result = originalQuerySelectorAll.apply(this, args);
        returnedNodes += result.length;
        return result;
      };

      try {
        const blocks = collectTranslationBlocks(document.body);
        return {blocks, queryCalls, returnedNodes};
      } finally {
        Element.prototype.querySelectorAll = originalQuerySelectorAll;
      }
    };

    const smaller = measure(25);
    const larger = measure(50);

    expect(smaller.blocks).toHaveLength(100);
    expect(larger.blocks).toHaveLength(200);
    expect(larger.queryCalls).toBeLessThanOrEqual(smaller.queryCalls * 2);
    expect(larger.returnedNodes).toBeLessThanOrEqual(smaller.returnedNodes * 2);
  });

  it('keeps visibility checks bounded for deeply nested detail-page candidates', () => {
    const tags = ['h3', 'p', 'li', 'h4'];
    document.body.innerHTML = `
      <main id="detail-page">
        ${Array.from({length: 24}, (_, cardIndex) => `
          <section class="global-carousel">
            <div class="grid-container"><div class="product-card"><div class="product-card-content">
              ${tags.map((tagName, blockIndex) => `
                <${tagName}>Metacritic detail card ${cardIndex} ${blockIndex} content has enough English text to translate.</${tagName}>
              `).join('')}
            </div></div></div>
          </section>
        `).join('')}
      </main>
    `;

    const originalGetComputedStyle = window.getComputedStyle;
    let getComputedStyleCalls = 0;
    window.getComputedStyle = (...args) => {
      getComputedStyleCalls += 1;
      return originalGetComputedStyle(...args);
    };

    try {
      const blocks = collectTranslationBlocks(document.body);

      expect(blocks).toHaveLength(24 * tags.length);
      expect(getComputedStyleCalls).toBeLessThanOrEqual(
        document.querySelectorAll('*').length * 5
      );
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  });

  it('keeps nested residual segmentation within a linear operation budget', () => {
    const measure = (containerCount) => {
      document.body.innerHTML = `<p id="description">Opening note has enough English words.${Array.from({length: containerCount}, (_, index) => `<span><b>First ${index}: </b>First inline paragraph has enough English words.\n\n<b>Second ${index}: </b>Second inline paragraph has enough English words.</span>Middle note ${index} has enough English words.`).join('')}Closing note has enough English words.</p>`;

      const originalQuerySelectorAll = Element.prototype.querySelectorAll;
      const originalQuerySelector = Element.prototype.querySelector;
      const originalContains = Element.prototype.contains;
      let queryCalls = 0;
      let querySelectorCalls = 0;
      let containsCalls = 0;
      Element.prototype.querySelectorAll = function (...args) {
        queryCalls += 1;
        return originalQuerySelectorAll.apply(this, args);
      };
      Element.prototype.querySelector = function (...args) {
        querySelectorCalls += 1;
        return originalQuerySelector.apply(this, args);
      };
      Element.prototype.contains = function (...args) {
        containsCalls += 1;
        return originalContains.apply(this, args);
      };

      try {
        const blocks = collectTranslationBlocks(document.body);
        return {blocks, queryCalls, querySelectorCalls, containsCalls};
      } finally {
        Element.prototype.querySelectorAll = originalQuerySelectorAll;
        Element.prototype.querySelector = originalQuerySelector;
        Element.prototype.contains = originalContains;
      }
    };

    const smaller = measure(8);
    const larger = measure(16);

    expect(smaller.blocks).toHaveLength(8 * 3 + 1);
    expect(larger.blocks).toHaveLength(16 * 3 + 1);
    expect(larger.queryCalls).toBeLessThanOrEqual(smaller.queryCalls * 2);
    expect(larger.querySelectorCalls).toBeLessThanOrEqual(smaller.querySelectorCalls * 2);
    expect(larger.containsCalls).toBeLessThanOrEqual(smaller.containsCalls * 2);
  });

  it('keeps nested residual boundary checks within a linear operation budget', () => {
    const measure = (containerCount) => {
      document.body.innerHTML = `<p id="description">Opening note has enough English words.${Array.from({length: containerCount}, (_, index) => `<span>Outer introduction ${index} has enough English words. <span><b>First:</b>First paragraph has enough English words.\n\n<b>Second:</b>Second paragraph has enough English words.</span> Outer conclusion ${index} has enough English words.</span>`).join('')}</p>`;

      const originalContains = Element.prototype.contains;
      let containsCalls = 0;
      Element.prototype.contains = function (...args) {
        containsCalls += 1;
        return originalContains.apply(this, args);
      };

      try {
        const blocks = collectTranslationBlocks(document.body);
        return {blocks, containsCalls};
      } finally {
        Element.prototype.contains = originalContains;
      }
    };

    const smaller = measure(8);
    const larger = measure(16);

    expect(smaller.blocks).toHaveLength(8 * 4 + 1);
    expect(larger.blocks).toHaveLength(16 * 4 + 1);
    expect(larger.containsCalls).toBeLessThanOrEqual(smaller.containsCalls * 2);
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

  it('keeps residual segmentation inside the supplied root', () => {
    document.body.innerHTML = `
      <span id="outside">Outside text should never be collected.</span>
      <div id="root">
        Opening review text has enough English words.<br>
        <blockquote>Nested quote has enough English words.</blockquote>
      </div>
    `;

    const root = document.querySelector('#root');
    const outside = document.querySelector('#outside');
    const outsideParent = outside.parentElement;
    const outsideMarkup = outside.outerHTML;
    const blocks = collectTranslationBlocks(root);

    expect(blocks.map((block) => block.text)).toEqual([
      'Opening review text has enough English words.',
      'Nested quote has enough English words.'
    ]);
    expect(blocks.every(({element}) => root.contains(element))).toBe(true);
    expect(outside.parentElement).toBe(outsideParent);
    expect(outside.outerHTML).toBe(outsideMarkup);
    expect(outside.closest('[data-translight-segment="true"]')).toBeNull();
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
