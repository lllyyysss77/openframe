import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import aiProxyHandler from './api/ai'

type DevProxyResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => { json: (payload: unknown) => void }
}

function createWebApiPlugin(): Plugin {
  return {
    name: 'openframe-web-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        const pathname = req.url.split('?')[0]
        if (pathname !== '/api/ai') {
          next()
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        req.on('end', async () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown = {}
          if (raw.trim()) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = {}
            }
          }

          const responseAdapter: DevProxyResponse = {
            setHeader: (name, value) => {
              res.setHeader(name, value)
            },
            status: (code) => ({
              json: (payload) => {
                res.statusCode = code
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify(payload))
              },
            }),
          }

          await aiProxyHandler(
            {
              method: req.method,
              body,
            },
            responseAdapter,
          )
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), react(), createWebApiPlugin()],
  server: {
    port: 5170,
    strictPort: true,
  },
})
