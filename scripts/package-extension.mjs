import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const distDir = resolve(projectRoot, 'dist');
const releaseDir = resolve(projectRoot, 'release');
const archivePath = resolve(releaseDir, 'translight-1.0.zip');

if (!existsSync(resolve(distDir, 'manifest.json'))) {
  throw new Error('Cannot package the extension because dist/manifest.json is missing.');
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(archivePath)) unlinkSync(archivePath);

const result = spawnSync('zip', ['-qr', archivePath, '.', '-x', '*.DS_Store'], {
  cwd: distDir,
  stdio: 'inherit'
});

if (result.status !== 0) {
  throw new Error(`ZIP creation failed with exit code ${result.status}.`);
}

console.log(`Created ${archivePath}`);
