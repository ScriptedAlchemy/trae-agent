import { defineConfig } from '@rstest/core';
import { resolve } from 'path';

export default defineConfig({
  globals: true,
  testEnvironment: 'node',
  include: ['tests/**/*.{test,spec}.{js,ts}'],
  exclude: ['node_modules/', 'dist/'],
  watch: false, // Disable watch mode by default
  resolve: {
    alias: {
      '@': resolve(__dirname, 'trae_agent'),
    },
  },
  source: {
    include: ['trae_agent/**/*.{js,ts}'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts'],
  },
});
