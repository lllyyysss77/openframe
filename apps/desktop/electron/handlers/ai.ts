import { ipcMain } from 'electron'
import { generateText, generateImage, embed, embedMany } from 'ai'
import { store } from '../store'
import {
  createProviderModel,
  isLanguageModel,
  isCustomRestModel,
  getDefaultEmbeddingModel,
  getDefaultTextModel,
  getDefaultImageModel,
  createProviderModelWithType,
} from '@openframe/providers/factory'
import { DEFAULT_AI_CONFIG, type AIConfig } from '@openframe/providers'

type StyleAgentMessage = { role: 'user' | 'assistant'; content: string }
type StyleDraft = { name: string; code: string; description: string; prompt: string }

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // fall through
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const sliced = trimmed.slice(start, end + 1)
  try {
    return JSON.parse(sliced) as Record<string, unknown>
  } catch {
    return null
  }
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function stripCliStyleParams(prompt: string): string {
  return prompt
    .replace(/\s--ar\s+\S+/gi, '')
    .replace(/\s--stylize\s+\S+/gi, '')
    .replace(/\s--style\s+\S+/gi, '')
    .replace(/\s--v\s+\S+/gi, '')
    .replace(/\s--q\s+\S+/gi, '')
    .replace(/\s--s\s+\S+/gi, '')
    .replace(/\s--\w+(?:\s+\S+)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

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
        models: { text: '', image: '', video: '', embedding: '' },
        customModels: {},
        enabledModels: {},
        hiddenModels: {},
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

  ipcMain.handle('ai:embed', async (_event, text: string): Promise<number[] | null> => {
    const model = getDefaultEmbeddingModel(store.get('ai_config'))
    if (!model) return null
    const { embedding } = await embed({ model, value: text })
    return Array.from(embedding)
  })

  ipcMain.handle('ai:embedBatch', async (_event, texts: string[]): Promise<number[][] | null> => {
    const model = getDefaultEmbeddingModel(store.get('ai_config'))
    if (!model) return null
    const { embeddings } = await embedMany({ model, values: texts })
    return embeddings.map((e) => Array.from(e))
  })

  ipcMain.handle(
    'ai:generateImage',
    async (
      _event,
      params: { prompt: string; modelKey?: string },
    ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const selectedModel = params.modelKey
        ? (() => {
            const idx = params.modelKey!.indexOf(':')
            if (idx === -1) return null
            const providerId = params.modelKey!.slice(0, idx)
            const modelId = params.modelKey!.slice(idx + 1)
            return createProviderModelWithType(providerId, modelId, 'image', config)
          })()
        : null
      const model = selectedModel ?? getDefaultImageModel(config)

      if (!model) return { ok: false, error: 'No default image model configured.' }
      if (isCustomRestModel(model)) {
        return { ok: false, error: 'Selected image model is not supported yet.' }
      }

      try {
        const result = await generateImage({ model: model as Parameters<typeof generateImage>[0]['model'], prompt: params.prompt, n: 1 })
        return {
          ok: true,
          data: Array.from(result.image.uint8Array),
          mediaType: result.image.mediaType,
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/Unsupported role:\s*undefined/i.test(msg)) {
          return {
            ok: false,
            error: 'Selected model does not support image generation in current provider SDK. Please choose another image model.',
          }
        }
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:styleAgentChat',
    async (
      _event,
      params: { messages: StyleAgentMessage[]; draft: StyleDraft; modelKey?: string },
    ): Promise<{ ok: true; reply: string; draft: StyleDraft } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const selectedModel = params.modelKey
        ? (() => {
            const idx = params.modelKey!.indexOf(':')
            if (idx === -1) return null
            const providerId = params.modelKey!.slice(0, idx)
            const modelId = params.modelKey!.slice(idx + 1)
            return createProviderModelWithType(providerId, modelId, 'text', config)
          })()
        : null
      const model = selectedModel && isLanguageModel(selectedModel) ? selectedModel : getDefaultTextModel(config)
      if (!model) return { ok: false, error: 'No default text model configured.' }

      const conversation = params.messages
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
        .join('\n\n')

      const instruction = [
        'You are a style-library creation agent for an image/video prompt app.',
        'Based on the conversation and current draft, suggest improved values.',
        'In draft.prompt, NEVER include CLI-style flags or suffix params such as "--ar 16:9", "--stylize 300", "--v 6", etc.',
        'Write natural prompt text only.',
        'Return STRICT JSON only. No markdown. No extra text.',
        'JSON shape:',
        '{',
        '  "reply": "short conversational reply in same language as user",',
        '  "draft": {',
        '    "name": "style name",',
        '    "code": "snake_case_code",',
        '    "description": "short description",',
        '    "prompt": "full reusable prompt template"',
        '  }',
        '}',
        'If a field should stay unchanged, copy it from current draft.',
      ].join('\n')

      const currentDraft = JSON.stringify(params.draft)
      const prompt = `${instruction}\n\nCurrent draft:\n${currentDraft}\n\nConversation:\n${conversation}`

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        if (!parsed) return { ok: false, error: 'Failed to parse model response.' }

        const draftRaw = (parsed.draft ?? {}) as Record<string, unknown>
        return {
          ok: true,
          reply: toText(parsed.reply) || 'Done. I updated the draft for you.',
          draft: {
            name: toText(draftRaw.name) || params.draft.name,
            code: toText(draftRaw.code) || params.draft.code,
            description: toText(draftRaw.description) || params.draft.description,
            prompt: stripCliStyleParams(toText(draftRaw.prompt)) || params.draft.prompt,
          },
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )
}

export { DEFAULT_AI_CONFIG }
