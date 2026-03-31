import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/core': path.resolve(__dirname, 'src/core'),
      '@/modules': path.resolve(__dirname, 'src/modules'),
      '@/adapters': path.resolve(__dirname, 'src/adapters'),
      '@/api': path.resolve(__dirname, 'src/api'),
      '@/web': path.resolve(__dirname, 'src/web'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/types': path.resolve(__dirname, 'src/shared/types/index.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});