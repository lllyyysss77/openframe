import { ipcMain } from 'electron'
import { generateText } from 'ai'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createProviderModel, isLanguageModel } from '@openframe/providers/factory'
import { DEFAULT_AI_CONFIG, parseAIConfig, type AIConfig } from '@openframe/providers'

const CONFIG_PATH = path.join(os.homedir(), '.openframe', 'providers.json')

export function registerAIHandlers() {
  ipcMain.handle('ai:getConfig', (): AIConfig => {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return parseAIConfig(raw)
    } catch {
      return DEFAULT_AI_CONFIG
    }
  })

  ipcMain.handle('ai:saveConfig', (_event, config: AIConfig) => {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  })

  ipcMain.handle(
    'ai:testConnection',
    async (
      _event,
      params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string },
    ) => {
      const { providerId, modelId, apiKey, baseUrl } = params

      // Build a minimal config just for this test
      const config: AIConfig = {
        providers: {
          [providerId]: { apiKey, baseUrl: baseUrl ?? '', enabled: true },
        },
        models: { text: '', image: '', video: '' },
        customModels: {},
        disabledModels: {},
      }

      try {
        const model = createProviderModel(providerId, modelId, config)
        if (!model) return { ok: false, error: 'Provider not supported' }
        if (!isLanguageModel(model)) return { ok: false, error: 'Model type cannot be tested' }

        await generateText({ model, prompt: 'hi', maxOutputTokens: 1 })
        return { ok: true }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        // Trim verbose stack / URL noise to keep the message readable
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )
}
