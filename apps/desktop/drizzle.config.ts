import { defineConfig } from 'drizzle-kit'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  dialect: 'sqlite',
  schema: '../../packages/db/schema.ts',
  out: './electron/migrations',
  dbCredentials: {
    url: path.join(os.homedir(), '.openframe', 'app.db'),
  },
})
