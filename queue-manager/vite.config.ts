import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const CONFIG_FILE_MAP = {
  'positive-presets': 'positive-presets.json',
  'negative-presets': 'negative-presets.json',
  settings: 'settings.json',
} as const

type ConfigKey = keyof typeof CONFIG_FILE_MAP

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function readRequestBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let rawBody = ''

    req.on('data', (chunk) => {
      rawBody += chunk
    })

    req.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {})
      } catch (error) {
        reject(error)
      }
    })

    req.on('error', reject)
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'config-json-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestUrl = req.url ?? ''
          const configMatch = requestUrl.match(/^\/api\/config\/(positive-presets|negative-presets|settings)$/)

          if (!configMatch) {
            next()
            return
          }

          const configKey = configMatch[1] as ConfigKey
          const fileName = CONFIG_FILE_MAP[configKey]
          const rootDir = server.config.root
          const dataDir = path.resolve(rootDir, 'data')
          const publicPath = path.resolve(rootDir, 'public', fileName)
          const dataPath = path.resolve(dataDir, fileName)

          await mkdir(dataDir, { recursive: true })

          if (!(await pathExists(dataPath))) {
            if (await pathExists(publicPath)) {
              const initialContent = await readFile(publicPath, 'utf8')
              await writeFile(dataPath, `${initialContent.trim()}\n`, 'utf8')
            } else {
              await writeFile(dataPath, '{}\n', 'utf8')
            }
          }

          if (req.method === 'GET') {
            try {
              const content = await readFile(dataPath, 'utf8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(content)
            } catch {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ message: 'Could not read config file.' }))
            }
            return
          }

          if (req.method === 'POST') {
            try {
              const payload = await readRequestBody(req)
              await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ message: 'Could not parse or write config payload.' }))
            }
            return
          }

          res.statusCode = 405
          res.setHeader('Allow', 'GET, POST')
          res.end()
        })
      },
    },
  ],
})
