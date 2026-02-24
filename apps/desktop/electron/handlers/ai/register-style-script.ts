import { ipcMain } from 'electron'
import { generateText, streamText } from 'ai'
import type { AIConfig } from '@openframe/providers'
import { store } from '../../store'
import { resolveTextModel } from './model'
import {
  extractJsonObject,
  getScriptToolkitPrompt,
  ScriptToolkitAction,
  shortError,
  stripCliStyleParams,
  StyleAgentMessage,
  StyleDraft,
  toText,
} from './shared'

export function registerAIStyleAndScriptHandlers() {
  ipcMain.handle(
    'ai:styleAgentChat',
    async (
      _event,
      params: { messages: StyleAgentMessage[]; draft: StyleDraft; modelKey?: string },
    ): Promise<{ ok: true; reply: string; draft: StyleDraft } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
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
        return { ok: false, error: shortError(err) }
      }
    },
  )

  ipcMain.handle(
    'ai:scriptToolkit',
    async (
      _event,
      params: { action: ScriptToolkitAction; context: string; instruction?: string; modelKey?: string },
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

      const prompt = getScriptToolkitPrompt(params.action, params.context, params.instruction)

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true, text: text.trim() }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )

  ipcMain.handle(
    'ai:scriptToolkitStreamStart',
    async (
      event,
      params: {
        action: ScriptToolkitAction
        context: string
        instruction?: string
        modelKey?: string
      },
    ): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

      if (params.action !== 'scene.expand' && params.action !== 'scene.autocomplete') {
        return { ok: false, error: 'Streaming is currently supported only for scene.expand and scene.autocomplete.' }
      }

      const requestId = crypto.randomUUID()
      const prompt = getScriptToolkitPrompt(params.action, params.context, params.instruction)

      void (async () => {
        try {
          const result = streamText({
            model,
            prompt,
            maxOutputTokens: params.action === 'scene.autocomplete' ? 10 : undefined,
          })
          for await (const chunk of result.textStream) {
            if (event.sender.isDestroyed()) return
            event.sender.send('ai:scriptToolkitStreamChunk', {
              requestId,
              chunk,
              done: false,
            })
          }
          if (!event.sender.isDestroyed()) {
            event.sender.send('ai:scriptToolkitStreamChunk', {
              requestId,
              done: true,
            })
          }
        } catch (err: unknown) {
          if (!event.sender.isDestroyed()) {
            event.sender.send('ai:scriptToolkitStreamChunk', {
              requestId,
              done: true,
              error: shortError(err),
            })
          }
        }
      })()

      return { ok: true, requestId }
    },
  )
}
