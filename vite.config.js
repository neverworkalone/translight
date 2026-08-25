import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: `${projectRoot}/options.html`,
        background: `${projectRoot}/src/background/index.js`,
        content: `${projectRoot}/src/content/index.js`
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
