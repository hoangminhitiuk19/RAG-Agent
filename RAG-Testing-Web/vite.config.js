import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables from .env files
  // This ensures variables are loaded regardless of the root directory setting
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    root: 'public',
    publicDir: '../assets',
    
    // Make loaded env variables available to your app
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL)
    },
    
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    
    server: {
      port: 8889
    },
    
    resolve: {
      alias: {
        '@src': path.resolve(__dirname, 'src'),
        '@assets': path.resolve(__dirname, 'assets')
      }
    }
  };
});