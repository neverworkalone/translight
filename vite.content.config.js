import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const noMinify = process.env.TRANSLIGHT_NO_MINIFY === 'true';

export default defineConfig({
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
