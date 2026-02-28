import { embed, embedMany, generateText } from 'ai'
import type { AIConfig } from '@openframe/providers'
import {
  createProviderModel,
  generateImageWithProviderSupport,
  generateVideoWithProviderSupport,
  getDefaultEmbeddingModel,
  isLanguageModel,
} from '@openframe/providers/factory'
import { resolveImageModel, resolveTextModel, resolveVideoModel } from './web_ai_model'
import {
  CHARACTER_AGE_CANONICAL_PROMPT,
  extractJsonObject,
  getScriptToolkitPrompt,
  normalizeCharacterAge,
  normalizeCharacterGender,
  parseCharacterRelations,
  parseCharacters,
  parseProps,
  parseScenes,
  parseShots,
  stripCliStyleParams,
  toText,
} from './web_ai_shared'

type ScriptToolkitChunkPayload = {
  requestId: string
  chunk?: string
  done: boolean
  error?: string
}

type CreateWebAiApiOptions = {
  getCurrentAIConfig: () => AIConfig
  saveAIConfig: (config: unknown) => void
}

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/failed to fetch/i.test(msg)) {
    return 'Network request failed in browser. 请确认已部署 `/api/ai`。'
  }
  return msg.split('\n')[0].slice(0, 200)
}

function detectScriptLanguage(script: string): 'zh' | 'en' {
  const chineseChars = (script.match(/[\u4e00-\u9fff]/g) || []).length
  const latinChars = (script.match(/[A-Za-z]/g) || []).length
  return chineseChars >= latinChars ? 'zh' : 'en'
}

function getOutputLanguageRules(script: string): {
  outputLanguage: 'Simplified Chinese' | 'English'
  languageRule: string
} {
  const isZh = detectScriptLanguage(script) === 'zh'
  if (isZh) {
    return {
      outputLanguage: 'Simplified Chinese',
      languageRule: 'If script is Chinese, keep output in Simplified Chinese unless source uses fixed English proper nouns.',
    }
  }
  return {
    outputLanguage: 'English',
    languageRule: 'If script is English, keep output in English.',
  }
}

export function createWebAiApi(options: CreateWebAiApiOptions): Window['aiAPI'] {
  const scriptToolkitListeners = new Set<(payload: ScriptToolkitChunkPayload) => void>()

  const emitScriptToolkitChunk = (payload: ScriptToolkitChunkPayload) => {
    scriptToolkitListeners.forEach((listener) => {
      try {
        listener(payload)
      } catch {
        // ignore listener errors
      }
    })
  }

  const aiAPI: Window['aiAPI'] = {
    getConfig: async () => options.getCurrentAIConfig(),
    saveConfig: async (config: unknown) => {
      options.saveAIConfig(config)
    },
    testConnection: async (params: {
      providerId: string
      modelId: string
      apiKey: string
      baseUrl?: string
    }) => {
      const { providerId, modelId, apiKey, baseUrl } = params
      const config: AIConfig = {
        providers: {
          [providerId]: { apiKey, baseUrl: baseUrl ?? '', enabled: true },
        },
        customProviders: [],
        models: { text: '', image: '', video: '', embedding: '' },
        customModels: {},
        enabledModels: {},
        hiddenModels: {},
        concurrency: { image: 5, video: 5 },
      }

      try {
        const model = createProviderModel(providerId, modelId, config)
        if (!model) return { ok: false, error: 'Provider not supported' }
        if (!isLanguageModel(model)) return { ok: false, error: 'Model type cannot be tested' }
        await generateText({ model, prompt: 'hi', maxOutputTokens: 1 })
        return { ok: true }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
    embed: async (text: string) => {
      const model = getDefaultEmbeddingModel(options.getCurrentAIConfig())
      if (!model) return null
      try {
        const { embedding } = await embed({ model, value: text })
        return Array.from(embedding)
      } catch {
        return null
      }
    },
    embedBatch: async (texts: string[]) => {
      const model = getDefaultEmbeddingModel(options.getCurrentAIConfig())
      if (!model) return null
      try {
        const { embeddings } = await embedMany({ model, values: texts })
        return embeddings.map((item) => Array.from(item))
      } catch {
        return null
      }
    },
    generateImage: async (params: {
      prompt: string | { text?: string; images: Array<string | number[]> }
      modelKey?: string
      options?: { size?: string; ratio?: string }
    }) => {
      const resolved = resolveImageModel(options.getCurrentAIConfig(), params.modelKey)
      if ('error' in resolved) return { ok: false as const, error: resolved.error }
      try {
        const generated = await generateImageWithProviderSupport({
          model: resolved.model,
          prompt: params.prompt,
          options: params.options,
        })
        return {
          ok: true as const,
          data: generated.data,
          mediaType: generated.mediaType,
          url: generated.url,
        }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    generateVideo: async (params: {
      prompt: string | { text?: string; images?: Array<string | number[]> }
      modelKey?: string
      options?: { ratio?: string; durationSec?: number }
    }) => {
      const resolved = resolveVideoModel(options.getCurrentAIConfig(), params.modelKey)
      if ('error' in resolved) return { ok: false as const, error: resolved.error }
      try {
        const generated = await generateVideoWithProviderSupport({
          model: resolved.model,
          prompt: params.prompt,
          options: params.options,
        })
        return {
          ok: true as const,
          data: generated.data,
          mediaType: generated.mediaType,
          url: generated.url,
        }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    styleAgentChat: async (params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      draft: { name: string; code: string; description: string; prompt: string }
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }

      const conversation = params.messages
        .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
        .join('\n\n')
      const prompt = [
        'You are a style-library creation agent for an image/video prompt app.',
        'Based on the conversation and current draft, suggest improved values.',
        'In draft.prompt, NEVER include CLI-style flags or suffix params such as "--ar 16:9", "--stylize 300".',
        'Return STRICT JSON only. No markdown.',
        'JSON shape: {"reply":"","draft":{"name":"","code":"","description":"","prompt":""}}',
        `Current draft:\n${JSON.stringify(params.draft)}`,
        `Conversation:\n${conversation}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        if (!parsed) return { ok: false as const, error: 'Failed to parse model response.' }
        const draftRaw = (parsed.draft ?? {}) as Record<string, unknown>
        return {
          ok: true as const,
          reply: toText(parsed.reply) || 'Done. I updated the draft for you.',
          draft: {
            name: toText(draftRaw.name) || params.draft.name,
            code: toText(draftRaw.code) || params.draft.code,
            description: toText(draftRaw.description) || params.draft.description,
            prompt: stripCliStyleParams(toText(draftRaw.prompt)) || params.draft.prompt,
          },
        }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    extractCharactersFromScript: async (params: { script: string; modelKey?: string }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const { outputLanguage, languageRule } = getOutputLanguageRules(params.script)
      const prompt = [
        'Extract key screenplay characters as strict JSON.',
        `Age must be one of: ${CHARACTER_AGE_CANONICAL_PROMPT.join(' / ')}`,
        `Output language: ${outputLanguage}`,
        languageRule,
        'Return only:',
        '{"characters":[{"name":"","gender":"","age":"","personality":"","appearance":"","background":""}]}',
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true as const, characters: parseCharacters(text) }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    enhanceCharacterFromScript: async (params: {
      script: string
      character: { name: string; gender?: string; age?: string; personality?: string; appearance?: string; background?: string }
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const { outputLanguage, languageRule } = getOutputLanguageRules(params.script)
      const prompt = [
        'Enhance one screenplay character as strict JSON.',
        `Age must be one of: ${CHARACTER_AGE_CANONICAL_PROMPT.join(' / ')}`,
        `Output language: ${outputLanguage}`,
        languageRule,
        'Return only:',
        '{"character":{"name":"","gender":"","age":"","personality":"","appearance":"","background":""}}',
        `Current character:\n${JSON.stringify(params.character)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        const raw = (parsed?.character ?? {}) as Record<string, unknown>
        const character = {
          name: toText(raw.name).trim() || params.character.name,
          gender: normalizeCharacterGender(toText(raw.gender)) || normalizeCharacterGender(params.character.gender || ''),
          age: normalizeCharacterAge(toText(raw.age)) || normalizeCharacterAge(params.character.age || ''),
          personality: toText(raw.personality).trim() || params.character.personality || '',
          appearance: toText(raw.appearance).trim() || params.character.appearance || '',
          background: toText(raw.background).trim() || params.character.background || '',
        }
        if (!character.name) {
          return { ok: false as const, error: 'Failed to parse character from model response.' }
        }
        return { ok: true as const, character }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    extractScenesFromScript: async (params: { script: string; modelKey?: string }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const { outputLanguage, languageRule } = getOutputLanguageRules(params.script)
      const prompt = [
        'Extract key scenes from screenplay as strict JSON.',
        `Output language: ${outputLanguage}`,
        languageRule,
        'Return only:',
        '{"scenes":[{"title":"","location":"","time":"","mood":"","description":"","shot_notes":""}]}',
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true as const, scenes: parseScenes(text) }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    extractPropsFromScript: async (params: { script: string; modelKey?: string }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const { outputLanguage, languageRule } = getOutputLanguageRules(params.script)
      const prompt = [
        'Extract key physical props as strict JSON.',
        `Output language: ${outputLanguage}`,
        languageRule,
        'Return only:',
        '{"props":[{"name":"","category":"","description":""}]}',
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true as const, props: parseProps(text) }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    extractCharacterRelationsFromScript: async (params: {
      script: string
      characters: Array<{ id: string; name: string; personality?: string; background?: string }>
      existingRelations?: Array<{
        source_ref: string
        target_ref: string
        relation_type: string
        strength?: number
        notes?: string
        evidence?: string
      }>
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      if (!Array.isArray(params.characters) || params.characters.length < 2) {
        return { ok: true as const, relations: [] }
      }

      const prompt = [
        'Extract character relations as strict JSON.',
        'Use only provided character IDs.',
        'strength: integer 1-5',
        'Return only:',
        '{"relations":[{"source_ref":"","target_ref":"","relation_type":"","strength":3,"notes":"","evidence":""}]}',
        `Characters:\n${JSON.stringify(params.characters)}`,
        `Existing relations:\n${JSON.stringify(params.existingRelations ?? [])}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true as const, relations: parseCharacterRelations(text) }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    enhanceSceneFromScript: async (params: {
      script: string
      scene: { title: string; location?: string; time?: string; mood?: string; description?: string; shot_notes?: string }
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const { outputLanguage, languageRule } = getOutputLanguageRules(params.script)
      const prompt = [
        'Enhance one screenplay scene as strict JSON.',
        `Output language: ${outputLanguage}`,
        languageRule,
        'Return only:',
        '{"scene":{"title":"","location":"","time":"","mood":"","description":"","shot_notes":""}}',
        `Current scene:\n${JSON.stringify(params.scene)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        const raw = (parsed?.scene ?? {}) as Record<string, unknown>
        const scene = {
          title: toText(raw.title).trim() || params.scene.title,
          location: toText(raw.location).trim() || params.scene.location || '',
          time: toText(raw.time).trim() || params.scene.time || '',
          mood: toText(raw.mood).trim() || params.scene.mood || '',
          description: toText(raw.description).trim() || params.scene.description || '',
          shot_notes: toText(raw.shot_notes).trim() || params.scene.shot_notes || '',
        }
        if (!scene.title) {
          return { ok: false as const, error: 'Failed to parse scene from model response.' }
        }
        return { ok: true as const, scene }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    extractShotsFromScript: async (params: {
      script: string
      scenes: Array<{
        id: string
        title: string
        location?: string
        time?: string
        mood?: string
        description?: string
        shot_notes?: string
      }>
      characters: Array<{ id: string; name: string }>
      relations?: Array<{
        source_ref: string
        target_ref: string
        relation_type: string
        strength?: number
        notes?: string
        evidence?: string
      }>
      props: Array<{ id: string; name: string; category?: string; description?: string }>
      target_count?: number
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }

      const targetCount = Number.isFinite(params.target_count)
        ? Math.max(1, Math.min(200, Math.round(params.target_count as number)))
        : 30

      const prompt = [
        'Extract production-ready shot list as strict JSON.',
        `Target count: ${targetCount}`,
        'Return only:',
        '{"shots":[{"title":"","scene_ref":"","character_refs":[],"prop_refs":[],"shot_size":"","camera_angle":"","camera_move":"","duration_sec":3,"action":"","dialogue":""}]}',
        `Scenes:\n${JSON.stringify(params.scenes)}`,
        `Characters:\n${JSON.stringify(params.characters)}`,
        `Relations:\n${JSON.stringify(params.relations ?? [])}`,
        `Props:\n${JSON.stringify(params.props)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = parseShots(text)
        const validSceneIds = new Set(params.scenes.map((scene) => scene.id))
        const validCharacterIds = new Set(params.characters.map((character) => character.id))
        const validPropIds = new Set(params.props.map((prop) => prop.id))

        const shots = parsed
          .map((shot) => ({
            ...shot,
            scene_ref: validSceneIds.has(shot.scene_ref) ? shot.scene_ref : (params.scenes[0]?.id || ''),
            character_refs: shot.character_refs.filter((id) => validCharacterIds.has(id)),
            prop_refs: shot.prop_refs.filter((id) => validPropIds.has(id)),
          }))
          .filter((shot) => shot.title && shot.scene_ref)

        return { ok: true as const, shots }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    scriptToolkit: async (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
        | 'script.from-idea'
        | 'script.from-novel'
      context: string
      instruction?: string
      modelKey?: string
    }) => {
      const model = resolveTextModel(options.getCurrentAIConfig(), params.modelKey)
      if (!model) return { ok: false as const, error: 'No default text model configured.' }
      const prompt = getScriptToolkitPrompt(params.action, params.context, params.instruction)
      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true as const, text: text.trim() }
      } catch (err: unknown) {
        return { ok: false as const, error: shortError(err) }
      }
    },
    scriptToolkitStreamStart: async (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
        | 'script.from-idea'
        | 'script.from-novel'
      context: string
      instruction?: string
      modelKey?: string
    }) => {
      const requestId = crypto.randomUUID()
      void (async () => {
        const result = await aiAPI.scriptToolkit(params)
        if (!result.ok) {
          emitScriptToolkitChunk({ requestId, done: true, error: result.error })
          return
        }
        if (result.text) {
          emitScriptToolkitChunk({ requestId, chunk: result.text, done: false })
        }
        emitScriptToolkitChunk({ requestId, done: true })
      })()
      return { ok: true as const, requestId }
    },
    onScriptToolkitStreamChunk: (callback: (payload: { requestId: string; chunk?: string; done: boolean; error?: string }) => void) => {
      scriptToolkitListeners.add(callback)
      return () => {
        scriptToolkitListeners.delete(callback)
      }
    },
  }

  return aiAPI
}
