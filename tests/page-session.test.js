// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PageSession } from '../src/content/page-session.js';

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
    expect(document.querySelector('[data-translight-original-hidden="true"]')).not.toBeNull();
    expect(document.querySelector('translight-translation').getAttribute('data-translight-style'))
      .toBe('solid-border');
    session.stop();
    expect(document.querySelector('p').hasAttribute('data-translight-original-hidden')).toBe(false);
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
