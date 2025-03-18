import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'public',
  publicDir: '../assets',
  
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  
  server: {
    port: 8889
  },
  
  // Simplify aliases
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, 'assets')
    }
  }
});