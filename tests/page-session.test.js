// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PageSession } from '../src/content/page-session.js';
import { MODEL_STATE } from '../src/translation/model-state.js';
import { TRANSLATION_MODES } from '../src/settings.js';

function makeProvider({
  translate = async (text) => `ko:${text}`,
  prepare = async () => {}
} = {}) {
  return {
    getModelState: async () => 'Available',
    prepare,
    translate,
    cancel: () => {},
    close: () => {}
  };
}

function wait(milliseconds = 140) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('PageSession', () => {
  it('translates blocks while leaving original DOM text untouched', async () => {
    document.body.innerHTML = '<h1>Title</h1><p>First paragraph.</p>';
    const statuses = [];
    const session = new PageSession({
      generation: 1,
      document,
      provider: makeProvider(),
      sendStatus: (status) => statuses.push(status)
    });

    await session.start();

    expect(document.querySelector('h1').textContent).toBe('Title');
    expect(document.querySelector('p').textContent).toBe('First paragraph.');
    expect([...document.querySelectorAll('translight-translation')].map((node) => node.textContent)).toEqual([
      'ko:Title',
      'ko:First paragraph.'
    ]);
    expect(statuses.at(-1).status).toBe('ACTIVE');
    session.stop();
  });

  it('translates direct text inside a semantic Craigslist posting body section', async () => {
    document.body.innerHTML = `
      <section class="page-container">
        <section class="body">
          <section class="userbody">
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
          </section>
        </section>
      </section>
    `;
    const calls = [];
    const session = new PageSession({
      generation: 501,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();

    const postingBody = document.querySelector('#postingbody');
    expect(calls).toEqual([
      'Are you a player looking to join a long established team in Korea?',
      'We have been running since 2011 and are looking for new players for our upcoming league season.',
      'Get in touch with your Kakao ID or phone number.'
    ]);
    const translations = Array.from(postingBody.querySelectorAll('translight-translation'));
    expect(translations).toHaveLength(3);
    expect(translations.map((translation) => translation.textContent)).toEqual(calls.map((text) => `ko:${text}`));
    expect(translations.every((translation) => !translation.textContent.includes('QR Code Link to This Post')))
      .toBe(true);
    session.stop({notify: false});
  });

  it('keeps Amazon review translations outside a collapsed card in paragraph order', async () => {
    document.head.innerHTML = `
      <style>
        [data-a-card-type="basic"] { overflow: hidden; }
      </style>
    `;
    document.body.innerHTML = `
      <div data-hook="reviewContainer">
        <div data-hook="reviewText">
          <div data-a-card-type="basic" class="peek-expand">
            <div class="a-cardui-body">
              <div class="a-reactive-container" style="height:80px">
                <div>
                  <div data-hook="reviewRichContentContainer" lang="en-US">
                    <p id="review-body-first">I absolutely love this bento box! It is the perfect size for packing lunches.</p>
                    <p id="review-body-second">The compartments keep snacks, fruit, and sandwiches organized and fresh.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div data-hook="reviewActions"></div>
      </div>
    `;
    const card = document.querySelector('[data-a-card-type="basic"]');
    const reviewBodies = Array.from(document.querySelectorAll('[data-hook="reviewRichContentContainer"] p'));
    const originalReviews = reviewBodies.map((reviewBody) => reviewBody.textContent);
    const calls = [];
    const session = new PageSession({
      generation: 604,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          if (text === originalReviews[0]) await wait(20);
          return `ko:${text}`;
        }
      })
    });

    try {
      await session.start();

      const translations = Array.from(document.querySelectorAll('translight-translation'));
      expect(calls).toEqual(originalReviews);
      expect(translations.map((translation) => translation.textContent)).toEqual(
        originalReviews.map((review) => `ko:${review}`)
      );
      expect(translations.every((translation) => translation.parentElement === card.parentElement)).toBe(true);
      expect(translations[0].previousElementSibling).toBe(card);
      expect(translations[1].previousElementSibling).toBe(translations[0]);
    } finally {
      session.stop({notify: false});
      document.head.innerHTML = '';
    }

    expect(reviewBodies.map((reviewBody) => reviewBody.textContent)).toEqual(originalReviews);
    expect(document.querySelector('translight-translation')).toBeNull();
  });

  it('keeps Amazon fallback review translations before a collapsed card in paragraph order', async () => {
    document.head.innerHTML = `
      <style>
        [data-a-card-type="basic"] { overflow: hidden; }
      </style>
    `;
    document.body.innerHTML = `
      <div data-hook="reviewContainer">
        <div data-hook="reviewText">
          <div data-a-card-type="basic" class="peek-expand">
            <div class="a-cardui-body">
              <div class="a-reactive-container" style="height:80px">
                <div>
                  <div data-hook="reviewRichContentContainer" lang="en-US">
                    <p id="review-body-first"><span>First review paragraph.</span><span>More first paragraph.</span></p>
                    <p id="review-body-second"><span>Second review paragraph.</span><span>More second paragraph.</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const card = document.querySelector('[data-a-card-type="basic"]');
    const reviewBodies = Array.from(document.querySelectorAll('[data-hook="reviewRichContentContainer"] p'));
    const originalReviews = reviewBodies.map((reviewBody) => reviewBody.textContent);
    const translatedReviews = ['가', '나'];
    const calls = [];
    const session = new PageSession({
      generation: 605,
      document,
      settings: {
        translatePageTitle: false,
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL
      },
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          if (text === originalReviews[0]) await wait(20);
          return text === originalReviews[0] ? translatedReviews[0] : translatedReviews[1];
        }
      })
    });

    try {
      await session.start();

      let translations = Array.from(document.querySelectorAll('translight-translation'));
      expect(calls).toEqual(originalReviews);
      expect(translations.map((translation) => translation.textContent)).toEqual(translatedReviews);
      expect(translations.every((translation) => translation.parentElement === card.parentElement)).toBe(true);
      expect(translations[0].nextElementSibling).toBe(translations[1]);
      expect(translations[1].nextElementSibling).toBe(card);
      expect(reviewBodies.map((reviewBody) => reviewBody.textContent)).toEqual(originalReviews);

      session.applySettings({translationMode: TRANSLATION_MODES.ORIGINAL_TRANSLATION});
      translations = Array.from(document.querySelectorAll('translight-translation'));
      expect(translations.map((translation) => translation.textContent)).toEqual(translatedReviews);
      expect(translations[0].previousElementSibling).toBe(card);
      expect(translations[1].previousElementSibling).toBe(translations[0]);
    } finally {
      session.stop({notify: false});
      document.head.innerHTML = '';
    }

    expect(reviewBodies.map((reviewBody) => reviewBody.textContent)).toEqual(originalReviews);
    expect(document.querySelector('translight-translation')).toBeNull();
  });

  it('interleaves translations for blank-line paragraphs in a YouTube description', async () => {
    document.body.innerHTML = `
      <div id="description-inline-expander">
        <div id="expanded">
          <yt-attributed-string>
            <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">
              <span class="ytAttributedStringLinkInheritColor">First description paragraph.\n\nSecond description paragraph.\n\nThird description paragraph.</span>
            </span>
          </yt-attributed-string>
        </div>
      </div>
    `;
    const expanded = document.querySelector('#expanded');
    const originalDescription = expanded.textContent;
    const expectedTexts = [
      'First description paragraph.',
      'Second description paragraph.',
      'Third description paragraph.'
    ];
    const calls = [];
    const session = new PageSession({
      generation: 601,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();

    const segments = Array.from(expanded.querySelectorAll('[data-translight-segment="true"]'));
    const translations = Array.from(expanded.querySelectorAll('translight-translation'));
    expect(calls.sort()).toEqual(expectedTexts.sort());
    expect(translations.map((translation) => translation.textContent)).toEqual(
      expectedTexts.map((text) => `ko:${text}`)
    );
    expect(segments.every((segment) => segment.nextElementSibling?.matches('translight-translation')))
      .toBe(true);

    session.stop({notify: false});
    expect(expanded.textContent).toBe(originalDescription);
    expect(expanded.querySelector('translight-translation')).toBeNull();
    expect(expanded.querySelector('[data-translight-segment="true"]')).toBeNull();
  });

  it('places a YouTube comment translation after the original comment', async () => {
    document.body.innerHTML = `
      <div id="main" style="display:flex; flex-direction:column">
        <div id="header"></div>
        <ytd-expander id="expander">
          <div id="content">
            <yt-pdg-comment-chip-renderer id="paid-comment-chip" hidden>
              <div id="comment-chip-container"></div>
            </yt-pdg-comment-chip-renderer>
            <yt-attributed-string id="content-text">
              <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">
                China is an incredibly beautiful country. And your videos are simply wonderful!
              </span>
            </yt-attributed-string>
          </div>
        </ytd-expander>
        <div id="actions"></div>
      </div>
    `;
    const comment = document.querySelector('#content-text');
    const originalComment = comment.textContent.trim();
    const calls = [];
    const session = new PageSession({
      generation: 602,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    try {
      await session.start();

      const translation = document.querySelector('translight-translation');
      expect(calls).toEqual([originalComment]);
      expect(translation).not.toBeNull();
      expect(Boolean(comment.compareDocumentPosition(translation) & Node.DOCUMENT_POSITION_FOLLOWING))
        .toBe(true);
    } finally {
      session.stop({notify: false});
    }

    expect(comment.textContent.trim()).toBe(originalComment);
    expect(document.querySelector('translight-translation')).toBeNull();
  });

  it('skips a document with no translatable blocks', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = '<p>한국어 문서는 이미 대상 언어로 작성되어 있습니다.</p>';
    let calls = 0;
    let providerChecks = 0;
    const statuses = [];
    const session = new PageSession({
      generation: 11,
      document,
      provider: {
        getModelState: async () => {
          providerChecks += 1;
          return 'Available';
        },
        prepare: async () => {
          providerChecks += 1;
        },
        translate: async (text) => {
          calls += 1;
          return `ko:${text}`;
        },
        cancel: () => {},
        close: () => {}
      },
      sendStatus: (status) => statuses.push(status)
    });

    await session.start();

    expect(calls).toBe(0);
    expect(providerChecks).toBe(0);
    expect(document.querySelector('p').textContent).toBe('한국어 문서는 이미 대상 언어로 작성되어 있습니다.');
    expect(document.querySelector('translight-translation')).toBeNull();
    expect(statuses.at(-1)).toMatchObject({status: 'SKIPPED', reason: 'TARGET_LANGUAGE'});
    document.documentElement.removeAttribute('lang');
    session.stop({notify: false});
  });

  it('waits for English content after an initially Korean-only page', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = '<p>처음에는 한국어 콘텐츠만 있습니다.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 113,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    expect(calls).toEqual([]);

    const added = document.createElement('p');
    added.textContent = 'A new English post arrived after the first route.';
    document.body.appendChild(added);
    await wait(180);

    expect(calls).toEqual(['A new English post arrived after the first route.']);
    expect(added.nextElementSibling?.textContent)
      .toBe('ko:A new English post arrived after the first route.');
    session.stop({notify: false});
    document.documentElement.removeAttribute('lang');
  });

  it('does not restart model preparation for consecutive watch-only renders', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = '<p>처음에는 한국어 콘텐츠만 있습니다.</p>';
    let releaseModel;
    const modelReady = new Promise((resolve) => { releaseModel = resolve; });
    let modelChecks = 0;
    const calls = [];
    const session = new PageSession({
      generation: 114,
      document,
      settings: {translatePageTitle: false},
      provider: {
        getModelState: async () => {
          modelChecks += 1;
          return modelReady;
        },
        prepare: async () => {},
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        },
        cancel: () => {},
        close: () => {}
      }
    });

    await session.start();
    const first = document.createElement('p');
    first.textContent = 'The first post arrived.';
    document.body.appendChild(first);
    await wait(130);
    const second = document.createElement('p');
    second.textContent = 'The second post arrived right after it.';
    document.body.appendChild(second);
    await wait(130);

    expect(modelChecks).toBe(1);
    releaseModel('Available');
    await wait(180);
    expect(calls).toEqual(expect.arrayContaining([
      'The first post arrived.',
      'The second post arrived right after it.'
    ]));
    session.stop({notify: false});
    document.documentElement.removeAttribute('lang');
  });

  it('translates an English block when a SPA reveals it by changing attributes', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = '<p id="revealed" hidden>English content revealed later.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 115,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    document.querySelector('#revealed').hidden = false;
    await wait(220);

    expect(calls).toEqual(['English content revealed later.']);
    expect(document.querySelector('#revealed + translight-translation')?.textContent)
      .toBe('ko:English content revealed later.');
    session.stop({notify: false});
    document.documentElement.removeAttribute('lang');
  });

  it('drops late results from the previous route and reuses the prepared provider', async () => {
    document.body.innerHTML = '<p id="old">Old route content.</p>';
    const resolvers = new Map();
    let prepareCalls = 0;
    const calls = [];
    const session = new PageSession({
      generation: 116,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        prepare: async () => { prepareCalls += 1; },
        translate: (text) => {
          calls.push(text);
          if (text === 'Old route content.') {
            return new Promise((resolve) => resolvers.set(text, resolve));
          }
          return Promise.resolve(`ko:${text}`);
        }
      })
    });

    const run = session.start();
    await wait(20);
    expect(calls).toEqual(['Old route content.']);

    expect(session.beginRouteChange({routeGeneration: 1})).toBe(true);
    expect(session.applyRouteDecision({
      routeGeneration: 1,
      continueTranslation: true
    })).toBe(true);
    resolvers.get('Old route content.')('ko:Old route content.');
    document.querySelector('#old').remove();
    const next = document.createElement('p');
    next.id = 'next';
    next.textContent = 'New route content.';
    document.body.appendChild(next);

    await wait(260);
    expect(prepareCalls).toBe(1);
    expect(calls).toEqual(['Old route content.', 'New route content.']);
    expect(document.querySelector('#old + translight-translation')).toBeNull();
    expect(document.querySelector('#next + translight-translation')?.textContent)
      .toBe('ko:New route content.');
    session.stop({notify: false});
    await run;
  });

  it('finds translated blocks after a route replaces the body', async () => {
    document.body.innerHTML = '<p>Initial route content.</p>';
    const session = new PageSession({
      generation: 117,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider()
    });

    await session.start();
    expect(session.beginRouteChange({routeGeneration: 1})).toBe(true);
    expect(session.applyRouteDecision({routeGeneration: 1, continueTranslation: true})).toBe(true);

    const replacement = document.createElement('body');
    replacement.innerHTML = '<main><p>Content rendered by the next route.</p></main>';
    document.documentElement.replaceChild(replacement, document.body);
    await wait(260);

    expect(document.querySelector('main p + translight-translation')?.textContent)
      .toBe('ko:Content rendered by the next route.');
    session.stop({notify: false});
  });

  it('does not let a previous route title result overwrite the next title', async () => {
    document.title = 'Old route title';
    document.body.innerHTML = '<p>Old route body.</p>';
    const resolvers = [];
    const calls = [];
    const session = new PageSession({
      generation: 118,
      document,
      settings: {translatePageTitle: true},
      provider: makeProvider({
        translate: (text) => {
          calls.push(text);
          if (text === 'Old route title') {
            return new Promise((resolve) => resolvers.push(resolve));
          }
          return Promise.resolve(`ko:${text}`);
        }
      })
    });

    const run = session.start();
    await wait(20);
    expect(calls).toEqual(['Old route title']);
    expect(session.beginRouteChange({routeGeneration: 1})).toBe(true);
    expect(session.applyRouteDecision({routeGeneration: 1, continueTranslation: true})).toBe(true);
    resolvers[0]('ko:Old route title');
    document.title = 'New route title';
    document.body.innerHTML = '<p>New route body.</p>';

    await wait(260);
    expect(document.title).toBe('ko:New route title');
    expect(document.body.textContent).toContain('New route body.');
    expect(document.body.textContent).not.toContain('ko:Old route title');
    expect(calls).toEqual(expect.arrayContaining(['Old route title', 'New route title', 'New route body.']));
    session.stop({notify: false});
    await run;
  });

  it('applies the route guard to a cache hit as well as a provider response', async () => {
    document.body.innerHTML = '<p id="old">Cached old route.</p>';
    const cached = new Map([['default\u0000Cached old route.', 'ko:Cached old route.']]);
    let session;
    let triggered = false;
    class RouteChangingCache extends Map {
      has(key) {
        if (!triggered && key === 'default\u0000Cached old route.') {
          triggered = true;
          session.beginRouteChange({routeGeneration: 1});
          document.body.innerHTML = '<p id="new">Cached new route.</p>';
          session.applyRouteDecision({routeGeneration: 1, continueTranslation: true});
        }
        return super.has(key);
      }
    }
    const translationCache = new RouteChangingCache(cached);
    const calls = [];
    session = new PageSession({
      generation: 119,
      document,
      settings: {translatePageTitle: false},
      translationCache,
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    await wait(220);
    expect(calls).toEqual(['Cached new route.']);
    expect(document.querySelector('#old + translight-translation')).toBeNull();
    expect(document.querySelector('#new + translight-translation')?.textContent)
      .toBe('ko:Cached new route.');
    session.stop({notify: false});
  });

  it('translates English content on a page whose UI declares Korean', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = `
      <nav><a href="#">홈</a><a href="#">알림</a></nav>
      <div lang="ko"><p id="ui">로그인하고 설정을 확인하세요.</p></div>
      <main>
        <article>
          <h1 id="post-title">Why this community keeps growing</h1>
          <p id="post">This is an English post written by a community member.</p>
          <p id="comment">The comments are also written in English.</p>
        </article>
      </main>
    `;
    const calls = [];
    const session = new PageSession({
      generation: 111,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();

    expect(calls).toEqual([
      'Why this community keeps growing',
      'This is an English post written by a community member.',
      'The comments are also written in English.'
    ]);
    expect(document.querySelector('#ui translight-translation')).toBeNull();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(3);
    session.stop();
    document.documentElement.removeAttribute('lang');
  });

  it('translates an English title without trusting the root language', async () => {
    document.documentElement.lang = 'ko-KR';
    document.title = 'An English title for a post';
    document.body.innerHTML = '<p>한국어 본문이 있는 페이지입니다.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 112,
      document,
      settings: {translatePageTitle: true},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();

    expect(calls).toEqual(['An English title for a post']);
    expect(document.title).toBe('ko:An English title for a post');
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    session.stop();
    document.documentElement.removeAttribute('lang');
  });

  it('creates the default provider with the session target language', () => {
    const session = new PageSession({
      generation: 12,
      document,
      settings: {targetLanguage: 'ko'}
    });

    expect(session.provider.targetLanguage).toBe('ko');
    expect(session.provider.pair).toBe('en:ko');
    session.stop({notify: false});
  });

  it('translates table cells and rechecks cells whose text changes', async () => {
    document.body.innerHTML = `
      <article>
        <p>Article introduction.</p>
        <table><tbody><tr><td id="cell">Original cell.</td></tr></tbody></table>
        <pre>const keepThisCode = true;</pre>
      </article>
    `;
    const session = new PageSession({
      generation: 13,
      document,
      provider: makeProvider()
    });

    await session.start();

    expect(document.querySelector('#cell translight-translation')?.textContent).toBe('ko:Original cell.');
    expect(document.querySelector('pre').textContent).toBe('const keepThisCode = true;');

    document.querySelector('#cell').firstChild.data = 'Changed cell.';
    await wait();
    expect(document.querySelector('#cell translight-translation')?.textContent).toBe('ko:Changed cell.');

    session.stop();
  });

  it('does not insert late results after cancellation', async () => {
    document.body.innerHTML = '<p>Pending paragraph.</p>';
    const resolvers = [];
    const session = new PageSession({
      generation: 2,
      document,
      provider: makeProvider({
        translate: () => new Promise((resolve) => resolvers.push(resolve))
      })
    });

    const run = session.start();
    await Promise.resolve();
    session.stop();
    for (const resolve of resolvers) resolve('Late translation');
    await run;

    expect(document.querySelector('translight-translation')).toBeNull();
    expect(document.querySelector('p').textContent).toBe('Pending paragraph.');
  });

  it('does not mutate mixed content before model availability is confirmed', async () => {
    document.body.innerHTML = '<div id="guide">First paragraph.<div><br></div>Second paragraph.</div>';
    const original = document.body.innerHTML;
    const statuses = [];
    const session = new PageSession({
      generation: 15,
      document,
      provider: {
        getModelState: async () => MODEL_STATE.UNAVAILABLE,
        prepare: async () => {},
        translate: async () => '번역',
        cancel: () => {},
        close: () => {}
      },
      sendStatus: (status) => statuses.push(status)
    });

    await session.start();

    expect(document.body.innerHTML).toBe(original);
    expect(document.querySelector('[data-translight-segment="true"]')).toBeNull();
    expect(statuses.at(-1)?.status).toBe('ERROR');
  });

  it('restores uncommitted mixed-content segments after cancellation', async () => {
    document.body.innerHTML = '<div id="guide">First paragraph.<div><br></div>Second paragraph.</div>';
    const original = document.body.innerHTML;
    const resolvers = [];
    let resolveStarted;
    const started = new Promise((resolve) => { resolveStarted = resolve; });
    const session = new PageSession({
      generation: 16,
      document,
      provider: makeProvider({
        translate: () => {
          resolveStarted();
          return new Promise((resolve) => resolvers.push(resolve));
        }
      })
    });

    const run = session.start();
    await started;
    expect(document.querySelectorAll('[data-translight-segment="true"]')).toHaveLength(2);

    session.stop({notify: false});
    resolvers.forEach((resolve) => resolve('Late translation'));
    await run;

    expect(document.body.innerHTML).toBe(original);
    expect(document.querySelector('[data-translight-segment="true"]')).toBeNull();
  });

  it('restores a failed segment together with successful siblings', async () => {
    document.body.innerHTML = '<div id="guide">First paragraph.<div><br></div>Second paragraph.</div>';
    const original = document.body.innerHTML;
    const session = new PageSession({
      generation: 17,
      document,
      provider: makeProvider({
        translate: async (text) => {
          if (text.includes('First')) return '첫 번째 번역';
          throw new Error('one segment failed');
        }
      })
    });

    await session.start();

    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    expect(document.querySelectorAll('[data-translight-segment="true"]')).toHaveLength(2);
    session.stop({notify: false});
    expect(document.body.innerHTML).toBe(original);
  });

  it('removes generated nodes and styles when translation fails', async () => {
    document.body.innerHTML = '<p>Safe failure paragraph.</p>';
    const statuses = [];
    const session = new PageSession({
      generation: 14,
      document,
      provider: makeProvider({
        translate: async () => {
          throw new Error('translator failed');
        }
      }),
      sendStatus: (status) => statuses.push(status)
    });

    await session.start();

    expect(statuses.at(-1).status).toBe('ERROR');
    expect(document.querySelector('p').textContent).toBe('Safe failure paragraph.');
    expect(document.querySelector('translight-translation')).toBeNull();
    expect(document.querySelector('style[data-translight-generated="true"]')).toBeNull();
    session.stop({notify: false});
  });

  it('can be started and stopped repeatedly without accumulating nodes', async () => {
    document.body.innerHTML = '<p>Repeatable paragraph.</p>';
    const session = new PageSession({
      generation: 3,
      document,
      provider: makeProvider()
    });

    await session.start();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    session.stop();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);

    await session.start();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    session.stop();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    expect(document.querySelector('p').textContent).toBe('Repeatable paragraph.');
  });

  it('translates the page title and dynamically added or changed blocks', async () => {
    document.title = 'Page title';
    document.body.innerHTML = '<p id="first">First paragraph.</p>';
    const session = new PageSession({
      generation: 4,
      document,
      provider: makeProvider()
    });

    await session.start();
    expect(document.title).toBe('ko:Page title');
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);

    const added = document.createElement('p');
    added.textContent = 'Added paragraph.';
    document.body.appendChild(added);
    await wait();
    expect([...document.querySelectorAll('translight-translation')].map((node) => node.textContent))
      .toContain('ko:Added paragraph.');

    document.querySelector('#first').firstChild.data = 'Changed paragraph.';
    await wait();
    expect([...document.querySelectorAll('translight-translation')].map((node) => node.textContent))
      .toContain('ko:Changed paragraph.');

    session.stop();
    expect(document.title).toBe('Page title');
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
    const afterStop = document.createElement('p');
    afterStop.textContent = 'Must remain original.';
    document.body.appendChild(afterStop);
    await wait();
    expect(document.querySelectorAll('translight-translation')).toHaveLength(0);
  });

  it('rechecks a block when a SPA appends or removes its text nodes', async () => {
    document.body.innerHTML = '<p id="source">Base text.</p>';
    const session = new PageSession({
      generation: 41,
      document,
      provider: makeProvider()
    });

    await session.start();
    const source = document.querySelector('#source');
    source.appendChild(document.createTextNode(' Added text.'));
    await wait();
    expect(document.querySelector('translight-translation').textContent).toBe('ko:Base text. Added text.');

    source.firstChild.remove();
    await wait();
    expect(document.querySelector('translight-translation').textContent).toBe('ko:Added text.');

    const translation = document.querySelector('translight-translation');
    source.remove();
    await wait(20);
    expect(translation.isConnected).toBe(false);
    session.stop();
  });

  it('retranslates a reused source when a SPA removes its generated translation', async () => {
    document.body.innerHTML = '<p id="source">A reusable post body.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 411,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    const source = document.querySelector('#source');
    const generated = source.nextElementSibling;
    expect(generated?.tagName.toLowerCase()).toBe('translight-translation');
    generated.remove();
    await wait(20);
    expect(source.nextElementSibling).toBeNull();
    await wait(500);

    expect(source.nextElementSibling?.textContent).toBe('ko:A reusable post body.');
    expect(calls).toEqual(['A reusable post body.']);
    session.stop();
  });

  it('restores a translation when a host rerenders the children of a live source', async () => {
    document.body.innerHTML = '<ul><li id="source">A reusable list item.</li></ul>';
    const calls = [];
    const session = new PageSession({
      generation: 412,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    const source = document.querySelector('#source');
    const generated = source.querySelector('translight-translation');
    source.innerHTML = 'A reusable list item.';
    await wait(20);
    expect(source.querySelector('translight-translation')).toBeNull();
    await wait(500);

    expect(source.querySelector('translight-translation')).toBe(generated);
    expect(source.querySelector('translight-translation')?.textContent)
      .toBe('ko:A reusable list item.');
    expect(calls).toEqual(['A reusable list item.']);
    session.stop();
  });

  it('recollects a completely new source element and reuses the translation cache', async () => {
    document.body.innerHTML = '<ul><li id="source">A reusable list item.</li></ul>';
    const calls = [];
    const session = new PageSession({
      generation: 413,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    const source = document.querySelector('#source');
    const generated = source.querySelector('translight-translation');
    const replacement = document.createElement('li');
    replacement.id = 'source';
    replacement.textContent = 'A reusable list item.';
    source.replaceWith(replacement);
    await wait(220);

    expect(replacement.querySelector('translight-translation')).not.toBe(generated);
    expect(replacement.querySelector('translight-translation')?.textContent)
      .toBe('ko:A reusable list item.');
    expect(calls).toEqual(['A reusable list item.']);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    expect(session.renderer.records.size).toBe(1);
    expect(session.renderer.hasRecord(source)).toBe(false);
    expect(session.renderer.hasRecord(replacement)).toBe(true);
    session.stop();
  });

  it('keeps an inline-list translation through a containing card rerender', async () => {
    document.body.innerHTML = `
      <ul id="awards">
        <li id="card" style="display:flex;flex-wrap:wrap">
          <div>
            <ul id="inline-list" style="display:inline">
              <li id="source"><span>1 win &amp; 3 nominations total</span></li>
            </ul>
          </div>
        </li>
      </ul>
    `;
    const calls = [];
    const session = new PageSession({
      generation: 4131,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    const source = document.querySelector('#source');
    const translation = document.querySelector('translight-translation');
    const card = document.querySelector('#card');
    expect(translation?.parentElement).toBe(document.querySelector('#awards'));
    expect(translation?.previousElementSibling).toBe(card);

    const replacementList = document.createElement('ul');
    replacementList.id = 'inline-list';
    replacementList.style.display = 'inline';
    replacementList.innerHTML = '<li id="replacement"><span>1 win &amp; 3 nominations total</span></li>';
    source.parentElement.replaceWith(replacementList);
    const replacement = replacementList.querySelector('#replacement');
    await wait(220);

    expect(session.renderer.hasRecord(replacement)).toBe(true);
    expect(document.querySelectorAll('translight-translation')).toHaveLength(1);
    expect(document.querySelector('translight-translation')).toBe(translation);
    expect(translation.parentElement).toBe(document.querySelector('#awards'));
    expect(calls).toEqual(['1 win & 3 nominations total']);
    session.stop();
  });

  it('stops recovering a translation after the host removes it twice', async () => {
    document.body.innerHTML = '<p id="source">A stable post body.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 414,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    const source = document.querySelector('#source');
    let hostRemovals = 0;
    const hostObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes ?? []) {
          if (node.nodeType !== 1 || !node.matches('translight-translation') ||
              node.previousElementSibling !== source) continue;
          hostRemovals += 1;
          node.remove();
        }
      }
    });
    hostObserver.observe(document.body, {childList: true, subtree: true});

    try {
      await session.start();
      await wait(900);

      expect(hostRemovals).toBe(2);
      expect(session.recoveryTimer).toBeNull();
      expect(session.pendingRecoveryElements.size).toBe(0);
      expect(source.nextElementSibling).toBeNull();

      const added = document.createElement('p');
      added.textContent = 'A later post body.';
      document.body.appendChild(added);
      await wait(220);

      expect(added.nextElementSibling?.textContent).toBe('ko:A later post body.');
      expect(calls).toEqual(['A stable post body.', 'A later post body.']);
      expect(session.running).toBe(true);
    } finally {
      hostObserver.disconnect();
      session.stop();
    }
  });

  it('stops recovering a YouTube comment after its hidden chip removes the translation twice', async () => {
    document.body.innerHTML = `
      <div id="main" style="display:flex; flex-direction:column">
        <div id="header"></div>
        <ytd-expander id="expander">
          <div id="content">
            <yt-pdg-comment-chip-renderer id="paid-comment-chip" hidden>
              <div id="comment-chip-container"></div>
            </yt-pdg-comment-chip-renderer>
            <yt-attributed-string id="content-text">
              <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">
                China is an incredibly beautiful country. And your videos are simply wonderful!
              </span>
            </yt-attributed-string>
          </div>
        </ytd-expander>
        <div id="actions"></div>
      </div>
    `;
    const content = document.querySelector('#content');
    const comment = document.querySelector('#content-text');
    const originalComment = comment.textContent.trim();
    const calls = [];
    let hostRemovals = 0;
    const session = new PageSession({
      generation: 418,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });
    const hostObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes ?? []) {
          if (node.nodeType !== 1 || !node.matches('translight-translation') ||
              node.previousElementSibling !== content) continue;
          hostRemovals += 1;
          node.remove();
        }
      }
    });
    hostObserver.observe(document.body, {childList: true, subtree: true});

    try {
      await session.start();
      await wait(900);

      expect(hostRemovals).toBe(2);
      expect(session.recoveryTimer).toBeNull();
      expect(session.pendingRecoveryElements.size).toBe(0);
      expect(content.nextElementSibling).toBeNull();
      expect(calls).toEqual([originalComment]);
      expect(session.renderer.records.size).toBe(1);
      expect([...session.renderer.records.values()][0].recoveryAttempts).toBe(1);
    } finally {
      hostObserver.disconnect();
      session.stop({notify: false});
    }
  });

  it('waits for the final DOM in a burst of SPA renders', async () => {
    document.body.innerHTML = '<div id="root"><p id="source">Initial post body.</p></div>';
    const calls = [];
    const session = new PageSession({
      generation: 415,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    try {
      let source = document.querySelector('#source');
      for (const text of ['First interim body.', 'Second interim body.', 'Final post body.']) {
        const root = document.querySelector('#root');
        root.innerHTML = `<p id="source">${text}</p>`;
        source = root.querySelector('#source');
        await wait(20);
      }
      expect(calls).toEqual(['Initial post body.']);
      await wait(220);

      expect(source.nextElementSibling?.textContent).toBe('ko:Final post body.');
      expect(calls).toEqual(['Initial post body.', 'Final post body.']);
    } finally {
      session.stop();
    }
  });

  it('clears pending translation recovery when a session stops', async () => {
    document.body.innerHTML = '<p id="source">A pending post body.</p>';
    const session = new PageSession({
      generation: 416,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider()
    });

    await session.start();
    document.querySelector('#source').nextElementSibling.remove();
    await wait(20);
    expect(session.recoveryTimer).not.toBeNull();

    session.stop({notify: false});
    expect(session.recoveryTimer).toBeNull();
    expect(session.pendingRecoveryElements.size).toBe(0);
    await wait(500);
    expect(document.querySelector('translight-translation')).toBeNull();
  });

  it('clears pending translation recovery when a route starts', async () => {
    document.body.innerHTML = '<p id="source">A route-bound post body.</p>';
    const session = new PageSession({
      generation: 417,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider()
    });

    await session.start();
    document.querySelector('#source').nextElementSibling.remove();
    await wait(20);
    expect(session.recoveryTimer).not.toBeNull();

    expect(session.beginRouteChange({routeGeneration: 1})).toBe(true);
    expect(session.recoveryTimer).toBeNull();
    expect(session.pendingRecoveryElements.size).toBe(0);
    session.applyRouteDecision({routeGeneration: 1, continueTranslation: false});
  });

  it('translates Korean-to-English changes and removes English-to-Korean translations', async () => {
    document.documentElement.lang = 'ko-KR';
    document.body.innerHTML = `
      <p id="changing-korean">처음에는 한국어 콘텐츠입니다.</p>
      <p id="changing-english">This block starts in English.</p>
    `;
    const calls = [];
    const session = new PageSession({
      generation: 43,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    expect(calls).toEqual(['This block starts in English.']);

    document.querySelector('#changing-korean').firstChild.data =
      'This block changed from Korean to English.';
    await wait();
    expect(document.querySelector('#changing-korean + translight-translation')?.textContent)
      .toBe('ko:This block changed from Korean to English.');

    document.querySelector('#changing-english').firstChild.data =
      '이 블록은 이제 한국어 콘텐츠입니다.';
    await wait();
    expect(document.querySelector('#changing-english + translight-translation')).toBeNull();
    expect(calls).toEqual([
      'This block starts in English.',
      'This block changed from Korean to English.'
    ]);
    session.stop();
    document.documentElement.removeAttribute('lang');
  });

  it('restores inline source text before retranslation after a replacement update', async () => {
    document.body.innerHTML = '<p id="source">Visit <a href="https://openai.com">OpenAI</a> docs</p>';
    const inputs = [];
    const session = new PageSession({
      generation: 42,
      document,
      settings: {
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL,
        translatePageTitle: false
      },
      provider: makeProvider({
        translate: async (text) => {
          inputs.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    const anchor = document.querySelector('a');
    const anchorText = anchor.querySelector(
      '[data-translight-replacement-text="true"]'
    )?.firstChild ?? anchor.firstChild;
    anchorText.data = 'OpenAI team';
    await wait();

    expect(inputs).toContain('Visit OpenAI docs');
    expect(inputs).toContain('Visit OpenAI team docs');
    expect(inputs).not.toContain(expect.stringContaining('ko:Visit OpenAI team docs'));

    session.stop();
    expect(document.body.innerHTML).toBe(
      '<p id="source">Visit <a href="https://openai.com">OpenAI team</a> docs</p>'
    );
  });

  it('applies mode changes without calling the provider again', async () => {
    document.body.innerHTML = '<p>Mode paragraph.</p>';
    let calls = 0;
    const session = new PageSession({
      generation: 5,
      document,
      settings: {translationMode: 'original-translation'},
      provider: makeProvider({translate: async (text) => { calls += 1; return `ko:${text}`; }})
    });

    await session.start();
    const before = calls;
    session.applySettings({translationMode: 'translation-only', displayStyle: 'solid-border'});
    expect(calls).toBe(before);
    expect(document.querySelector('p').textContent).toBe('ko:Mode paragraph.');
    expect(document.querySelector('translight-translation')).toBeNull();
    expect(document.querySelector('p').getAttribute('data-translight-replaced')).toBe('true');
    expect(document.querySelector('p').hasAttribute('data-translight-style')).toBe(false);
    session.applySettings({translationMode: 'translation-original'});
    expect(document.querySelector('p').textContent).toBe('ko:Mode paragraph.');
    expect(document.querySelector('p').nextElementSibling?.textContent).toBe('Mode paragraph.');
    expect(document.querySelector('p').hasAttribute('data-translight-style')).toBe(false);
    expect(document.querySelector('p [data-translight-replacement-text="true"]')
      ?.getAttribute('data-translight-style')).toBe('solid-border');
    await wait();
    expect(calls).toBe(before);
    session.stop();
    expect(document.querySelector('p').textContent).toBe('Mode paragraph.');
  });

  it('respects the page-title setting and applies it to an open session', async () => {
    document.title = 'Untitled page';
    document.body.innerHTML = '<p>Title setting.</p>';
    const session = new PageSession({
      generation: 51,
      document,
      settings: {translatePageTitle: false},
      provider: makeProvider()
    });

    await session.start();
    expect(document.title).toBe('Untitled page');
    session.applySettings({translatePageTitle: true});
    await wait(20);
    expect(document.title).toBe('ko:Untitled page');
    session.applySettings({translatePageTitle: false});
    expect(document.title).toBe('Untitled page');
    session.stop();
  });

  it('keeps page titles translation-only even in translation-original mode', async () => {
    document.title = 'Original title';
    document.body.innerHTML = '<p>Title mode.</p>';
    const session = new PageSession({
      generation: 52,
      document,
      settings: {
        translationMode: TRANSLATION_MODES.TRANSLATION_ORIGINAL,
        translatePageTitle: true
      },
      provider: makeProvider()
    });

    await session.start();

    expect(document.title).toBe('ko:Original title');
    expect(document.title).not.toContain('Original title\n');
    session.stop();
    expect(document.title).toBe('Original title');
  });

  it('retranslates a title when a site replaces the title element', async () => {
    document.title = 'First title';
    document.body.innerHTML = '<p>Title replacement.</p>';
    const session = new PageSession({
      generation: 53,
      document,
      settings: {translatePageTitle: true},
      provider: makeProvider()
    });

    await session.start();
    expect(document.title).toBe('ko:First title');

    const replacement = document.createElement('title');
    replacement.textContent = 'Second title';
    document.head.replaceChild(replacement, document.querySelector('title'));
    await wait();

    expect(document.title).toBe('ko:Second title');
    session.stop();
  });

  it('does not translate a title after its content changes to Korean', async () => {
    document.documentElement.lang = 'ko-KR';
    document.title = 'Initial English title';
    document.body.innerHTML = '<p>English body content keeps the session active.</p>';
    const calls = [];
    const session = new PageSession({
      generation: 54,
      document,
      settings: {translatePageTitle: true},
      provider: makeProvider({
        translate: async (text) => {
          calls.push(text);
          return `ko:${text}`;
        }
      })
    });

    await session.start();
    expect(document.title).toBe('ko:Initial English title');

    document.title = '한국어 제목으로 변경되었습니다.';
    await wait();

    expect(document.title).toBe('한국어 제목으로 변경되었습니다.');
    expect(calls).toEqual(['Initial English title', 'English body content keeps the session active.']);
    session.stop();
    document.documentElement.removeAttribute('lang');
  });

  it('starts with visible blocks, then adjacent blocks, then document-order blocks', async () => {
    document.title = '';
    document.body.innerHTML = `
      <p id="far">Far block</p>
      <p id="adjacent">Adjacent block</p>
      <p id="visible">Visible block</p>
    `;
    document.querySelector('#far').getBoundingClientRect = () => ({top: 2200, bottom: 2250, left: 0, right: 100});
    document.querySelector('#adjacent').getBoundingClientRect = () => ({top: 820, bottom: 870, left: 0, right: 100});
    document.querySelector('#visible').getBoundingClientRect = () => ({top: 100, bottom: 150, left: 0, right: 100});
    const calls = [];
    const session = new PageSession({
      generation: 6,
      document,
      provider: makeProvider({translate: async (text) => { calls.push(text); return `ko:${text}`; }})
    });

    await session.start();
    expect(calls.slice(0, 3)).toEqual(['Visible block', 'Adjacent block', 'Far block']);
    session.stop();
  });
});
