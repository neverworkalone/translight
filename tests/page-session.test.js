// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PageSession } from '../src/content/page-session.js';
import { TRANSLATION_MODES } from '../src/settings.js';

function makeProvider({ translate = async (text) => `ko:${text}` } = {}) {
  return {
    getModelState: async () => 'Available',
    prepare: async () => {},
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
    await wait();

    expect(source.nextElementSibling?.textContent).toBe('ko:A reusable post body.');
    expect(calls).toEqual(['A reusable post body.']);
    session.stop();
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
