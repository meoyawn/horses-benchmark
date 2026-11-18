import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  base: './',
  build: {
    rolldownOptions: {
      input: {
        catalog: resolve(import.meta.dirname, 'index.html'),
        '52fablemax': resolve(import.meta.dirname, '52fablemax/index.html'),
        '62solmax': resolve(import.meta.dirname, '62solmax/index.html'),
        '62astramax': resolve(import.meta.dirname, '62astramax/index.html'),
      },
    },
  },
});
