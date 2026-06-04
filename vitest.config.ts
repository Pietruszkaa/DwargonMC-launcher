import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~types': path.resolve(__dirname, 'src/types'),
      '~components': path.resolve(__dirname, 'src/components')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
