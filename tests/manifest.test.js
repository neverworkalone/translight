import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')
);

describe('extension manifest', () => {
  it('declares permissions for the content-script injection fallback', () => {
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.host_permissions).toContain('<all_urls>');
  });
});
