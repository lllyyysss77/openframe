import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import type { Character } from '../../db/characters_collection'
import type { CharacterRelation } from '../../db/character_relations_collection'
import type { CreateCharacterDraft } from './types'
import {
  renderPromptTemplate,
  type PromptOverrides,
} from '../../utils/prompt_overrides'

type QueueType = 'default' | 'media'

type EnqueueTask = (
  title: string,
  runner: () => Promise<void>,
  queueType?: QueueType,
) => void

type Params = {
  t: TFunction
  projectId: string
  seriesId: string
  scriptContent: string
  projectCategory: string
  projectGenre: string
  selectedTextModelKey: string
  selectedImageModelKey: string
  promptOverrides: PromptOverrides
  enqueueTask: EnqueueTask
}

type CharacterGender = Character['gender']
type CharacterAge = Character['age']

function normalizeCharacterName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeCharacterAgeKey(age: string): string {
  return (age || '').trim().toLowerCase()
}

function buildCharacterIdentityKey(name: string, age: string): string {
  const normalizedName = normalizeCharacterName(name)
  if (!normalizedName) return ''
  return `${normalizedName}::${normalizeCharacterAgeKey(age)}`
}

function normalizeGender(value: string): CharacterGender {
  const raw = (value || '').trim().toLowerCase()
  if (raw === 'male' || value === '男') return 'male'
  if (raw === 'female' || value === '女') return 'female'
  if (raw === 'other' || value === '其他') return 'other'
  return ''
}

function normalizeAge(value: string): CharacterAge {
  const raw = (value || '').trim().toLowerCase()
  if (raw === 'child' || value === '幼年') return 'child'
  if (raw === 'youth' || raw === 'teen' || value === '少年') return 'youth'
  if (raw === 'young_adult' || raw === 'young adult' || value === '青年') return 'young_adult'
  if (raw === 'adult' || value === '成年') return 'adult'
  if (raw === 'middle_aged' || raw === 'middle-aged' || value === '中年') return 'middle_aged'
  if (raw === 'elder' || value === '老年') return 'elder'
  return ''
}

function extFromMediaType(mediaType: string | undefined): string {
  const mt = (mediaType ?? '').toLowerCase().split(';')[0].trim()
  switch (mt) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    case 'image/svg+xml':
      return 'svg'
    case 'image/avif':
      return 'avif'
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    default:
      return 'png'
  }
}

function mergeCharacterValues(base: Character, incoming: Character): Character {
  return {
    ...base,
    gender: base.gender || incoming.gender,
    age: base.age || incoming.age,
    personality: base.personality || incoming.personality,
    appearance: base.appearance || incoming.appearance,
    background: base.background || incoming.background,
    thumbnail: base.thumbnail || incoming.thumbnail,
  }
}

function buildSeriesCharacters(params: {
  mode: 'merge' | 'replace'
  seriesCharacters: Character[]
  projectCharacters: Character[]
  extractedCharacters: Character[]
}): Character[] {
  const { mode, seriesCharacters, projectCharacters, extractedCharacters } = params
  const next: Character[] = []
  const identityIndex = new Map<string, number>()
  const projectByIdentity = new Map<string, Character>()

  for (const item of projectCharacters) {
    const key = buildCharacterIdentityKey(item.name, item.age)
    if (key && !projectByIdentity.has(key)) projectByIdentity.set(key, item)
  }

  function upsert(item: Character) {
    const key = buildCharacterIdentityKey(item.name, item.age)
    if (!key) {
      if (!next.some((row) => row.id === item.id)) next.push(item)
      return
    }
    const hitIndex = identityIndex.get(key)
    if (hitIndex == null) {
      identityIndex.set(key, next.length)
      next.push(item)
      return
    }
    next[hitIndex] = mergeCharacterValues(next[hitIndex], item)
  }

  if (mode === 'merge') {
    for (const item of seriesCharacters) {
      upsert(item)
    }
  }

  for (const item of extractedCharacters) {
    const key = buildCharacterIdentityKey(item.name, item.age)
    if (!key) continue
    const projectHit = projectByIdentity.get(key)
    upsert(projectHit ? mergeCharacterValues(projectHit, item) : item)
  }

  return next
}

function normalizeRelationType(value: string): string {
  return value.trim().toLowerCase()
}

function buildRelationKey(sourceId: string, targetId: string, relationType: string): string {
  const source = sourceId.trim()
  const target = targetId.trim()
  const type = normalizeRelationType(relationType)
  if (!source || !target || source === target || !type) return ''
  return `${source}|${target}|${type}`
}

function mergeCharacterRelations(existing: CharacterRelation[], extracted: CharacterRelation[]): CharacterRelation[] {
  const next = [...existing]
  const relationIndex = new Map<string, number>()
  next.forEach((item, index) => {
    const key = buildRelationKey(item.source_character_id, item.target_character_id, item.relation_type)
    if (key) relationIndex.set(key, index)
  })

  for (const item of extracted) {
    const key = buildRelationKey(item.source_character_id, item.target_character_id, item.relation_type)
    if (!key) continue
    const hitIndex = relationIndex.get(key)
    if (hitIndex == null) {
      relationIndex.set(key, next.length)
      next.push(item)
      continue
    }

    const current = next[hitIndex]
    next[hitIndex] = {
      ...current,
      strength: item.strength,
      notes: item.notes || current.notes,
      evidence: item.evidence || current.evidence,
    }
  }

  return next
}

export function useCharacterStudioLogic(params: Params) {
  const {
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    selectedTextModelKey,
    selectedImageModelKey,
    promptOverrides,
    enqueueTask,
  } = params

  const [extractMode, setExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [characterBusyId, setCharacterBusyId] = useState<string | null>(null)
  const [characterError, setCharacterError] = useState('')
  const [projectCharacters, setProjectCharacters] = useState<Character[]>([])
  const [allProjectCharacters, setAllProjectCharacters] = useState<Character[]>([])
  const [showCurrentSeriesCharactersOnly, setShowCurrentSeriesCharactersOnly] = useState(true)
  const [relationError, setRelationError] = useState('')
  const [optimizingRelations, setOptimizingRelations] = useState(false)
  const [projectCharacterRelations, setProjectCharacterRelations] = useState<CharacterRelation[]>([])
  const [generatingCharacterImages, setGeneratingCharacterImages] = useState(false)

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setProjectCharacters([])
      return () => {
        active = false
      }
    }
    window.charactersAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (active) setProjectCharacters(rows)
      })
      .catch(() => {
        if (active) setProjectCharacters([])
      })

    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    let active = true
    if (!projectId) {
      setAllProjectCharacters([])
      return () => {
        active = false
      }
    }
    window.charactersAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setAllProjectCharacters(rows)
      })
      .catch(() => {
        if (active) setAllProjectCharacters([])
      })

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    let active = true
    window.characterRelationsAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setProjectCharacterRelations(rows)
      })
      .catch(() => {
        if (active) setProjectCharacterRelations([])
      })

    return () => {
      active = false
    }
  }, [projectId])

  const visibleCharacters = useMemo(() => {
    if (showCurrentSeriesCharactersOnly) return projectCharacters
    return allProjectCharacters
  }, [allProjectCharacters, projectCharacters, showCurrentSeriesCharactersOnly])

  async function extractCharactersFromScript(mode: 'merge' | 'replace') {
    if (!seriesId) {
      setCharacterError(t('projectLibrary.emptySeries'))
      return
    }
    if (!scriptContent.trim()) {
      setCharacterError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setExtractMode(mode)
    setCharacterError('')
    enqueueTask(mode === 'replace' ? t('projectLibrary.characterRegenerate') : t('projectLibrary.characterFromDraft'), async () => {
      try {
        const result = await window.aiAPI.extractCharactersFromScript({
          script: scriptContent,
          modelKey: selectedTextModelKey || undefined,
        })
        if (!result.ok) {
          setCharacterError(result.error)
          return
        }

        const extractedRows = result.characters.map((item, index) => ({
          id: crypto.randomUUID(),
          project_id: projectId,
          name: item.name,
          gender: normalizeGender(item.gender),
          age: normalizeAge(item.age),
          personality: item.personality,
          thumbnail: null,
          appearance: item.appearance,
          background: item.background,
          created_at: Date.now() + index,
        }))

        const nextRows = buildSeriesCharacters({
          mode,
          seriesCharacters: projectCharacters,
          projectCharacters: allProjectCharacters,
          extractedCharacters: extractedRows,
        })
        await window.charactersAPI.replaceBySeries({ projectId, seriesId, characters: nextRows })
        setProjectCharacters(nextRows)
        try {
          const rows = await window.charactersAPI.getByProject(projectId)
          setAllProjectCharacters(rows)
        } catch {
          // keep current list when refresh fails
        }
      } catch {
        setCharacterError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setExtractMode(null)
      }
    })
  }

  async function handleExtractCharactersFromScript() {
    await extractCharactersFromScript('merge')
  }

  async function handleRegenerateCharactersFromScript() {
    const shouldReplace = window.confirm(t('projectLibrary.characterRegenerateConfirm'))
    if (!shouldReplace) return
    await extractCharactersFromScript('replace')
  }

  function queueOptimizeRelationsFromCurrentScript() {
    if (projectCharacters.length < 2) {
      setRelationError(t('projectLibrary.relationNeedCharacters'))
      return
    }
    if (!scriptContent.trim()) {
      setRelationError(t('projectLibrary.relationNeedScript'))
      return
    }

    setRelationError('')
    setOptimizingRelations(true)
    enqueueTask(t('projectLibrary.relationOptimizeFromCurrentScript'), async () => {
      try {
        const result = await window.aiAPI.extractCharacterRelationsFromScript({
          script: scriptContent,
          characters: projectCharacters.map((character) => ({
            id: character.id,
            name: character.name,
            personality: character.personality,
            background: character.background,
          })),
          existingRelations: projectCharacterRelations.map((row) => ({
            source_ref: row.source_character_id,
            target_ref: row.target_character_id,
            relation_type: row.relation_type,
            strength: row.strength,
            notes: row.notes,
            evidence: row.evidence,
          })),
          modelKey: selectedTextModelKey || undefined,
        })
        if (!result.ok) {
          setRelationError(result.error)
          return
        }

        const extractedRows: CharacterRelation[] = result.relations.map((item, index) => ({
          id: crypto.randomUUID(),
          project_id: projectId,
          source_character_id: item.source_ref,
          target_character_id: item.target_ref,
          relation_type: item.relation_type,
          strength: item.strength,
          notes: item.notes,
          evidence: item.evidence,
          created_at: Date.now() + index,
        }))

        const nextRows = mergeCharacterRelations(projectCharacterRelations, extractedRows)
        await window.characterRelationsAPI.replaceByProject({ projectId, relations: nextRows })
        setProjectCharacterRelations(nextRows)
      } catch {
        setRelationError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setOptimizingRelations(false)
      }
    })
  }

  async function handleDeleteCharacter(id: string, name: string) {
    if (!seriesId) return
    setCharacterError('')
    const shouldDelete = window.confirm(t('projectLibrary.characterDeleteConfirm', { name }))
    if (!shouldDelete) return
    try {
      const linkedToCurrentSeries = projectCharacters.some((item) => item.id === id)
      if (linkedToCurrentSeries) {
        await window.charactersAPI.unlinkFromSeries({ seriesId, characterId: id })
      } else {
        await window.charactersAPI.delete(id)
        const nextRelations = projectCharacterRelations.filter(
          (row) => row.source_character_id !== id && row.target_character_id !== id,
        )
        if (nextRelations.length !== projectCharacterRelations.length) {
          await window.characterRelationsAPI.replaceByProject({ projectId, relations: nextRelations })
          setProjectCharacterRelations(nextRelations)
        }
      }
      const [seriesRows, projectRows] = await Promise.all([
        window.charactersAPI.getBySeries(seriesId),
        window.charactersAPI.getByProject(projectId),
      ])
      setProjectCharacters(seriesRows)
      setAllProjectCharacters(projectRows)
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddCharacter(draft: CreateCharacterDraft) {
    if (!seriesId) return
    setCharacterError('')
    const identityKey = buildCharacterIdentityKey(draft.name, draft.age)
    const existing = identityKey
      ? allProjectCharacters.find((item) => buildCharacterIdentityKey(item.name, item.age) === identityKey)
      : null

    if (existing) {
      const merged = mergeCharacterValues(existing, {
        ...existing,
        name: draft.name,
        gender: draft.gender,
        age: draft.age,
        personality: draft.personality,
        appearance: draft.appearance,
        background: draft.background,
        thumbnail: draft.thumbnail,
      })
      const changed = (
        merged.gender !== existing.gender
        || merged.age !== existing.age
        || merged.personality !== existing.personality
        || merged.appearance !== existing.appearance
        || merged.background !== existing.background
        || merged.thumbnail !== existing.thumbnail
      )

      try {
        if (changed) {
          await window.charactersAPI.update(merged)
          setAllProjectCharacters((prev) => prev.map((item) => (item.id === merged.id ? merged : item)))
        }
        await window.charactersAPI.linkToSeries({
          project_id: projectId,
          series_id: seriesId,
          character_id: existing.id,
          created_at: Date.now(),
        })
        setProjectCharacters((prev) => {
          const next = prev.some((item) => item.id === existing.id)
            ? prev.map((item) => (item.id === existing.id ? merged : item))
            : [...prev, merged]
          return next.sort((left, right) => left.created_at - right.created_at)
        })
        return
      } catch {
        setCharacterError(t('projectLibrary.saveError'))
        return
      }
    }

    const row: Character = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: draft.name,
      gender: draft.gender,
      age: draft.age,
      personality: draft.personality,
      thumbnail: draft.thumbnail,
      appearance: draft.appearance,
      background: draft.background,
      created_at: Date.now(),
    }

    try {
      await window.charactersAPI.insert(row)
      await window.charactersAPI.linkToSeries({
        project_id: projectId,
        series_id: seriesId,
        character_id: row.id,
        created_at: Date.now(),
      })
      setProjectCharacters((prev) => [...prev, row].sort((left, right) => left.created_at - right.created_at))
      setAllProjectCharacters((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]))
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function persistCharacter(nextCharacter: Character) {
    await window.charactersAPI.update(nextCharacter)
    setProjectCharacters((prev) => prev.map((item) => (item.id === nextCharacter.id ? nextCharacter : item)))
    setAllProjectCharacters((prev) => prev.map((item) => (item.id === nextCharacter.id ? nextCharacter : item)))
  }

  async function handleUpdateCharacter(id: string, draft: CreateCharacterDraft) {
    const identityKey = buildCharacterIdentityKey(draft.name, draft.age)
    if (identityKey) {
      const duplicate = allProjectCharacters.find(
        (item) => item.id !== id && buildCharacterIdentityKey(item.name, item.age) === identityKey,
      )
      if (duplicate) {
        setCharacterError(t('projectLibrary.characterNameAgeUnique'))
        return
      }
    }

    const current = projectCharacters.find((item) => item.id === id) ?? allProjectCharacters.find((item) => item.id === id)
    if (!current) return
    setCharacterError('')
    try {
      await persistCharacter({
        ...current,
        ...draft,
      })
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleSmartGenerateCharacter(
    draft: CreateCharacterDraft,
  ): Promise<{ ok: true; draft: CreateCharacterDraft } | { ok: false; error: string }> {
    if (!draft.name.trim()) {
      return { ok: false, error: t('projectLibrary.characterNameRequired') }
    }

    const context = [
      `Project category: ${projectCategory || 'unknown'}`,
      `Project style: ${projectGenre || 'unknown'}`,
      scriptContent ? `Script:\n${scriptContent}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await window.aiAPI.enhanceCharacterFromScript({
        script: context,
        character: {
          name: draft.name,
          gender: draft.gender,
          age: draft.age,
          personality: draft.personality,
          appearance: draft.appearance,
          background: draft.background,
        },
        modelKey: selectedTextModelKey || undefined,
      })

      if (!result.ok) {
        return { ok: false, error: result.error }
      }

      return {
        ok: true,
        draft: {
          ...draft,
          gender: normalizeGender(result.character.gender),
          age: normalizeAge(result.character.age),
          personality: result.character.personality,
          appearance: result.character.appearance,
          background: result.character.background,
        },
      }
    } catch {
      return { ok: false, error: t('projectLibrary.aiToolkitFailed') }
    }
  }

  async function handleGenerateTurnaround(id: string) {
    const character = projectCharacters.find((item) => item.id === id) ?? allProjectCharacters.find((item) => item.id === id)
    if (!character) return

    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const prompt = renderPromptTemplate(promptOverrides.characterTurnaround, {
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        name: character.name || 'unknown',
        gender: character.gender || 'unknown',
        age: character.age || 'unknown',
        personality: character.personality || 'unknown',
        appearance: character.appearance || 'unknown',
        background: character.background || 'unknown',
      })

      const result = await window.aiAPI.generateImage({ prompt, modelKey: selectedImageModelKey || undefined })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

      await persistCharacter({
        ...character,
        thumbnail: savedPath,
      })
    } catch {
      setCharacterError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setCharacterBusyId(null)
    }
  }

  function queueGenerateCharacterImage(id: string) {
    const character = projectCharacters.find((item) => item.id === id) ?? allProjectCharacters.find((item) => item.id === id)
    const taskTitle = `${t('projectLibrary.characterGenerateTurnaround')} · ${character?.name || t('projectLibrary.characterPanelTitle')}`
    enqueueTask(taskTitle, async () => {
      await handleGenerateTurnaround(id)
    }, 'media')
  }

  async function generateAllCharacterImages() {
    if (!projectCharacters.length) {
      setCharacterError(t('projectLibrary.characterEmptyHint'))
      return
    }

    setGeneratingCharacterImages(true)
    setCharacterError('')

    let remaining = projectCharacters.length
    for (const character of [...projectCharacters]) {
      const taskTitle = `${t('projectLibrary.characterGenerateTurnaround')} · ${character.name || t('projectLibrary.characterPanelTitle')}`
      enqueueTask(taskTitle, async () => {
        try {
          await handleGenerateTurnaround(character.id)
        } finally {
          remaining -= 1
          if (remaining <= 0) {
            setGeneratingCharacterImages(false)
          }
        }
      }, 'media')
    }
  }

  const characterPanelProps = {
    characters: visibleCharacters,
    extractingFromDraft: extractMode === 'merge',
    extractingRegenerate: extractMode === 'replace',
    characterBusyId,
    currentSeriesOnly: showCurrentSeriesCharactersOnly,
    onToggleCurrentSeriesOnly: setShowCurrentSeriesCharactersOnly,
    onAddCharacter: handleAddCharacter,
    onUpdateCharacter: handleUpdateCharacter,
    onSmartGenerateCharacter: handleSmartGenerateCharacter,
    onExtractFromScript: handleExtractCharactersFromScript,
    onRegenerateFromScript: handleRegenerateCharactersFromScript,
    onDeleteCharacter: handleDeleteCharacter,
    onGenerateTurnaround: queueGenerateCharacterImage,
    onGenerateAllImages: generateAllCharacterImages,
    generatingAllImages: generatingCharacterImages,
  }

  return {
    extractMode,
    characterBusyId,
    characterError,
    relationError,
    optimizingRelations,
    generatingCharacterImages,
    projectCharacters,
    allProjectCharacters,
    visibleCharacters,
    showCurrentSeriesCharactersOnly,
    setShowCurrentSeriesCharactersOnly,
    projectCharacterRelations,
    handleAddCharacter,
    handleUpdateCharacter,
    handleSmartGenerateCharacter,
    handleExtractCharactersFromScript,
    handleRegenerateCharactersFromScript,
    handleDeleteCharacter,
    queueGenerateCharacterImage,
    generateAllCharacterImages,
    queueOptimizeRelationsFromCurrentScript,
    characterPanelProps,
  }
}
