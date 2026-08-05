import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://envpact-dashboard-app.oriz.in',
  output: 'static',
  integrations: [react()],
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
