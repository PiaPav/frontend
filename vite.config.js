import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'reactflow-vendor': ['reactflow'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/health': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
      '/v1': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
      '/grpc': {
        target: 'http://78.153.139.47:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/grpc/, ''),
        // КРИТИЧНО для streaming:
        selfHandleResponse: false, // Vite будет проксировать напрямую
        // ⏱️ УВЕЛИЧИВАЕМ TIMEOUT ДО 5 МИНУТ для долгих анализов
        timeout: 300000, // 5 минут (300 секунд)
        proxyTimeout: 300000,
        configure: (proxy, options) => {
          // Отключаем буферизацию на уровне http-proxy-middleware
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Убеждаемся что headers правильные
            proxyReq.setHeader('X-Grpc-Web', '1');
            console.log('[Vite gRPC Proxy] Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Vite gRPC Proxy] Response:', proxyRes.statusCode, proxyRes.headers['content-type']);
            // НЕ вызываем res.writeHead - пусть http-proxy сделает это сам
            // НЕ буферизуем - chunks идут напрямую
          });
          proxy.on('error', (err, req, res) => {
            console.error('[Vite gRPC Proxy] Error:', err.message);
          });
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'reactflow'],
  },
});
