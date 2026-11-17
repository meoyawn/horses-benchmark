import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  base: './',
  build: {
    rolldownOptions: {
      input: {
        catalog: resolve(import.meta.dirname, 'index.html'),
        equineAtlas: resolve(import.meta.dirname, '62solmax/index.html'),
      },
    },
  },
});
