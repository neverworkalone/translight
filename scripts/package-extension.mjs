import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const distDir = resolve(projectRoot, 'dist');
const releaseDir = resolve(projectRoot, 'release');
const archivePath = resolve(releaseDir, 'translight-1.0.0.zip');

if (!existsSync(resolve(distDir, 'manifest.json'))) {
  throw new Error('dist/manifest.json이 없어 확장 프로그램을 패키징할 수 없습니다.');
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(archivePath)) unlinkSync(archivePath);

const result = spawnSync('zip', ['-qr', archivePath, '.', '-x', '*.DS_Store'], {
  cwd: distDir,
  stdio: 'inherit'
});

if (result.status !== 0) {
  throw new Error(`ZIP 생성 실패: 종료 코드 ${result.status}`);
}

console.log(`Created ${archivePath}`);
