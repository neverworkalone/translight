import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

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
  plugins: [vue(), copyChromeLocales()],
  build: {
    target: 'es2022',
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
