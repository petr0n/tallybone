import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        gallery: path.resolve(__dirname, 'gallery.html'),
      },
    },
  },
  plugins: [cloudflare(), basicSsl({ name: 'tallybone-dev', ttlDays: 30 })],
  server: {
    https: true,
    host: true,
  },
});
