import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // Import the Tailwind v4 plugin

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Add this to the plugins array
  ],
  server: {
    proxy: {
      // Proxy requests to YOUR backend (port 4000) instead of directly to CoinGecko
      // This prevents CORS issues and uses your backend logic
      '/api': {
        target: 'http://localhost:4000', 
        changeOrigin: true,
      },
    },
  },
});