import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')
);

describe('extension manifest', () => {
  it('uses temporary access for the manual content-script injection fallback', () => {
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.host_permissions).toBeUndefined();
  });
});
