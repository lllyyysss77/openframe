import { ipcMain } from 'electron'
import { generateText } from 'ai'
import { createProviderModel, isLanguageModel } from '@openframe/providers/factory'
import type { AIConfig } from '@openframe/providers'

export function registerAIHandlers() {
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
