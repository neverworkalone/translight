import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const noMinify = process.env.TRANSLIGHT_NO_MINIFY === 'true';
const buildKind = process.env.TRANSLIGHT_BUILD_MODE === 'test' ? 'test' : 'production';
const buildIdentifier = process.env.TRANSLIGHT_BUILD_IDENTIFIER?.trim() || buildKind;
const buildCommit = process.env.TRANSLIGHT_BUILD_COMMIT?.trim() || (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
})();
const buildDirty = (() => {
  if (process.env.TRANSLIGHT_BUILD_DIRTY?.trim() === 'true') return true;
  try {
    return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: projectRoot,
      encoding: 'utf8'
    }).trim().length > 0;
  } catch {
    return null;
  }
})();
const testProviderFactory = `${projectRoot}/src/translation/provider-factory.test-build.js`;

function testProviderFactoryAlias() {
  if (buildKind !== 'test') return null;
  return {
    name: 'test-provider-factory-alias',
    enforce: 'pre',
    resolveId(source) {
      return source.endsWith('/translation/provider-factory.js') ? testProviderFactory : null;
    }
  };
}

export default defineConfig({
  plugins: [testProviderFactoryAlias()].filter(Boolean),
  define: {
    __TRANSLIGHT_BUILD_KIND__: JSON.stringify(buildKind),
    __TRANSLIGHT_BUILD_IDENTIFIER__: JSON.stringify(buildIdentifier),
    __TRANSLIGHT_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __TRANSLIGHT_BUILD_DIRTY__: JSON.stringify(buildDirty)
  },
  build: {
    target: 'es2022',
    minify: noMinify ? false : 'esbuild',
    cssMinify: noMinify ? false : 'esbuild',
    emptyOutDir: false,
    rollupOptions: {
      input: `${projectRoot}/src/content/index.js`,
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'content.js'
      }
    }
  }
});
