import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const noMinify = process.env.TRANSLIGHT_NO_MINIFY === 'true';
const buildKind = process.env.TRANSLIGHT_BUILD_MODE === 'test' ? 'test' : 'production';
const buildIdentifier = process.env.TRANSLIGHT_BUILD_IDENTIFIER?.trim() || buildKind;
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
    __TRANSLIGHT_BUILD_IDENTIFIER__: JSON.stringify(buildIdentifier)
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
