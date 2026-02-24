import { ipcMain } from 'electron'
import { generateText } from 'ai'
import type { AIConfig } from '@openframe/providers'
import { store } from '../../store'
import { resolveTextModel } from './model'
import {
  CHARACTER_AGE_CANONICAL_PROMPT,
  CharacterExtractRow,
  SceneExtractRow,
  ShotExtractRow,
  extractJsonObject,
  normalizeCharacterAge,
  normalizeCharacterGender,
  parseCharacters,
  parseScenes,
  parseShots,
  shortError,
  toText,
} from './shared'

export function registerAIExtractionHandlers() {
  ipcMain.handle(
    'ai:extractCharactersFromScript',
    async (
      _event,
      params: { script: string; modelKey?: string },
    ): Promise<{ ok: true; characters: CharacterExtractRow[] } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

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
        return { ok: true, characters: parseCharacters(text) }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
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
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

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
        return { ok: false, error: shortError(err) }
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
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

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
        return { ok: true, scenes: parseScenes(text) }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
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
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

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
        return { ok: false, error: shortError(err) }
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
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

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
        return { ok: true, shots: parseShots(text) }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )
}
