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
});
