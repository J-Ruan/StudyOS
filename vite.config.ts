import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: mode === 'android' ? './' : '/StudyOS/',
  plugins: [
    react(),
    ...(mode === 'android'
      ? [
          {
            name: 'android-local-shell',
            transformIndexHtml(html: string) {
              return html.replace(/\s*<link rel="manifest"[^>]*>/g, '');
            },
          },
        ]
      : []),
  ],
  build: {
    outDir: mode === 'android' ? 'dist-android' : 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          database: ['dexie', 'dexie-react-hooks'],
          validation: ['zod'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
}));
