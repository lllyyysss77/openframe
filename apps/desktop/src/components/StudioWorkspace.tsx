import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock3, Loader2, ListChecks, Trash2, XCircle } from 'lucide-react'
import { AI_PROVIDERS, type AIConfig } from '@openframe/providers'
import PQueue from 'p-queue'
import { ScriptEditor } from './ScriptEditor'
import { CharacterPanel, type CreateCharacterDraft } from './CharacterPanel'
import { ScenePanel, type CreateSceneDraft } from './ScenePanel'
import { ShotPanel, type ShotCard, type ShotDraft } from './ShotPanel'
import { seriesCollection } from '../db/series_collection'
import type { Character } from '../db/characters_collection'

type CharacterGender = Character['gender']
type CharacterAge = Character['age']

type Scene = {
  id: string
  series_id: string
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
  created_at: number
}

type StudioTaskStatus = 'queued' | 'running' | 'success' | 'error'

type StudioTaskItem = {
  id: string
  title: string
  status: StudioTaskStatus
  message: string
  created_at: number
}

interface StudioWorkspaceProps {
  projectId: string
  seriesId: string
  projectName: string
  projectCategory: string
  projectGenre: string
  seriesTitle: string
  scriptContent: string
}

export function StudioWorkspace({
  projectId,
  seriesId,
  projectName,
  projectCategory,
  projectGenre,
  seriesTitle,
  scriptContent,
}: StudioWorkspaceProps) {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState<'script' | 'character' | 'storyboard' | 'shot'>('script')
  const [extractMode, setExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [sceneExtractMode, setSceneExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [characterBusyId, setCharacterBusyId] = useState<string | null>(null)
  const [sceneBusyId, setSceneBusyId] = useState<string | null>(null)
  const [characterError, setCharacterError] = useState('')
  const [projectCharacters, setProjectCharacters] = useState<Character[]>([])
  const [sceneError, setSceneError] = useState('')
  const [seriesScenes, setSeriesScenes] = useState<Scene[]>([])
  const [shotError, setShotError] = useState('')
  const [seriesShots, setSeriesShots] = useState<ShotCard[]>([])
  const [generatingShotsFromScript, setGeneratingShotsFromScript] = useState(false)
  const [generatingShotImages, setGeneratingShotImages] = useState(false)
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null)
  const [taskQueue, setTaskQueue] = useState<StudioTaskItem[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const queueRef = useRef(new PQueue({ concurrency: 1 }))
  const [textModelOptions, setTextModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedTextModelKey, setSelectedTextModelKey] = useState('')
  const [imageModelOptions, setImageModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('')

  useEffect(() => {
    let active = true
    window.charactersAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setProjectCharacters(rows)
      })
      .catch(() => {
        if (active) setProjectCharacters([])
      })

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setSeriesScenes([])
      return
    }
    window.scenesAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (active) setSeriesScenes(rows)
      })
      .catch(() => {
        if (active) setSeriesScenes([])
      })
    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setSeriesShots([])
      return
    }
    window.shotsAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (active) setSeriesShots(rows)
      })
      .catch(() => {
        if (active) setSeriesShots([])
      })
    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    window.aiAPI
      .getConfig()
      .then((cfg) => {
        const config = cfg as AIConfig
        const textOptions: Array<{ key: string; label: string }> = []
        const imageOptions: Array<{ key: string; label: string }> = []
        for (const provider of AI_PROVIDERS) {
          const providerCfg = config.providers[provider.id]
          if (!providerCfg?.enabled) continue
          const builtinText = provider.models.filter((m) => m.type === 'text')
          const customText = (config.customModels[provider.id] ?? []).filter((m) => m.type === 'text')
          for (const model of [...builtinText, ...customText]) {
            const key = `${provider.id}:${model.id}`
            if (!config.enabledModels?.[key]) continue
            if (config.hiddenModels?.[key]) continue
            textOptions.push({ key, label: `${provider.name} / ${model.name || model.id}` })
          }

          const builtinImage = provider.models.filter((m) => m.type === 'image')
          const customImage = (config.customModels[provider.id] ?? []).filter((m) => m.type === 'image')
          for (const model of [...builtinImage, ...customImage]) {
            const key = `${provider.id}:${model.id}`
            if (!config.enabledModels?.[key]) continue
            if (config.hiddenModels?.[key]) continue
            imageOptions.push({ key, label: `${provider.name} / ${model.name || model.id}` })
          }
        }

        setTextModelOptions(textOptions)
        if (config.models?.text && textOptions.some((item) => item.key === config.models.text)) {
          setSelectedTextModelKey(config.models.text)
        } else {
          setSelectedTextModelKey(textOptions[0]?.key ?? '')
        }

        setImageModelOptions(imageOptions)
        if (config.models?.image && imageOptions.some((item) => item.key === config.models.image)) {
          setSelectedImageModelKey(config.models.image)
        } else {
          setSelectedImageModelKey(imageOptions[0]?.key ?? '')
        }
      })
      .catch(() => {
        setTextModelOptions([])
        setSelectedTextModelKey('')
        setImageModelOptions([])
        setSelectedImageModelKey('')
      })
  }, [])

  const workflowSteps = useMemo(
    () => [
      { key: 'script', label: t('projectLibrary.stepScript') },
      { key: 'character', label: t('projectLibrary.stepCharacter') },
      { key: 'storyboard', label: t('projectLibrary.stepStoryboard') },
      { key: 'shot', label: t('projectLibrary.stepShot') },
      { key: 'production', label: t('projectLibrary.stepProduction') },
      { key: 'export', label: t('projectLibrary.stepExport') },
    ],
    [t],
  )

  const showCharacterPanel = activeStep === 'character'
  const showScenePanel = activeStep === 'storyboard'
  const showShotPanel = activeStep === 'shot'

  function normalizeCharacterName(name: string): string {
    return name.trim().toLowerCase()
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
      default:
        return 'png'
    }
  }

  function updateTask(id: string, patch: Partial<StudioTaskItem>) {
    setTaskQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function enqueueTask(title: string, runner: () => Promise<void>) {
    const id = crypto.randomUUID()
    setTaskQueue((prev) => [
      ...prev,
      {
        id,
        title,
        status: 'queued',
        message: t('projectLibrary.taskQueued'),
        created_at: Date.now(),
      },
    ])

    void queueRef.current.add(async () => {
      updateTask(id, { status: 'running', message: t('projectLibrary.taskRunning') })
      try {
        await runner()
        updateTask(id, { status: 'success', message: t('projectLibrary.taskSuccess') })
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('projectLibrary.taskFailed')
        updateTask(id, { status: 'error', message: msg })
      }
    })
  }

  function uint8ToBase64(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }

  async function readThumbnailAsBase64(value: string | null): Promise<string | null> {
    if (!value) return null
    if (/^data:/i.test(value)) return value

    if (!/^(https?:|blob:|openframe-thumb:)/i.test(value)) {
      return window.thumbnailsAPI.readBase64(value)
    }

    if (/^openframe-thumb:/i.test(value)) {
      try {
        const parsed = new URL(value)
        const rawPath = parsed.searchParams.get('path')
        if (!rawPath) return null
        return window.thumbnailsAPI.readBase64(decodeURIComponent(rawPath))
      } catch {
        return null
      }
    }

    try {
      const res = await fetch(value)
      if (!res.ok) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length === 0) return null
      const mediaType = res.headers.get('content-type') || 'image/png'
      const base64 = uint8ToBase64(bytes)
      return `data:${mediaType};base64,${base64}`
    } catch {
      return null
    }
  }

  function mergeCharacters(existing: Character[], extracted: Character[]): Character[] {
    const next = [...existing]
    const nameIndex = new Map<string, number>()
    next.forEach((item, index) => {
      const key = normalizeCharacterName(item.name)
      if (key) nameIndex.set(key, index)
    })

    for (const item of extracted) {
      const key = normalizeCharacterName(item.name)
      if (!key) continue
      const hitIndex = nameIndex.get(key)
      if (hitIndex == null) {
        nameIndex.set(key, next.length)
        next.push(item)
        continue
      }

      const current = next[hitIndex]
      next[hitIndex] = {
        ...current,
        gender: current.gender || item.gender,
        age: current.age || item.age,
        personality: current.personality || item.personality,
        appearance: current.appearance || item.appearance,
        background: current.background || item.background,
      }
    }

    return next
  }

  async function extractCharactersFromScript(mode: 'merge' | 'replace') {
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

        const nextRows = mode === 'replace' ? extractedRows : mergeCharacters(projectCharacters, extractedRows)
        await window.charactersAPI.replaceByProject({ projectId, characters: nextRows })
        setProjectCharacters(nextRows)
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

  async function handleDeleteCharacter(id: string, name: string) {
    setCharacterError('')
    const shouldDelete = window.confirm(t('projectLibrary.characterDeleteConfirm', { name }))
    if (!shouldDelete) return
    try {
      await window.charactersAPI.delete(id)
      setProjectCharacters((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddCharacter(draft: CreateCharacterDraft) {
    setCharacterError('')
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
      setProjectCharacters((prev) => [...prev, row])
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function persistCharacter(nextCharacter: Character) {
    await window.charactersAPI.update(nextCharacter)
    setProjectCharacters((prev) => prev.map((item) => (item.id === nextCharacter.id ? nextCharacter : item)))
  }

  async function handleUpdateCharacter(
    id: string,
    draft: CreateCharacterDraft,
  ) {
    const current = projectCharacters.find((item) => item.id === id)
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
    const character = projectCharacters.find((item) => item.id === id)
    if (!character) return

    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const prompt = [
        'Character turnaround sheet, full body, front view, side view, back view, consistent costume and face.',
        'Clean studio lighting, white background, concept art style, high detail, no text watermark.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Name: ${character.name}`,
        `Gender: ${character.gender || 'unknown'}`,
        `Age: ${character.age || 'unknown'}`,
        `Personality: ${character.personality || 'unknown'}`,
        `Appearance: ${character.appearance || 'unknown'}`,
        `Background: ${character.background || 'unknown'}`,
      ].join('\n')

      const result = await window.aiAPI.generateImage({ prompt, modelKey: selectedImageModelKey || undefined })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

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

  function normalizeSceneTitle(value: string): string {
    return value.trim().toLowerCase()
  }

  function mergeScenes(existing: Scene[], extracted: Scene[]): Scene[] {
    const next = [...existing]
    const titleIndex = new Map<string, number>()
    next.forEach((item, index) => {
      const key = normalizeSceneTitle(item.title)
      if (key) titleIndex.set(key, index)
    })

    for (const item of extracted) {
      const key = normalizeSceneTitle(item.title)
      if (!key) continue
      const hitIndex = titleIndex.get(key)
      if (hitIndex == null) {
        titleIndex.set(key, next.length)
        next.push(item)
        continue
      }
      const current = next[hitIndex]
      next[hitIndex] = {
        ...current,
        location: current.location || item.location,
        time: current.time || item.time,
        mood: current.mood || item.mood,
        description: current.description || item.description,
        shot_notes: current.shot_notes || item.shot_notes,
      }
    }

    return next
  }

  async function extractScenesFromScript(mode: 'merge' | 'replace') {
    if (!seriesId) {
      setSceneError(t('projectLibrary.emptySeries'))
      return
    }
    if (!scriptContent.trim()) {
      setSceneError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setSceneExtractMode(mode)
    setSceneError('')
    enqueueTask(mode === 'replace' ? t('projectLibrary.sceneRegenerate') : t('projectLibrary.sceneFromDraft'), async () => {
      try {
        const result = await window.aiAPI.extractScenesFromScript({
          script: scriptContent,
          modelKey: selectedTextModelKey || undefined,
        })
        if (!result.ok) {
          setSceneError(result.error)
          return
        }

        const extractedRows: Scene[] = result.scenes.map((item, index) => ({
          id: crypto.randomUUID(),
          series_id: seriesId,
          title: item.title,
          location: item.location,
          time: item.time,
          mood: item.mood,
          description: item.description,
          shot_notes: item.shot_notes,
          thumbnail: null,
          created_at: Date.now() + index,
        }))

        const nextRows = mode === 'replace' ? extractedRows : mergeScenes(seriesScenes, extractedRows)
        await window.scenesAPI.replaceBySeries({ seriesId, scenes: nextRows })
        setSeriesScenes(nextRows)
      } catch {
        setSceneError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setSceneExtractMode(null)
      }
    })
  }

  async function handleExtractScenesFromScript() {
    await extractScenesFromScript('merge')
  }

  async function handleRegenerateScenesFromScript() {
    const shouldReplace = window.confirm(t('projectLibrary.sceneRegenerateConfirm'))
    if (!shouldReplace) return
    await extractScenesFromScript('replace')
  }

  async function persistScene(nextScene: Scene) {
    await window.scenesAPI.update(nextScene)
    setSeriesScenes((prev) => prev.map((item) => (item.id === nextScene.id ? nextScene : item)))
  }

  async function handleAddScene(draft: CreateSceneDraft) {
    if (!seriesId) return
    setSceneError('')
    const row: Scene = {
      id: crypto.randomUUID(),
      series_id: seriesId,
      title: draft.title,
      location: draft.location,
      time: draft.time,
      mood: draft.mood,
      description: draft.description,
      shot_notes: draft.shot_notes,
      thumbnail: draft.thumbnail,
      created_at: Date.now(),
    }
    try {
      await window.scenesAPI.insert(row)
      setSeriesScenes((prev) => [...prev, row])
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateScene(id: string, draft: CreateSceneDraft) {
    const current = seriesScenes.find((item) => item.id === id)
    if (!current) return
    setSceneError('')
    try {
      await persistScene({
        ...current,
        ...draft,
      })
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleSmartGenerateScene(
    draft: CreateSceneDraft,
  ): Promise<{ ok: true; draft: CreateSceneDraft } | { ok: false; error: string }> {
    if (!draft.title.trim()) {
      return { ok: false, error: t('projectLibrary.sceneTitleRequired') }
    }
    const context = [
      `Project category: ${projectCategory || 'unknown'}`,
      `Project style: ${projectGenre || 'unknown'}`,
      scriptContent ? `Script:\n${scriptContent}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await window.aiAPI.enhanceSceneFromScript({
        script: context,
        scene: {
          title: draft.title,
          location: draft.location,
          time: draft.time,
          mood: draft.mood,
          description: draft.description,
          shot_notes: draft.shot_notes,
        },
        modelKey: selectedTextModelKey || undefined,
      })
      if (!result.ok) return { ok: false, error: result.error }
      return {
        ok: true,
        draft: {
          ...draft,
          ...result.scene,
        },
      }
    } catch {
      return { ok: false, error: t('projectLibrary.aiToolkitFailed') }
    }
  }

  async function handleDeleteScene(id: string, title: string) {
    setSceneError('')
    const shouldDelete = window.confirm(t('projectLibrary.sceneDeleteConfirm', { name: title || t('projectLibrary.sceneCardUntitled') }))
    if (!shouldDelete) return
    try {
      await window.scenesAPI.delete(id)
      setSeriesScenes((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }




  async function handleGenerateSceneImage(id: string) {
    const scene = seriesScenes.find((item) => item.id === id)
    if (!scene) return

    setSceneBusyId(id)
    setSceneError('')
    try {
      const prompt = [
        'Cinematic storyboard environment keyframe, high quality, no text watermark.',
        'Environment-only scene. No people, no characters, no human silhouettes, no portraits.',
        'Generate a complete scene composition: clear foreground, midground, background, lighting, atmosphere, and key props.',
        'Use a wide establishing-shot framing with rich spatial depth and production-ready visual storytelling.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Scene title: ${scene.title || 'untitled'}`,
        `Location: ${scene.location || 'unknown'}`,
        `Time: ${scene.time || 'unknown'}`,
        `Mood: ${scene.mood || 'unknown'}`,
        `Scene description: ${scene.description || 'unknown'}`,
        `Shot notes: ${scene.shot_notes || 'unknown'}`,
      ].join('\n')

      const result = await window.aiAPI.generateImage({ prompt, modelKey: selectedImageModelKey || undefined })
      if (!result.ok) {
        setSceneError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

      await persistScene({
        ...scene,
        thumbnail: savedPath,
      })
    } catch {
      setSceneError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setSceneBusyId(null)
    }
  }

  function makeShotIndex(nextShots: ShotCard[]): ShotCard[] {
    return nextShots
      .slice()
      .sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
      .map((shot, index) => ({ ...shot, shot_index: index + 1 }))
  }

  async function addShot(draft: ShotDraft) {
    if (!seriesId) return
    setShotError('')
    try {
      const next: ShotCard[] = makeShotIndex([
        ...seriesShots,
        {
          ...draft,
          id: crypto.randomUUID(),
          series_id: seriesId,
          shot_index: seriesShots.length + 1,
          thumbnail: null,
          created_at: Date.now(),
        },
      ])
      await window.shotsAPI.replaceBySeries({ seriesId, shots: next })
      setSeriesShots(next)
    } catch {
      setShotError(t('projectLibrary.saveError'))
    }
  }

  async function updateShot(id: string, draft: ShotDraft) {
    setShotError('')
    try {
      const next = makeShotIndex(
        seriesShots.map((shot) =>
          shot.id === id
            ? {
                ...shot,
                ...draft,
              }
            : shot,
        ),
      )
      await window.shotsAPI.replaceBySeries({ seriesId, shots: next })
      setSeriesShots(next)
    } catch {
      setShotError(t('projectLibrary.saveError'))
    }
  }

  async function deleteShot(id: string, title: string) {
    const shouldDelete = window.confirm(t('projectLibrary.shotDeleteConfirm', { name: title || t('projectLibrary.shotCardUntitled') }))
    if (!shouldDelete) return
    setShotError('')
    try {
      const next = makeShotIndex(seriesShots.filter((shot) => shot.id !== id))
      await window.shotsAPI.replaceBySeries({ seriesId, shots: next })
      setSeriesShots(next)
    } catch {
      setShotError(t('projectLibrary.saveError'))
    }
  }

  async function generateShotsFromScript() {
    if (!scriptContent.trim()) {
      setShotError(t('projectLibrary.aiEditorEmpty'))
      return
    }
    if (!seriesScenes.length) {
      setShotError(t('projectLibrary.shotNeedScenes'))
      return
    }

    setGeneratingShotsFromScript(true)
    setShotError('')
    enqueueTask(t('projectLibrary.shotGenerateFromScript'), async () => {
      try {
        const result = await window.aiAPI.extractShotsFromScript({
          script: scriptContent,
          scenes: seriesScenes.map((scene) => ({ id: scene.id, title: scene.title })),
          characters: projectCharacters.map((character) => ({ id: character.id, name: character.name })),
          modelKey: selectedTextModelKey || undefined,
        })

        if (!result.ok) {
          setShotError(result.error)
          return
        }

        const generated: ShotCard[] = result.shots.map((shot, index) => ({
          id: crypto.randomUUID(),
          series_id: seriesId,
          scene_id: shot.scene_ref,
          title: shot.title,
          shot_size: shot.shot_size,
          camera_angle: shot.camera_angle,
          camera_move: shot.camera_move,
          duration_sec: shot.duration_sec,
          action: shot.action,
          dialogue: shot.dialogue,
          character_ids: shot.character_refs,
          shot_index: index + 1,
          thumbnail: null,
          created_at: Date.now() + index,
        }))

        const next = makeShotIndex(generated)
        await window.shotsAPI.replaceBySeries({ seriesId, shots: next })
        setSeriesShots(next)
      } catch {
        setShotError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setGeneratingShotsFromScript(false)
      }
    })
  }

  async function generateAllShotImages() {
    if (!seriesShots.length) {
      setShotError(t('projectLibrary.shotEmpty'))
      return
    }

    setGeneratingShotImages(true)
    setShotError('')

    const sceneMap = new Map(seriesScenes.map((scene) => [scene.id, scene]))
    const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))

    async function generateShotImage(shot: ShotCard) {
      const scene = sceneMap.get(shot.scene_id)
      const characterNames = shot.character_ids
        .map((id) => characterMap.get(id)?.name)
        .filter(Boolean)
        .join(', ')

      const referenceImages: string[] = []
      const sceneRef = await readThumbnailAsBase64(scene?.thumbnail ?? null)
      if (sceneRef) referenceImages.push(sceneRef)
      for (const cid of shot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }

      const prompt = [
        'Cinematic storyboard shot keyframe, production-ready, high detail, no watermark text.',
        'Reference consistency is mandatory: preserve identity, costume, silhouette, and environment composition from reference images.',
        'If references conflict, prioritize character identity consistency first, then scene continuity.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Shot title: ${shot.title || 'untitled shot'}`,
        `Shot size: ${shot.shot_size || 'unknown'}`,
        `Camera angle: ${shot.camera_angle || 'unknown'}`,
        `Camera movement: ${shot.camera_move || 'unknown'}`,
        `Action: ${shot.action || 'unknown'}`,
        `Dialogue: ${shot.dialogue || 'none'}`,
        `Scene: ${scene?.title || 'unknown'}`,
        `Location: ${scene?.location || 'unknown'}`,
        `Time: ${scene?.time || 'unknown'}`,
        `Mood: ${scene?.mood || 'unknown'}`,
        characterNames ? `Characters in shot: ${characterNames}` : 'Characters in shot: none',
      ].join('\n')

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: prompt, images: referenceImages } : prompt,
        modelKey: selectedImageModelKey || undefined,
      })

      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

      const updatedShot: ShotCard = {
        ...shot,
        thumbnail: savedPath,
      }
      await window.shotsAPI.update(updatedShot)
      setSeriesShots((prev) =>
        prev.map((item) =>
          item.id === shot.id
            ? {
                ...item,
                thumbnail: savedPath,
              }
            : item,
        ),
      )
    }

    const shotsToGenerate = [...seriesShots]
    let remaining = shotsToGenerate.length

    for (const shot of shotsToGenerate) {
      const taskTitle = `${t('projectLibrary.shotGenerateSingleImage')} · #${shot.shot_index} ${shot.title || t('projectLibrary.shotCardUntitled')}`
      enqueueTask(taskTitle, async () => {
        try {
          await generateShotImage(shot)
        } finally {
          remaining -= 1
          if (remaining <= 0) {
            setGeneratingShotImages(false)
          }
        }
      })
    }
  }

  async function generateSingleShotImage(id: string) {
    const shot = seriesShots.find((item) => item.id === id)

    if (!shot) return
    setGeneratingShotId(id)
    setShotError('')
    try {
      const sceneMap = new Map(seriesScenes.map((scene) => [scene.id, scene]))
      const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))
      const scene = sceneMap.get(shot.scene_id)
      const characterNames = shot.character_ids
        .map((cid) => characterMap.get(cid)?.name)
        .filter(Boolean)
        .join(', ')

      const referenceImages: string[] = []
      const sceneRef = await readThumbnailAsBase64(scene?.thumbnail ?? null)
      if (sceneRef) referenceImages.push(sceneRef)
      for (const cid of shot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }

      const prompt = [
        'Cinematic storyboard shot keyframe, production-ready, high detail, no watermark text.',
        'Reference consistency is mandatory: preserve identity, costume, silhouette, and environment composition from reference images.',
        'If references conflict, prioritize character identity consistency first, then scene continuity.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Shot title: ${shot.title || 'untitled shot'}`,
        `Shot size: ${shot.shot_size || 'unknown'}`,
        `Camera angle: ${shot.camera_angle || 'unknown'}`,
        `Camera movement: ${shot.camera_move || 'unknown'}`,
        `Action: ${shot.action || 'unknown'}`,
        `Dialogue: ${shot.dialogue || 'none'}`,
        `Scene: ${scene?.title || 'unknown'}`,
        `Location: ${scene?.location || 'unknown'}`,
        `Time: ${scene?.time || 'unknown'}`,
        `Mood: ${scene?.mood || 'unknown'}`,
        characterNames ? `Characters in shot: ${characterNames}` : 'Characters in shot: none',
      ].join('\n')

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: prompt, images: referenceImages } : prompt,
        modelKey: selectedImageModelKey || undefined,
      })

      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)
      await window.shotsAPI.update({ ...shot, thumbnail: savedPath })
      setSeriesShots((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail: savedPath } : item)))
    } catch {
      setShotError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setGeneratingShotId(null)
    }
  }

  function renderTaskStatusIcon(status: StudioTaskStatus) {
    if (status === 'queued') return <Clock3 size={12} className="text-base-content/55" />
    if (status === 'running') return <Loader2 size={12} className="text-info animate-spin" />
    if (status === 'success') return <CheckCircle2 size={12} className="text-success" />
    return <XCircle size={12} className="text-error" />
  }

  function clearTaskQueue() {
    const shouldClear = window.confirm(t('projectLibrary.taskQueueClearConfirm'))
    if (!shouldClear) return
    queueRef.current.clear()
    setTaskQueue((prev) => prev.filter((task) => task.status === 'running'))
  }

  return (
    <main className="h-full w-full overflow-hidden flex flex-col bg-linear-to-br from-base-200/40 via-base-100 to-base-200/30 text-base-content">
      <div className="sticky top-0 z-10 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <div className="relative px-4 py-3 flex items-center justify-center">
          <div className="absolute left-4 min-w-0">
            <p className="truncate text-sm font-semibold">{projectName}</p>
            <p className="truncate text-xs text-base-content/60">{seriesTitle}</p>
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto px-2">
            {workflowSteps.map((step, idx) => (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (step.key === 'script' || step.key === 'character' || step.key === 'storyboard' || step.key === 'shot') setActiveStep(step.key)
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border shrink-0 text-sm font-medium transition-colors ${
                  (activeStep === 'script' && step.key === 'script') || (activeStep === 'character' && step.key === 'character') || (activeStep === 'storyboard' && step.key === 'storyboard') || (activeStep === 'shot' && step.key === 'shot')
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : idx <= 3
                      ? 'border-base-300 hover:border-primary/30 text-base-content/70'
                      : 'border-base-300 text-base-content/45'
                }`}
              >
                <CheckCircle2 size={12} className={idx === 0 ? 'text-primary' : 'text-base-content/50'} />
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 min-h-0">
        {characterError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{characterError}</div> : null}
        {sceneError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{sceneError}</div> : null}
        {shotError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{shotError}</div> : null}
        {showCharacterPanel ? (
          <CharacterPanel
            characters={projectCharacters}
            extractingFromDraft={extractMode === 'merge'}
            extractingRegenerate={extractMode === 'replace'}
            characterBusyId={characterBusyId}
            textModelOptions={textModelOptions}
            selectedTextModelKey={selectedTextModelKey}
            onTextModelChange={setSelectedTextModelKey}
            imageModelOptions={imageModelOptions}
            selectedImageModelKey={selectedImageModelKey}
            onImageModelChange={setSelectedImageModelKey}
            onAddCharacter={(draft) => void handleAddCharacter(draft)}
            onUpdateCharacter={(id, draft) => void handleUpdateCharacter(id, draft)}
            onSmartGenerateCharacter={handleSmartGenerateCharacter}
            onExtractFromScript={() => void handleExtractCharactersFromScript()}
            onRegenerateFromScript={() => void handleRegenerateCharactersFromScript()}
            onDeleteCharacter={(id, name) => void handleDeleteCharacter(id, name)}
            onGenerateTurnaround={(id) => void handleGenerateTurnaround(id)}
          />
        ) : showScenePanel ? (
          <ScenePanel
            scenes={seriesScenes}
            extractingFromScript={sceneExtractMode === 'merge'}
            extractingRegenerate={sceneExtractMode === 'replace'}
            sceneBusyId={sceneBusyId}
            textModelOptions={textModelOptions}
            selectedTextModelKey={selectedTextModelKey}
            onTextModelChange={setSelectedTextModelKey}
            imageModelOptions={imageModelOptions}
            selectedImageModelKey={selectedImageModelKey}
            onImageModelChange={setSelectedImageModelKey}
            onAddScene={(draft) => void handleAddScene(draft)}
            onUpdateScene={(id, draft) => void handleUpdateScene(id, draft)}
            onSmartGenerateScene={handleSmartGenerateScene}
            onExtractFromScript={() => void handleExtractScenesFromScript()}
            onRegenerateFromScript={() => void handleRegenerateScenesFromScript()}
            onDeleteScene={(id, title) => void handleDeleteScene(id, title)}
            onGenerateSceneImage={(id) => void handleGenerateSceneImage(id)}
          />
        ) : showShotPanel ? (
          <ShotPanel
            shots={seriesShots}
            scenes={seriesScenes.map((scene) => ({ id: scene.id, title: scene.title }))}
            characters={projectCharacters.map((character) => ({ id: character.id, name: character.name }))}
            generatingFromScript={generatingShotsFromScript}
            generatingAllImages={generatingShotImages}
            generatingShotId={generatingShotId}
            onAddShot={addShot}
            onUpdateShot={updateShot}
            onDeleteShot={deleteShot}
            onGenerateFromScript={() => void generateShotsFromScript()}
            onGenerateAllImages={() => void generateAllShotImages()}
            onGenerateSingleImage={(id) => void generateSingleShotImage(id)}
          />
        ) : (
          <ScriptEditor
            content={scriptContent}
            onContentChange={(nextContent) => {
              if (!seriesId) return
              seriesCollection.update(seriesId, (draft) => {
                draft.script = nextContent
              })
            }}
          />
        )}
      </div>

      <div className="fixed right-4 bottom-4 z-20 w-[320px]">
        <div className="rounded-xl border border-base-300 bg-base-100/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium border-b border-base-300">
            <button type="button" className="inline-flex items-center gap-2" onClick={() => setQueueOpen((prev) => !prev)}>
              <ListChecks size={14} />
              {t('projectLibrary.taskQueueTitle')}
              <span className="text-xs text-base-content/60">{taskQueue.length}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={clearTaskQueue}
              disabled={taskQueue.length === 0}
              title={t('projectLibrary.taskQueueClear')}
            >
              <Trash2 size={12} />
              {t('projectLibrary.taskQueueClear')}
            </button>
          </div>

          {queueOpen ? (
            <div className="max-h-56 overflow-auto p-2 space-y-1.5">
              {taskQueue.length === 0 ? (
                <div className="px-2 py-3 text-xs text-base-content/60">{t('projectLibrary.taskQueueEmpty')}</div>
              ) : (
                taskQueue
                  .slice()
                  .sort((a, b) => a.created_at - b.created_at)
                  .map((task) => (
                    <div key={task.id} className="rounded-md border border-base-300 px-2 py-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        {renderTaskStatusIcon(task.status)}
                        <span className="line-clamp-1 font-medium">{task.title}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-base-content/65 line-clamp-2">{task.message}</div>
                    </div>
                  ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
