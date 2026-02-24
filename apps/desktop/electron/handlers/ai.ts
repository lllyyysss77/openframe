import { ipcMain } from 'electron'
import { generateText, embed, embedMany, streamText } from 'ai'
import { store } from '../store'
import {
  createProviderModel,
  isLanguageModel,
  isImageModel,
  isCustomRestModel,
  getDefaultEmbeddingModel,
  getDefaultTextModel,
  getDefaultImageModel,
  createProviderModelWithType,
  generateImageWithProviderSupport,
} from '@openframe/providers/factory'
import { DEFAULT_AI_CONFIG, type AIConfig } from '@openframe/providers'

type StyleAgentMessage = { role: 'user' | 'assistant'; content: string }
type StyleDraft = { name: string; code: string; description: string; prompt: string }
type CharacterExtractRow = {
  name: string
  gender: string
  age: string
  personality: string
  appearance: string
  background: string
}
type SceneExtractRow = {
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
}
type ShotExtractRow = {
  title: string
  scene_ref: string
  character_refs: string[]
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
}
type ScriptToolkitAction =
  | 'scene.expand'
  | 'scene.autocomplete'
  | 'scene.rewrite'
  | 'scene.dialogue-polish'
  | 'scene.pacing'
  | 'scene.continuity-check'

const CHARACTER_AGE_BUCKETS = ['child', 'youth', 'young_adult', 'adult', 'middle_aged', 'elder'] as const
const CHARACTER_AGE_BUCKETS_ZH = ['幼年', '少年', '青年', '成年', '中年', '老年'] as const
const CHARACTER_AGE_CANONICAL_PROMPT = [
  'child(幼年)',
  'youth(少年)',
  'young_adult(青年)',
  'adult(成年)',
  'middle_aged(中年)',
  'elder(老年)',
] as const

const CHARACTER_GENDER_BUCKETS = ['male', 'female', 'other'] as const

function normalizeCharacterAge(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if ((CHARACTER_AGE_BUCKETS as readonly string[]).includes(raw)) return raw

  const exactMap: Record<string, (typeof CHARACTER_AGE_BUCKETS)[number]> = {
    child: 'child',
    youth: 'youth',
    teen: 'youth',
    'young adult': 'young_adult',
    young_adult: 'young_adult',
    adult: 'adult',
    'middle-aged': 'middle_aged',
    middle_aged: 'middle_aged',
    elder: 'elder',
  }

  const lower = raw.toLowerCase()
  if ((CHARACTER_AGE_BUCKETS as readonly string[]).includes(lower)) {
    return exactMap[lower] ?? ''
  }
  if ((CHARACTER_AGE_BUCKETS_ZH as readonly string[]).includes(raw)) {
    return {
      幼年: 'child',
      少年: 'youth',
      青年: 'young_adult',
      成年: 'adult',
      中年: 'middle_aged',
      老年: 'elder',
    }[raw] as (typeof CHARACTER_AGE_BUCKETS)[number]
  }

  if (/(幼|儿童|小孩|child|kid)/i.test(raw) || /child|kid/.test(lower)) return 'child'
  if (/(少|teen|adolescent)/i.test(raw) || /teen|adolescent/.test(lower)) return 'youth'
  if (/(青|young adult|youth)/i.test(raw) || /young adult|youth/.test(lower)) return 'young_adult'
  if (/(成|adult)/i.test(raw) || /adult/.test(lower)) return 'adult'
  if (/(中年|middle)/i.test(raw) || /middle/.test(lower)) return 'middle_aged'
  if (/(老|elder|senior|aged)/i.test(raw) || /elder|senior|aged/.test(lower)) return 'elder'

  return ''
}

function normalizeCharacterGender(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if ((CHARACTER_GENDER_BUCKETS as readonly string[]).includes(raw)) return raw

  const lower = raw.toLowerCase()
  if (lower === 'male' || /男/.test(raw)) return 'male'
  if (lower === 'female' || /女/.test(raw)) return 'female'
  if (lower === 'other' || /其|他/.test(raw)) return 'other'

  return ''
}

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

function parseCharacters(raw: string): CharacterExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.characters) ? obj.characters : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        name: toText(row.name).trim(),
        gender: normalizeCharacterGender(toText(row.gender)),
        age: normalizeCharacterAge(toText(row.age)),
        personality: toText(row.personality).trim(),
        appearance: toText(row.appearance).trim(),
        background: toText(row.background).trim(),
      }
    })
    .filter((row) => row.name)
}

function parseScenes(raw: string): SceneExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.scenes) ? obj.scenes : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        title: toText(row.title).trim(),
        location: toText(row.location).trim(),
        time: toText(row.time).trim(),
        mood: toText(row.mood).trim(),
        description: toText(row.description).trim(),
        shot_notes: toText(row.shot_notes).trim(),
      }
    })
    .filter((row) => row.title)
}

function parseShots(raw: string): ShotExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.shots) ? obj.shots : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      const durationRaw = row.duration_sec
      const duration =
        typeof durationRaw === 'number'
          ? durationRaw
          : typeof durationRaw === 'string'
            ? Number(durationRaw)
            : 0
      return {
        title: toText(row.title).trim(),
        scene_ref: toText(row.scene_ref).trim(),
        character_refs: Array.isArray(row.character_refs)
          ? row.character_refs.map((v) => toText(v).trim()).filter(Boolean)
          : [],
        shot_size: toText(row.shot_size).trim(),
        camera_angle: toText(row.camera_angle).trim(),
        camera_move: toText(row.camera_move).trim(),
        duration_sec: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : 3,
        action: toText(row.action).trim(),
        dialogue: toText(row.dialogue).trim(),
      }
    })
    .filter((row) => row.title && row.scene_ref)
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

function getScriptToolkitPrompt(action: ScriptToolkitAction, context: string, instruction?: string): string {
  const actionPrompts: Record<ScriptToolkitAction, string> = {
    'scene.expand':
      'Expand the current scene by enriching action beats, environment details, and emotional texture while preserving the original story intent and chronology. Return only the revised scene text.',
    'scene.autocomplete':
      'Continue writing from the cursor position with natural screenplay flow. Respect what appears before and after the cursor, and avoid repeating existing text. Keep clear paragraph and dialogue line breaks where appropriate. Return only the continuation text that should be inserted at cursor.',
    'scene.rewrite':
      'Rewrite the current scene for stronger readability and cinematic flow while keeping all core plot points and outcomes unchanged. Return only the rewritten scene text.',
    'scene.dialogue-polish':
      'Polish the dialogue in this scene to sound more natural and dramatic while preserving each character\'s intent. Keep scene actions intact. Return only the polished scene text.',
    'scene.pacing':
      'Diagnose pacing issues in this scene. Identify dragging lines, low-information paragraphs, and rhythm breaks. Return concise bullet points with actionable fixes.',
    'scene.continuity-check':
      'Check scene continuity: character states, time/space consistency, and prop/object continuity. Return concise bullet points with found issues and suggested fixes.',
  }

  return [
    'You are an expert screenplay writing assistant.',
    actionPrompts[action],
    instruction ? `Extra instruction: ${instruction}` : '',
    'Keep character names, scene semantics, and chronology coherent.',
    'Do not include markdown code fences.',
    `Content:\n${context}`,
  ]
    .filter(Boolean)
    .join('\n\n')
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
      params: {
        prompt: string | { text?: string; images: Array<string | number[]> }
        modelKey?: string
        options?: { size?: string; ratio?: string }
      },
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
      if (!isCustomRestModel(model) && !isImageModel(model)) {
        return { ok: false, error: 'Selected model is not an image model.' }
      }

      try {
        const generated = await generateImageWithProviderSupport({
          model,
          prompt: params.prompt,
          options: params.options,
        })
        return {
          ok: true,
          data: generated.data,
          mediaType: generated.mediaType,
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(err)
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

  ipcMain.handle(
    'ai:scriptToolkit',
    async (
      _event,
      params: { action: ScriptToolkitAction; context: string; instruction?: string; modelKey?: string },
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = getScriptToolkitPrompt(params.action, params.context, params.instruction)

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true, text: text.trim() }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:extractCharactersFromScript',
    async (
      _event,
      params: { script: string; modelKey?: string },
    ): Promise<{ ok: true; characters: CharacterExtractRow[] } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = [
        'You are a screenplay analyst.',
        'Extract key characters from the script and summarize each one.',
        `Age must be one of: ${CHARACTER_AGE_CANONICAL_PROMPT.join(' / ')}.`,
        'Return STRICT JSON only with shape:',
        '{"characters":[{"name":"","gender":"","age":"","personality":"","appearance":"","background":""}]}',
        'Do not include markdown code fences.',
        'Infer unknown fields conservatively; keep them short.',
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const characters = parseCharacters(text)
        return { ok: true, characters }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:enhanceCharacterFromScript',
    async (
      _event,
      params: {
        script: string
        character: { name: string; gender?: string; age?: string; personality?: string; appearance?: string; background?: string }
        modelKey?: string
      },
    ): Promise<{ ok: true; character: CharacterExtractRow } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = [
        'You are a screenplay character designer.',
        'Enhance one character card using the script context.',
        `Age must be one of: ${CHARACTER_AGE_CANONICAL_PROMPT.join(' / ')}.`,
        'Return STRICT JSON only with shape:',
        '{"character":{"name":"","gender":"","age":"","personality":"","appearance":"","background":""}}',
        'Keep the same character identity and name.',
        'Do not include markdown code fences.',
        `Current character:\n${JSON.stringify(params.character)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        const raw = (parsed?.character ?? {}) as Record<string, unknown>
        const character: CharacterExtractRow = {
          name: toText(raw.name).trim() || params.character.name,
          gender: normalizeCharacterGender(toText(raw.gender)) || normalizeCharacterGender(params.character.gender || ''),
          age: normalizeCharacterAge(toText(raw.age)) || normalizeCharacterAge(params.character.age || ''),
          personality: toText(raw.personality).trim() || params.character.personality || '',
          appearance: toText(raw.appearance).trim() || params.character.appearance || '',
          background: toText(raw.background).trim() || params.character.background || '',
        }
        if (!character.name) {
          return { ok: false, error: 'Failed to parse character from model response.' }
        }
        return { ok: true, character }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:extractScenesFromScript',
    async (
      _event,
      params: { script: string; modelKey?: string },
    ): Promise<{ ok: true; scenes: SceneExtractRow[] } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = [
        'You are a screenplay scene planner.',
        'Extract key scenes from the script with concise production-ready info.',
        'Return STRICT JSON only with shape:',
        '{"scenes":[{"title":"","location":"","time":"","mood":"","description":"","shot_notes":""}]}',
        'Do not include markdown code fences.',
        'Keep each field concise and actionable.',
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const scenes = parseScenes(text)
        return { ok: true, scenes }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:enhanceSceneFromScript',
    async (
      _event,
      params: {
        script: string
        scene: {
          title: string
          location?: string
          time?: string
          mood?: string
          description?: string
          shot_notes?: string
        }
        modelKey?: string
      },
    ): Promise<{ ok: true; scene: SceneExtractRow } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = [
        'You are a screenplay scene planner.',
        'Enhance one scene card based on script context.',
        'Return STRICT JSON only with shape:',
        '{"scene":{"title":"","location":"","time":"","mood":"","description":"","shot_notes":""}}',
        'Do not include markdown code fences.',
        `Current scene:\n${JSON.stringify(params.scene)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = extractJsonObject(text)
        const raw = (parsed?.scene ?? {}) as Record<string, unknown>
        const scene: SceneExtractRow = {
          title: toText(raw.title).trim() || params.scene.title,
          location: toText(raw.location).trim() || params.scene.location || '',
          time: toText(raw.time).trim() || params.scene.time || '',
          mood: toText(raw.mood).trim() || params.scene.mood || '',
          description: toText(raw.description).trim() || params.scene.description || '',
          shot_notes: toText(raw.shot_notes).trim() || params.scene.shot_notes || '',
        }
        if (!scene.title) {
          return { ok: false, error: 'Failed to parse scene from model response.' }
        }
        return { ok: true, scene }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
      }
    },
  )

  ipcMain.handle(
    'ai:extractShotsFromScript',
    async (
      _event,
      params: {
        script: string
        scenes: Array<{ id: string; title: string }>
        characters: Array<{ id: string; name: string }>
        modelKey?: string
      },
    ): Promise<{ ok: true; shots: ShotExtractRow[] } | { ok: false; error: string }> => {
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

      const prompt = [
        'You are a screenplay storyboard planner.',
        'Generate a practical shot list from the script.',
        'Each shot must include scene_ref and character_refs, using ONLY provided IDs.',
        'Do not invent new scene_ref or character_refs values.',
        'Return STRICT JSON only with shape:',
        '{"shots":[{"title":"","scene_ref":"","character_refs":[],"shot_size":"","camera_angle":"","camera_move":"","duration_sec":3,"action":"","dialogue":""}]}',
        'Do not include markdown code fences.',
        `Scenes:\n${JSON.stringify(params.scenes)}`,
        `Characters:\n${JSON.stringify(params.characters)}`,
        `Script:\n${params.script}`,
      ].join('\n\n')

      try {
        const { text } = await generateText({ model, prompt })
        const shots = parseShots(text)
        return { ok: true, shots }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg.split('\n')[0].slice(0, 200) }
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
      if (!model || !isLanguageModel(model)) {
        return { ok: false, error: 'No default text model configured.' }
      }

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
          const msg = err instanceof Error ? err.message : String(err)
          if (!event.sender.isDestroyed()) {
            event.sender.send('ai:scriptToolkitStreamChunk', {
              requestId,
              done: true,
              error: msg.split('\n')[0].slice(0, 200),
            })
          }
        }
      })()

      return { ok: true, requestId }
    },
  )
}

export { DEFAULT_AI_CONFIG }
