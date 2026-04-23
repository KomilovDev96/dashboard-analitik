import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-router-dom')) return 'vendor';
            if (id.includes('antd') || id.includes('@ant-design')) return 'antd';
            if (id.includes('@tanstack')) return 'query';
            if (id.includes('zustand')) return 'state';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
