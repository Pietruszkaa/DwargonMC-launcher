import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~types': path.resolve(__dirname, 'src/types'),
      '~components': path.resolve(__dirname, 'src/components')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
