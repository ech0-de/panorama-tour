import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/tours': {
          ws: true,
          rewriteWsOrigin: true,
          target: 'http://localhost:3030',
      }
    }
  }
})
