import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Custom middleware для gRPC-Web streaming
    {
      name: 'grpc-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // Проксируем только /grpc/* запросы
          if (req.url?.startsWith('/grpc/')) {
            const targetUrl = 'http://78.153.139.47:8080' + req.url.replace('/grpc', '');
            
            try {
              // Собираем body
              const chunks = [];
              req.on('data', chunk => chunks.push(chunk));
              req.on('end', async () => {
                const body = Buffer.concat(chunks);
                
                // Проксируем запрос
                const response = await fetch(targetUrl, {
                  method: req.method,
                  headers: {
                    'Content-Type': req.headers['content-type'] || 'application/grpc-web+proto',
                    'Accept': req.headers['accept'] || 'application/grpc-web+proto',
                    'X-Grpc-Web': '1',
                    'X-User-Agent': 'grpc-web-javascript/0.1',
                  },
                  body: req.method === 'POST' ? body : undefined,
                });
                
                // Копируем headers
                res.writeHead(response.status, {
                  'Content-Type': response.headers.get('content-type') || 'application/grpc-web+proto',
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Grpc-Web, X-User-Agent',
                });
                
                // Передаём stream напрямую без буферизации
                if (response.body) {
                  const reader = response.body.getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                  }
                }
                res.end();
              });
            } catch (error) {
              console.error('[gRPC Proxy Error]:', error);
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Proxy error: ' + error.message);
            }
            return;
          }
          next();
        });
      }
    }
  ],
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
      '/v1': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
      // /grpc теперь обрабатывается custom middleware выше
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'reactflow'],
  },
})
