import { ipcMain } from 'electron'
import { generateText } from 'ai'
import type { AIConfig } from '@openframe/providers'
import {
  buildExtractionPrompt,
} from '@openframe/prompts'
import { store } from '../../store'
import { resolveTextModel } from './model'
import {
  CHARACTER_AGE_CANONICAL_PROMPT,
  CharacterExtractRow,
  CharacterRelationExtractRow,
  PropExtractRow,
  SceneExtractRow,
  ShotExtractRow,
  extractJsonObject,
  normalizeCharacterAge,
  normalizeCharacterGender,
  parseCharacters,
  parseCharacterRelations,
  parseProps,
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
      const prompt = buildExtractionPrompt({
        key: 'extractCharactersFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          characterAgeCanonical: CHARACTER_AGE_CANONICAL_PROMPT.join(' / '),
          script: params.script,
        },
      })

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
      const prompt = buildExtractionPrompt({
        key: 'enhanceCharacterFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          characterAgeCanonical: CHARACTER_AGE_CANONICAL_PROMPT.join(' / '),
          currentCharacter: JSON.stringify(params.character),
          script: params.script,
        },
      })

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
      const prompt = buildExtractionPrompt({
        key: 'extractScenesFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          script: params.script,
        },
      })

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true, scenes: parseScenes(text) }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )

  ipcMain.handle(
    'ai:extractPropsFromScript',
    async (
      _event,
      params: { script: string; modelKey?: string },
    ): Promise<{ ok: true; props: PropExtractRow[] } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }
      const prompt = buildExtractionPrompt({
        key: 'extractPropsFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          script: params.script,
        },
      })

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true, props: parseProps(text) }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )

  ipcMain.handle(
    'ai:extractCharacterRelationsFromScript',
    async (
      _event,
      params: {
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
      },
    ): Promise<{ ok: true; relations: CharacterRelationExtractRow[] } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }

      if (!Array.isArray(params.characters) || params.characters.length < 2) {
        return { ok: true, relations: [] }
      }

      const existingRelations = Array.isArray(params.existingRelations)
        ? params.existingRelations
          .map((item) => {
            const strengthValue =
              typeof item.strength === 'number'
                ? item.strength
                : typeof item.strength === 'string'
                  ? Number(item.strength)
                  : 3
            const strength = Number.isFinite(strengthValue)
              ? Math.max(1, Math.min(5, Math.round(strengthValue)))
              : 3
            return {
              source_ref: toText(item.source_ref).trim(),
              target_ref: toText(item.target_ref).trim(),
              relation_type: toText(item.relation_type).trim(),
              strength,
              notes: toText(item.notes).trim(),
              evidence: toText(item.evidence).trim(),
            }
          })
          .filter((row) => row.source_ref && row.target_ref && row.source_ref !== row.target_ref)
        : []

      const prompt = buildExtractionPrompt({
        key: 'extractCharacterRelationsFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          characters: JSON.stringify(params.characters),
          existingRelations: JSON.stringify(existingRelations),
          script: params.script,
        },
      })

      try {
        const { text } = await generateText({ model, prompt })
        return { ok: true, relations: parseCharacterRelations(text) }
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
      const prompt = buildExtractionPrompt({
        key: 'enhanceSceneFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          currentScene: JSON.stringify(params.scene),
          script: params.script,
        },
      })

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
        costumes: Array<{ id: string; name: string; category?: string; description?: string; character_ids?: string[] }>
        target_count?: number
        modelKey?: string
      },
    ): Promise<{ ok: true; shots: ShotExtractRow[] } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const model = resolveTextModel(config, params.modelKey)
      if (!model) return { ok: false, error: 'No default text model configured.' }
      const costumes = Array.isArray(params.costumes) ? params.costumes : []
      const rawTargetCount = typeof params.target_count === 'number' ? params.target_count : Number.NaN
      const targetCount = Number.isFinite(rawTargetCount)
        ? Math.max(1, Math.min(200, Math.round(rawTargetCount)))
        : null

      const relations = Array.isArray(params.relations)
        ? params.relations
          .map((item) => {
            const strengthValue =
              typeof item.strength === 'number'
                ? item.strength
                : typeof item.strength === 'string'
                  ? Number(item.strength)
                  : 3
            const strength = Number.isFinite(strengthValue)
              ? Math.max(1, Math.min(5, Math.round(strengthValue)))
              : 3
            return {
              source_ref: toText(item.source_ref).trim(),
              target_ref: toText(item.target_ref).trim(),
              relation_type: toText(item.relation_type).trim(),
              strength,
              notes: toText(item.notes).trim(),
              evidence: toText(item.evidence).trim(),
            }
          })
          .filter((row) => row.source_ref && row.target_ref && row.source_ref !== row.target_ref)
        : []

      const targetCountSection = targetCount
        ? [
          `Target shot count: ${targetCount}.`,
          `Try to output close to ${targetCount} shots (allow small deviation only if script structure truly requires it).`,
        ].join('\n\n')
        : ''

      const prompt = buildExtractionPrompt({
        key: 'extractShotsFromScript',
        overridesRaw: store.get('prompt_overrides'),
        script: params.script,
        variables: {
          targetCountSection,
          scenes: JSON.stringify(params.scenes),
          characters: JSON.stringify(params.characters),
          relations: JSON.stringify(relations),
          props: JSON.stringify(params.props),
          costumes: JSON.stringify(costumes),
          script: params.script,
        },
      })

      try {
        const { text } = await generateText({ model, prompt })
        const parsed = parseShots(text)
        const validSceneIds = new Set(params.scenes.map((scene) => scene.id))
        const validCharacterIds = new Set(params.characters.map((character) => character.id))
        const validPropIds = new Set(params.props.map((prop) => prop.id))
        const validCostumeIds = new Set(costumes.map((costume) => costume.id))
        const shots = parsed
          .map((shot) => ({
            ...shot,
            scene_ref: validSceneIds.has(shot.scene_ref) ? shot.scene_ref : (params.scenes[0]?.id || ''),
            character_refs: shot.character_refs.filter((id) => validCharacterIds.has(id)),
            prop_refs: shot.prop_refs.filter((id) => validPropIds.has(id)),
            costume_refs: shot.costume_refs.filter((id) => validCostumeIds.has(id)),
          }))
          .filter((shot) => shot.title && shot.scene_ref)
        return { ok: true, shots }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )
}
