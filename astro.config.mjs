import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://envpact.oriz.in',
  output: 'static',
  integrations: [react()],
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
