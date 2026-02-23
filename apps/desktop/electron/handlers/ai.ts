import { ipcMain } from 'electron'
import { generateText } from 'ai'
import { store } from '../store'
import { createProviderModel, isLanguageModel } from '@openframe/providers/factory'
import { DEFAULT_AI_CONFIG, type AIConfig } from '@openframe/providers'

export function registerAIHandlers() {
  ipcMain.handle('ai:getConfig', (): AIConfig => store.get('ai_config'))

  ipcMain.handle('ai:saveConfig', (_event, config: AIConfig) => {
    store.set('ai_config', config)
  })

  ipcMain.handle(
    'ai:testConnection',
    async (
      _event,
      params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string },
    ) => {
      const { providerId, modelId, apiKey, baseUrl } = params

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
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )
}

export { DEFAULT_AI_CONFIG }
