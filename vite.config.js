import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

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

function copyChromeLocales() {
  return {
    name: 'copy-chrome-locales',
    apply: 'build',
    closeBundle() {
      const destination = `${projectRoot}/dist/_locales`;
      mkdirSync(destination, { recursive: true });
      cpSync(`${projectRoot}/_locales`, destination, { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [vue(), copyChromeLocales(), testProviderFactoryAlias()].filter(Boolean),
  define: {
    __TRANSLIGHT_BUILD_KIND__: JSON.stringify(buildKind),
    __TRANSLIGHT_BUILD_IDENTIFIER__: JSON.stringify(buildIdentifier),
    __TRANSLIGHT_BUILD_COMMIT__: JSON.stringify(buildCommit)
  },
  build: {
    target: 'es2022',
    minify: noMinify ? false : 'esbuild',
    cssMinify: noMinify ? false : 'esbuild',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: `${projectRoot}/options.html`,
        background: `${projectRoot}/src/background/index.js`
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
