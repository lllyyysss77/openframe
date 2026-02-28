import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import type { CreateSceneDraft, Scene } from './types'
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
  projectRatio: '16:9' | '9:16'
  selectedTextModelKey: string
  selectedImageModelKey: string
  promptOverrides: PromptOverrides
  enqueueTask: EnqueueTask
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

function normalizeSceneTitle(value: string): string {
  return value.trim().toLowerCase()
}

function mergeSceneValues(base: Scene, incoming: Scene): Scene {
  return {
    ...base,
    location: base.location || incoming.location,
    time: base.time || incoming.time,
    mood: base.mood || incoming.mood,
    description: base.description || incoming.description,
    shot_notes: base.shot_notes || incoming.shot_notes,
    thumbnail: base.thumbnail || incoming.thumbnail,
  }
}

function buildSeriesScenes(params: {
  mode: 'merge' | 'replace'
  seriesScenes: Scene[]
  projectScenes: Scene[]
  extractedScenes: Scene[]
}): Scene[] {
  const { mode, seriesScenes, projectScenes, extractedScenes } = params
  const next: Scene[] = []
  const titleIndex = new Map<string, number>()
  const projectByTitle = new Map<string, Scene>()

  for (const item of projectScenes) {
    const key = normalizeSceneTitle(item.title)
    if (key && !projectByTitle.has(key)) projectByTitle.set(key, item)
  }

  function upsert(item: Scene) {
    const key = normalizeSceneTitle(item.title)
    if (!key) {
      if (!next.some((row) => row.id === item.id)) next.push(item)
      return
    }
    const hitIndex = titleIndex.get(key)
    if (hitIndex == null) {
      titleIndex.set(key, next.length)
      next.push(item)
      return
    }
    next[hitIndex] = mergeSceneValues(next[hitIndex], item)
  }

  if (mode === 'merge') {
    for (const item of seriesScenes) {
      upsert(item)
    }
  }

  for (const item of extractedScenes) {
    const key = normalizeSceneTitle(item.title)
    if (!key) continue
    const projectHit = projectByTitle.get(key)
    upsert(projectHit ? mergeSceneValues(projectHit, item) : item)
  }

  return next
}

export function useSceneStudioLogic(params: Params) {
  const {
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    projectRatio,
    selectedTextModelKey,
    selectedImageModelKey,
    promptOverrides,
    enqueueTask,
  } = params

  const [sceneExtractMode, setSceneExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [sceneBusyId, setSceneBusyId] = useState<string | null>(null)
  const [sceneError, setSceneError] = useState('')
  const [seriesScenes, setSeriesScenes] = useState<Scene[]>([])
  const [currentSeriesSceneIds, setCurrentSeriesSceneIds] = useState<string[]>([])
  const [showCurrentSeriesScenesOnly, setShowCurrentSeriesScenesOnly] = useState(true)
  const [generatingSceneImages, setGeneratingSceneImages] = useState(false)
  const [shotsRefreshTick, setShotsRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    if (!projectId) {
      setSeriesScenes([])
      return
    }
    window.scenesAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setSeriesScenes(rows)
      })
      .catch(() => {
        if (active) setSeriesScenes([])
      })
    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setCurrentSeriesSceneIds([])
      return () => {
        active = false
      }
    }
    window.scenesAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (!active) return
        setCurrentSeriesSceneIds(rows.map((row) => row.id))
      })
      .catch(() => {
        if (active) setCurrentSeriesSceneIds([])
      })
    return () => {
      active = false
    }
  }, [seriesId])

  const currentSeriesSceneIdSet = useMemo(
    () => new Set(currentSeriesSceneIds),
    [currentSeriesSceneIds],
  )
  const currentSeriesScenes = useMemo(
    () => seriesScenes.filter((scene) => currentSeriesSceneIdSet.has(scene.id)),
    [currentSeriesSceneIdSet, seriesScenes],
  )

  const visibleScenes = useMemo(() => {
    if (!showCurrentSeriesScenesOnly) return seriesScenes
    return currentSeriesScenes
  }, [currentSeriesScenes, seriesScenes, showCurrentSeriesScenesOnly])

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
          project_id: projectId,
          title: item.title,
          location: item.location,
          time: item.time,
          mood: item.mood,
          description: item.description,
          shot_notes: item.shot_notes,
          thumbnail: null,
          created_at: Date.now() + index,
        }))

        const nextRows = buildSeriesScenes({
          mode,
          seriesScenes: currentSeriesScenes,
          projectScenes: seriesScenes,
          extractedScenes: extractedRows,
        })
        await window.scenesAPI.replaceBySeries({ projectId, seriesId, scenes: nextRows })
        const retainedRows = seriesScenes.filter((scene) => !currentSeriesSceneIdSet.has(scene.id))
        const mergedRows = [...retainedRows, ...nextRows]
        const uniqueRows = new Map<string, Scene>()
        for (const row of mergedRows) {
          uniqueRows.set(row.id, row)
        }
        setSeriesScenes(
          [...uniqueRows.values()].sort((left, right) => left.created_at - right.created_at),
        )
        setCurrentSeriesSceneIds(nextRows.map((scene) => scene.id))
        setShotsRefreshTick((prev) => prev + 1)
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
    if (!projectId || !seriesId) return
    setSceneError('')
    const normalizedTitle = normalizeSceneTitle(draft.title)
    const existing = normalizedTitle
      ? seriesScenes.find((item) => normalizeSceneTitle(item.title) === normalizedTitle)
      : null

    if (existing) {
      const merged = mergeSceneValues(existing, {
        ...existing,
        title: draft.title,
        location: draft.location,
        time: draft.time,
        mood: draft.mood,
        description: draft.description,
        shot_notes: draft.shot_notes,
        thumbnail: draft.thumbnail,
      })
      const changed = (
        merged.location !== existing.location
        || merged.time !== existing.time
        || merged.mood !== existing.mood
        || merged.description !== existing.description
        || merged.shot_notes !== existing.shot_notes
        || merged.thumbnail !== existing.thumbnail
      )

      try {
        if (changed) {
          await window.scenesAPI.update(merged)
          setSeriesScenes((prev) => prev.map((item) => (item.id === merged.id ? merged : item)))
        }
        await window.scenesAPI.linkToSeries({
          project_id: projectId,
          series_id: seriesId,
          scene_id: existing.id,
          created_at: Date.now(),
        })
        setCurrentSeriesSceneIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]))
        return
      } catch {
        setSceneError(t('projectLibrary.saveError'))
        return
      }
    }

    const row: Scene = {
      id: crypto.randomUUID(),
      project_id: projectId,
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
      await window.scenesAPI.linkToSeries({
        project_id: projectId,
        series_id: seriesId,
        scene_id: row.id,
        created_at: Date.now(),
      })
      setSeriesScenes((prev) => [...prev, row].sort((left, right) => left.created_at - right.created_at))
      setCurrentSeriesSceneIds((prev) => [...prev, row.id])
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
    if (!seriesId) return
    setSceneError('')
    const shouldDelete = window.confirm(t('projectLibrary.sceneDeleteConfirm', { name: title || t('projectLibrary.sceneCardUntitled') }))
    if (!shouldDelete) return
    try {
      await window.scenesAPI.unlinkFromSeries({ seriesId, sceneId: id })
      const [projectRows, seriesRows] = await Promise.all([
        window.scenesAPI.getByProject(projectId),
        window.scenesAPI.getBySeries(seriesId),
      ])
      setSeriesScenes(projectRows.sort((left, right) => left.created_at - right.created_at))
      setCurrentSeriesSceneIds(seriesRows.map((row) => row.id))
      setShotsRefreshTick((prev) => prev + 1)
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
      const prompt = renderPromptTemplate(promptOverrides.sceneTurnaround, {
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        sceneTitle: scene.title || 'untitled',
        location: scene.location || 'unknown',
        time: scene.time || 'unknown',
        mood: scene.mood || 'unknown',
      })

      const result = await window.aiAPI.generateImage({
        prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        setSceneError(result.error)
        return
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

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

  function queueGenerateSceneImage(id: string) {
    const scene = seriesScenes.find((item) => item.id === id)
    const taskTitle = `${t('projectLibrary.sceneGenerateImage')} · ${scene?.title || t('projectLibrary.sceneCardUntitled')}`
    enqueueTask(taskTitle, async () => {
      await handleGenerateSceneImage(id)
    }, 'media')
  }

  async function generateAllSceneImages() {
    if (!visibleScenes.length) {
      setSceneError(t('projectLibrary.sceneEmptyHint'))
      return
    }

    setGeneratingSceneImages(true)
    setSceneError('')

    let remaining = visibleScenes.length
    for (const scene of [...visibleScenes]) {
      const taskTitle = `${t('projectLibrary.sceneGenerateImage')} · ${scene.title || t('projectLibrary.sceneCardUntitled')}`
      enqueueTask(taskTitle, async () => {
        try {
          await handleGenerateSceneImage(scene.id)
        } finally {
          remaining -= 1
          if (remaining <= 0) {
            setGeneratingSceneImages(false)
          }
        }
      }, 'media')
    }
  }

  const scenePanelProps = {
    scenes: visibleScenes,
    projectRatio,
    extractingFromScript: sceneExtractMode === 'merge',
    extractingRegenerate: sceneExtractMode === 'replace',
    sceneBusyId,
    currentSeriesOnly: showCurrentSeriesScenesOnly,
    onToggleCurrentSeriesOnly: setShowCurrentSeriesScenesOnly,
    onAddScene: handleAddScene,
    onUpdateScene: handleUpdateScene,
    onSmartGenerateScene: handleSmartGenerateScene,
    onExtractFromScript: handleExtractScenesFromScript,
    onRegenerateFromScript: handleRegenerateScenesFromScript,
    onDeleteScene: handleDeleteScene,
    onGenerateSceneImage: queueGenerateSceneImage,
    onGenerateAllImages: generateAllSceneImages,
    generatingAllImages: generatingSceneImages,
  }

  return {
    sceneExtractMode,
    sceneBusyId,
    sceneError,
    generatingSceneImages,
    shotsRefreshTick,
    seriesScenes,
    currentSeriesSceneIds,
    currentSeriesScenes,
    visibleScenes,
    showCurrentSeriesScenesOnly,
    setShowCurrentSeriesScenesOnly,
    handleAddScene,
    handleUpdateScene,
    handleSmartGenerateScene,
    handleExtractScenesFromScript,
    handleRegenerateScenesFromScript,
    handleDeleteScene,
    queueGenerateSceneImage,
    generateAllSceneImages,
    scenePanelProps,
  }
}
