import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock3, Loader2, ListChecks, ScrollText, Sparkles, Trash2, XCircle } from 'lucide-react'
import { getSelectableModelsByType, type AIConfig } from '@openframe/providers'
import PQueue from 'p-queue'
import { ScriptEditor } from './ScriptEditor'
import { CharacterPanel, type CreateCharacterDraft } from './CharacterPanel'
import { PropPanel, type CreatePropDraft } from './PropPanel'
import { ScenePanel, type CreateSceneDraft } from './ScenePanel'
import { ShotPanel, type ShotCard, type ShotDraft } from './ShotPanel'
import { VideoPanel } from './VideoPanel'
import { ProductionWorkspacePanel, type EditedClipPayload } from './ProductionWorkspacePanel'
import { seriesCollection } from '../db/series_collection'
import type { Character } from '../db/characters_collection'
import type { CharacterRelation } from '../db/character_relations_collection'
import type { Prop } from '../db/props_collection'

type CharacterGender = Character['gender']
type CharacterAge = Character['age']

type Scene = {
  id: string
  series_id?: string
  project_id: string
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

type WorkflowStepKey = 'script' | 'character' | 'prop' | 'storyboard' | 'shot' | 'production' | 'export'

interface StudioWorkspaceProps {
  projectId: string
  seriesId: string
  projectName: string
  projectRatio: '16:9' | '9:16'
  projectCategory: string
  projectGenre: string
  seriesTitle: string
  scriptContent: string
}

export function StudioWorkspace({
  projectId,
  seriesId,
  projectName,
  projectRatio,
  projectCategory,
  projectGenre,
  seriesTitle,
  scriptContent,
}: StudioWorkspaceProps) {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState<WorkflowStepKey>('script')
  const [extractMode, setExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [propExtractMode, setPropExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [sceneExtractMode, setSceneExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [characterBusyId, setCharacterBusyId] = useState<string | null>(null)
  const [propBusyId, setPropBusyId] = useState<string | null>(null)
  const [sceneBusyId, setSceneBusyId] = useState<string | null>(null)
  const [characterError, setCharacterError] = useState('')
  const [projectCharacters, setProjectCharacters] = useState<Character[]>([])
  const [allProjectCharacters, setAllProjectCharacters] = useState<Character[]>([])
  const [showCurrentSeriesCharactersOnly, setShowCurrentSeriesCharactersOnly] = useState(true)
  const [relationError, setRelationError] = useState('')
  const [optimizingRelations, setOptimizingRelations] = useState(false)
  const [projectCharacterRelations, setProjectCharacterRelations] = useState<CharacterRelation[]>([])
  const [propError, setPropError] = useState('')
  const [projectProps, setProjectProps] = useState<Prop[]>([])
  const [allProjectProps, setAllProjectProps] = useState<Prop[]>([])
  const [showCurrentSeriesPropsOnly, setShowCurrentSeriesPropsOnly] = useState(true)
  const [sceneError, setSceneError] = useState('')
  const [seriesScenes, setSeriesScenes] = useState<Scene[]>([])
  const [currentSeriesSceneIds, setCurrentSeriesSceneIds] = useState<string[]>([])
  const [showCurrentSeriesScenesOnly, setShowCurrentSeriesScenesOnly] = useState(true)
  const [shotError, setShotError] = useState('')
  const [seriesShots, setSeriesShots] = useState<ShotCard[]>([])
  const [generatingCharacterImages, setGeneratingCharacterImages] = useState(false)
  const [generatingPropImages, setGeneratingPropImages] = useState(false)
  const [generatingSceneImages, setGeneratingSceneImages] = useState(false)
  const [generatingShotsFromScript, setGeneratingShotsFromScript] = useState(false)
  const [generatingShotImages, setGeneratingShotImages] = useState(false)
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null)
  const [taskQueue, setTaskQueue] = useState<StudioTaskItem[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const queueRef = useRef(new PQueue({ concurrency: 1 }))
  const mediaQueueRef = useRef(new PQueue({ concurrency: 5 }))
  const [textModelOptions, setTextModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedTextModelKey, setSelectedTextModelKey] = useState('')
  const [imageModelOptions, setImageModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('')
  const [videoModelOptions, setVideoModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedVideoModelKey, setSelectedVideoModelKey] = useState('')
  const [productionFrames, setProductionFrames] = useState<Record<string, { first: string | null; last: string | null; video: string | null }>>({})
  const [productionFrameBusyKey, setProductionFrameBusyKey] = useState<string | null>(null)
  const [productionVideoBusyShotId, setProductionVideoBusyShotId] = useState<string | null>(null)
  const [productionAutoEditBusy, setProductionAutoEditBusy] = useState(false)
  const [productionAutoEditVideo, setProductionAutoEditVideo] = useState<string | null>(null)
  const [exportingMergedVideo, setExportingMergedVideo] = useState(false)
  const [exportingTimeline, setExportingTimeline] = useState(false)
  const [exportingEdl, setExportingEdl] = useState(false)

  function applySeriesShots(rows: ShotCard[]) {
    setSeriesShots(rows)
    setProductionFrames(() => {
      const next: Record<string, { first: string | null; last: string | null; video: string | null }> = {}
      for (const row of rows) {
        next[row.id] = {
          first: row.production_first_frame ?? null,
          last: row.production_last_frame ?? null,
          video: row.production_video ?? null,
        }
      }
      return next
    })
  }

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

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setProjectProps([])
      return () => {
        active = false
      }
    }
    window.propsAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (active) setProjectProps(rows)
      })
      .catch(() => {
        if (active) setProjectProps([])
      })

    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    let active = true
    if (!projectId) {
      setAllProjectProps([])
      return () => {
        active = false
      }
    }
    window.propsAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setAllProjectProps(rows)
      })
      .catch(() => {
        if (active) setAllProjectProps([])
      })

    return () => {
      active = false
    }
  }, [projectId])

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
  }, [seriesId, seriesShots])

  useEffect(() => {
    let active = true
    if (!seriesId) {
      applySeriesShots([])
      return
    }
    window.shotsAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (!active) return
        applySeriesShots(rows)
      })
      .catch(() => {
        if (!active) return
        applySeriesShots([])
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
        const textOptions = getSelectableModelsByType(config, 'text').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )
        const imageOptions = getSelectableModelsByType(config, 'image').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )
        const videoOptions = getSelectableModelsByType(config, 'video').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )

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

        setVideoModelOptions(videoOptions)
        if (config.models?.video && videoOptions.some((item) => item.key === config.models.video)) {
          setSelectedVideoModelKey(config.models.video)
        } else {
          setSelectedVideoModelKey(videoOptions[0]?.key ?? '')
        }

        const imageConcurrency = Math.max(1, Math.min(20, config.concurrency?.image ?? 5))
        mediaQueueRef.current.concurrency = imageConcurrency
      })
      .catch(() => {
        setTextModelOptions([])
        setSelectedTextModelKey('')
        setImageModelOptions([])
        setSelectedImageModelKey('')
        setVideoModelOptions([])
        setSelectedVideoModelKey('')
        mediaQueueRef.current.concurrency = 5
      })
  }, [])

  const workflowSteps = useMemo<Array<{ key: WorkflowStepKey; label: string }>>(
    () => [
      { key: 'script', label: t('projectLibrary.stepScript') },
      { key: 'character', label: t('projectLibrary.stepCharacter') },
      { key: 'prop', label: t('projectLibrary.stepProp') },
      { key: 'storyboard', label: t('projectLibrary.stepStoryboard') },
      { key: 'shot', label: t('projectLibrary.stepShot') },
      { key: 'production', label: t('projectLibrary.stepProduction') },
      // { key: 'export', label: t('projectLibrary.stepExport') },
    ],
    [t],
  )
  const workflowStepOrder = useMemo<WorkflowStepKey[]>(
    () => ['script', 'character', 'prop', 'storyboard', 'shot', 'production', 'export'],
    [],
  )

  const showCharacterPanel = activeStep === 'character'
  const showPropPanel = activeStep === 'prop'
  const showScenePanel = activeStep === 'storyboard'
  const showShotPanel = activeStep === 'shot'
  const showVideoPanel = activeStep === 'production'
  const showProductionWorkspacePanel = activeStep === 'export'

  const productionTimelineClips = useMemo(
    () => seriesShots
      .slice()
      .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
      .filter((shot) => Boolean(shot.production_video))
      .map((shot) => ({
        shotId: shot.id,
        shotIndex: shot.shot_index,
        title: shot.title,
        path: shot.production_video!,
        durationSec: shot.duration_sec,
      })),
    [seriesShots],
  )
  const currentSeriesSceneIdSet = useMemo(
    () => new Set(currentSeriesSceneIds),
    [currentSeriesSceneIds],
  )
  const currentSeriesScenes = useMemo(
    () => seriesScenes.filter((scene) => currentSeriesSceneIdSet.has(scene.id)),
    [currentSeriesSceneIdSet, seriesScenes],
  )
  const visibleCharacters = useMemo(() => {
    if (showCurrentSeriesCharactersOnly) return projectCharacters
    return allProjectCharacters
  }, [allProjectCharacters, projectCharacters, showCurrentSeriesCharactersOnly])
  const visibleProps = useMemo(() => {
    if (showCurrentSeriesPropsOnly) return projectProps
    return allProjectProps
  }, [allProjectProps, projectProps, showCurrentSeriesPropsOnly])
  const visibleScenes = useMemo(() => {
    if (!showCurrentSeriesScenesOnly) return seriesScenes
    return currentSeriesScenes
  }, [currentSeriesScenes, seriesScenes, showCurrentSeriesScenesOnly])
  const workflowStepCompleted = useMemo<Record<WorkflowStepKey, boolean>>(
    () => ({
      script: scriptContent.trim().length > 0,
      character: projectCharacters.length > 0,
      prop: projectProps.length > 0,
      storyboard: currentSeriesScenes.length > 0,
      shot: seriesShots.length > 0,
      production: productionTimelineClips.length > 0,
      export: Boolean(productionAutoEditVideo || productionTimelineClips.length > 0),
    }),
    [
      productionAutoEditVideo,
      productionTimelineClips.length,
      projectCharacters.length,
      projectProps.length,
      currentSeriesScenes.length,
      scriptContent,
      seriesShots.length,
    ],
  )
  const workflowStepLabelMap = useMemo(
    () => new Map(workflowSteps.map((step) => [step.key, step.label])),
    [workflowSteps],
  )

  function canAccessStep(stepKey: WorkflowStepKey): boolean {
    if (workflowStepCompleted[stepKey]) return true
    const targetIdx = workflowStepOrder.indexOf(stepKey)
    if (targetIdx <= 0) return true
    for (let i = 0; i < targetIdx; i += 1) {
      if (!workflowStepCompleted[workflowStepOrder[i]]) return false
    }
    return true
  }

  function getStepBlockedReason(stepKey: WorkflowStepKey): string {
    const targetIdx = workflowStepOrder.indexOf(stepKey)
    if (targetIdx <= 0) return ''
    for (let i = 0; i < targetIdx; i += 1) {
      const prevStepKey = workflowStepOrder[i]
      if (workflowStepCompleted[prevStepKey]) continue
      return t('projectLibrary.stepLockedHint', {
        step: workflowStepLabelMap.get(prevStepKey) ?? '',
      })
    }
    return ''
  }

  useEffect(() => {
    const activeStepIdx = workflowStepOrder.indexOf(activeStep)
    if (activeStepIdx <= 0) return
    if (workflowStepCompleted[activeStep]) return
    const blocked = workflowStepOrder
      .slice(0, activeStepIdx)
      .some((stepKey) => !workflowStepCompleted[stepKey])
    if (!blocked) return
    const firstIncompleteIdx = workflowStepOrder.findIndex((stepKey) => !workflowStepCompleted[stepKey])
    if (firstIncompleteIdx < 0) return
    const fallbackStep = workflowStepOrder[firstIncompleteIdx]
    if (fallbackStep !== activeStep) {
      setActiveStep(fallbackStep)
    }
  }, [activeStep, workflowStepCompleted, workflowStepOrder])

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

  function normalizePropName(name: string): string {
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

  function updateTask(id: string, patch: Partial<StudioTaskItem>) {
    setTaskQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function enqueueTask(title: string, runner: () => Promise<void>, queueType: 'default' | 'media' = 'default') {
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

    const targetQueue = queueType === 'media' ? mediaQueueRef.current : queueRef.current
    void targetQueue.add(async () => {
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

  function parseJsonObject(text: string): Record<string, unknown> | null {
    const trimmed = text.trim()
    if (!trimmed) return null

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const raw = (fenced?.[1] ?? trimmed).trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end < start) return null

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    } catch {
      return null
    }
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

  function mergePropValues(base: Prop, incoming: Prop): Prop {
    return {
      ...base,
      category: base.category || incoming.category,
      description: base.description || incoming.description,
      thumbnail: base.thumbnail || incoming.thumbnail,
    }
  }

  function buildSeriesProps(params: {
    mode: 'merge' | 'replace'
    seriesProps: Prop[]
    projectProps: Prop[]
    extractedProps: Prop[]
  }): Prop[] {
    const { mode, seriesProps, projectProps, extractedProps } = params
    const next: Prop[] = []
    const nameIndex = new Map<string, number>()
    const projectByName = new Map<string, Prop>()

    for (const item of projectProps) {
      const key = normalizePropName(item.name)
      if (key && !projectByName.has(key)) projectByName.set(key, item)
    }

    function upsert(item: Prop) {
      const key = normalizePropName(item.name)
      if (!key) {
        if (!next.some((row) => row.id === item.id)) next.push(item)
        return
      }
      const hitIndex = nameIndex.get(key)
      if (hitIndex == null) {
        nameIndex.set(key, next.length)
        next.push(item)
        return
      }
      next[hitIndex] = mergePropValues(next[hitIndex], item)
    }

    if (mode === 'merge') {
      for (const item of seriesProps) {
        upsert(item)
      }
    }

    for (const item of extractedProps) {
      const key = normalizePropName(item.name)
      if (!key) continue
      const projectHit = projectByName.get(key)
      upsert(projectHit ? mergePropValues(projectHit, item) : item)
    }

    return next
  }

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

  async function handleUpdateCharacter(
    id: string,
    draft: CreateCharacterDraft,
  ) {
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

  async function extractPropsFromScript(mode: 'merge' | 'replace') {
    if (!seriesId) {
      setPropError(t('projectLibrary.emptySeries'))
      return
    }
    if (!scriptContent.trim()) {
      setPropError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setPropExtractMode(mode)
    setPropError('')
    enqueueTask(mode === 'replace' ? t('projectLibrary.propRegenerate') : t('projectLibrary.propFromDraft'), async () => {
      try {
        const result = await window.aiAPI.extractPropsFromScript({
          script: scriptContent,
          modelKey: selectedTextModelKey || undefined,
        })
        if (!result.ok) {
          setPropError(result.error)
          return
        }

        const extractedRows: Prop[] = result.props.map((item, index) => ({
          id: crypto.randomUUID(),
          project_id: projectId,
          name: item.name,
          category: item.category,
          description: item.description,
          thumbnail: null,
          created_at: Date.now() + index,
        }))

        const nextRows = buildSeriesProps({
          mode,
          seriesProps: projectProps,
          projectProps: allProjectProps,
          extractedProps: extractedRows,
        })
        await window.propsAPI.replaceBySeries({ projectId, seriesId, props: nextRows })
        setProjectProps(nextRows)
        try {
          const rows = await window.propsAPI.getByProject(projectId)
          setAllProjectProps(rows)
        } catch {
          // keep current list when refresh fails
        }
      } catch {
        setPropError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setPropExtractMode(null)
      }
    })
  }

  async function handleExtractPropsFromScript() {
    await extractPropsFromScript('merge')
  }

  async function handleRegeneratePropsFromScript() {
    const shouldReplace = window.confirm(t('projectLibrary.propRegenerateConfirm'))
    if (!shouldReplace) return
    await extractPropsFromScript('replace')
  }

  async function persistProp(nextProp: Prop) {
    await window.propsAPI.update(nextProp)
    setProjectProps((prev) => prev.map((item) => (item.id === nextProp.id ? nextProp : item)))
    setAllProjectProps((prev) => prev.map((item) => (item.id === nextProp.id ? nextProp : item)))
  }

  async function handleDeleteProp(id: string, name: string) {
    if (!seriesId) return
    setPropError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.propDeleteConfirm', {
        name: name || t('projectLibrary.propDefaultName'),
      }),
    )
    if (!shouldDelete) return

    try {
      await window.propsAPI.unlinkFromSeries({ seriesId, propId: id })
      const [seriesRows, projectRows] = await Promise.all([
        window.propsAPI.getBySeries(seriesId),
        window.propsAPI.getByProject(projectId),
      ])
      setProjectProps(seriesRows)
      setAllProjectProps(projectRows)
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddProp(draft: CreatePropDraft) {
    if (!projectId || !seriesId) return
    setPropError('')
    const normalizedName = normalizePropName(draft.name)
    const existing = normalizedName
      ? allProjectProps.find((item) => normalizePropName(item.name) === normalizedName)
      : null

    if (existing) {
      const merged = mergePropValues(existing, {
        ...existing,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        thumbnail: draft.thumbnail,
      })
      const changed = (
        merged.category !== existing.category
        || merged.description !== existing.description
        || merged.thumbnail !== existing.thumbnail
      )

      try {
        if (changed) {
          await window.propsAPI.update(merged)
          setAllProjectProps((prev) => prev.map((item) => (item.id === merged.id ? merged : item)))
        }
        await window.propsAPI.linkToSeries({
          project_id: projectId,
          series_id: seriesId,
          prop_id: existing.id,
          created_at: Date.now(),
        })
        setProjectProps((prev) => {
          const next = prev.some((item) => item.id === existing.id)
            ? prev.map((item) => (item.id === existing.id ? merged : item))
            : [...prev, merged]
          return next.sort((left, right) => left.created_at - right.created_at)
        })
        return
      } catch {
        setPropError(t('projectLibrary.saveError'))
        return
      }
    }

    const row: Prop = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: draft.name,
      category: draft.category,
      description: draft.description,
      thumbnail: draft.thumbnail,
      created_at: Date.now(),
    }

    try {
      await window.propsAPI.insert(row)
      await window.propsAPI.linkToSeries({
        project_id: projectId,
        series_id: seriesId,
        prop_id: row.id,
        created_at: Date.now(),
      })
      setProjectProps((prev) => [...prev, row].sort((left, right) => left.created_at - right.created_at))
      setAllProjectProps((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]))
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateProp(id: string, draft: CreatePropDraft) {
    const current = projectProps.find((item) => item.id === id) ?? allProjectProps.find((item) => item.id === id)
    if (!current) return
    setPropError('')
    try {
      await persistProp({
        ...current,
        ...draft,
      })
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleGeneratePropTurnaround(id: string) {
    const prop = projectProps.find((item) => item.id === id) ?? allProjectProps.find((item) => item.id === id)
    if (!prop) return

    setPropBusyId(id)
    setPropError('')
    try {
      const prompt = [
        'Prop turnaround sheet, front view, side view, back view, consistent material and shape.',
        'Clean studio lighting, white background, concept art style, high detail, no text watermark.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Prop name: ${prop.name || 'unknown'}`,
        `Category: ${prop.category || 'unknown'}`,
        `Description: ${prop.description || 'unknown'}`,
      ].join('\n')

      const result = await window.aiAPI.generateImage({
        prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        setPropError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

      await persistProp({
        ...prop,
        thumbnail: savedPath,
      })
    } catch {
      setPropError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setPropBusyId(null)
    }
  }

  function queueGeneratePropImage(id: string) {
    const prop = projectProps.find((item) => item.id === id) ?? allProjectProps.find((item) => item.id === id)
    const taskTitle = `${t('projectLibrary.propGenerateTurnaround')} · ${prop?.name || t('projectLibrary.propPanelTitle')}`
    enqueueTask(taskTitle, async () => {
      await handleGeneratePropTurnaround(id)
    }, 'media')
  }

  async function generateAllPropImages() {
    if (!projectProps.length) {
      setPropError(t('projectLibrary.propEmptyHint'))
      return
    }

    setGeneratingPropImages(true)
    setPropError('')

    let remaining = projectProps.length
    for (const prop of [...projectProps]) {
      const taskTitle = `${t('projectLibrary.propGenerateTurnaround')} · ${prop.name || t('projectLibrary.propPanelTitle')}`
      enqueueTask(taskTitle, async () => {
        try {
          await handleGeneratePropTurnaround(prop.id)
        } finally {
          remaining -= 1
          if (remaining <= 0) {
            setGeneratingPropImages(false)
          }
        }
      }, 'media')
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
        const latestShots = await window.shotsAPI.getBySeries(seriesId)
        applySeriesShots(latestShots)
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
      const [projectRows, seriesRows, latestShots] = await Promise.all([
        window.scenesAPI.getByProject(projectId),
        window.scenesAPI.getBySeries(seriesId),
        window.shotsAPI.getBySeries(seriesId),
      ])
      setSeriesScenes(projectRows.sort((left, right) => left.created_at - right.created_at))
      setCurrentSeriesSceneIds(seriesRows.map((row) => row.id))
      applySeriesShots(latestShots)
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
        'Scene turnaround sheet, three-view composition: front view, left 45-degree view, right 45-degree view.',
        'Environment-only scene. No people, no characters, no human silhouettes, no portraits, no body parts, no face close-ups.',
        'If any input mentions characters, dialogue, or actions, ignore them completely and keep only environmental design.',
        'Keep architecture, props, materials, and lighting style consistent across the three views.',
        'High quality, production-ready, no text watermark.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Scene title: ${scene.title || 'untitled'}`,
        `Location: ${scene.location || 'unknown'}`,
        `Time: ${scene.time || 'unknown'}`,
        `Mood: ${scene.mood || 'unknown'}`,
        'Output requirement: environment and set design only.',
      ].join('\n')

      const result = await window.aiAPI.generateImage({
        prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
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

  function makeShotIndex(nextShots: ShotCard[]): ShotCard[] {
    return nextShots
      .slice()
      .sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
      .map((shot, index) => ({ ...shot, shot_index: index + 1 }))
  }

  function formatShotContextLine(
    shot: ShotCard | undefined,
    sceneMap: Map<string, Scene>,
    characterMap: Map<string, Character>,
    propMap: Map<string, Prop>,
  ): string {
    if (!shot) return 'none'
    const shotScene = sceneMap.get(shot.scene_id)
    const shotCharacters = shot.character_ids
      .map((id) => characterMap.get(id)?.name)
      .filter(Boolean)
      .join(', ') || 'none'
    const shotProps = shot.prop_ids
      .map((id) => propMap.get(id)?.name)
      .filter(Boolean)
      .join(', ') || 'none'
    return [
      `#${shot.shot_index} ${shot.title || 'untitled shot'}`,
      `Scene=${shotScene?.title || 'unknown'}`,
      `Size=${shot.shot_size || 'unknown'}`,
      `Angle=${shot.camera_angle || 'unknown'}`,
      `Move=${shot.camera_move || 'unknown'}`,
      `Action=${shot.action || 'unknown'}`,
      `Characters=${shotCharacters}`,
      `Props=${shotProps}`,
    ].join(' | ')
  }

  function buildShotImagePrompt(params: {
    shot: ShotCard
    scene: Scene | undefined
    characterNames: string
    propNames: string
    previousShot: ShotCard | undefined
    nextShot: ShotCard | undefined
    sceneMap: Map<string, Scene>
    characterMap: Map<string, Character>
    propMap: Map<string, Prop>
  }): string {
    const {
      shot,
      scene,
      characterNames,
      propNames,
      previousShot,
      nextShot,
      sceneMap,
      characterMap,
      propMap,
    } = params

    return [
      'Cinematic storyboard shot keyframe, production-ready, high detail, no watermark text.',
      'Reference consistency is mandatory: preserve identity, costume, silhouette, and environment composition from reference images.',
      'If references conflict, prioritize character identity consistency first, then scene continuity.',
      'Shot continuity is mandatory: keep screen direction, eyeline, and spatial geography coherent with neighboring shots.',
      'Bridge naturally from previous shot into current shot, and leave visual room for next shot transition.',
      `Project category: ${projectCategory || 'unknown'}`,
      `Project style: ${projectGenre || 'unknown'}`,
      `Shot title: ${shot.title || 'untitled shot'}`,
      `Shot size: ${shot.shot_size || 'unknown'}`,
      `Camera angle: ${shot.camera_angle || 'unknown'}`,
      `Camera movement: ${shot.camera_move || 'unknown'}`,
      `Action: ${shot.action || 'unknown'}`,
      `Scene: ${scene?.title || 'unknown'}`,
      `Location: ${scene?.location || 'unknown'}`,
      `Time: ${scene?.time || 'unknown'}`,
      `Mood: ${scene?.mood || 'unknown'}`,
      characterNames ? `Characters in shot: ${characterNames}` : 'Characters in shot: none',
      propNames ? `Props in shot: ${propNames}` : 'Props in shot: none',
      `Previous shot context: ${formatShotContextLine(previousShot, sceneMap, characterMap, propMap)}`,
      `Next shot context: ${formatShotContextLine(nextShot, sceneMap, characterMap, propMap)}`,
    ].join('\n')
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
          production_first_frame: null,
          production_last_frame: null,
          production_video: null,
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
      const latestShots = await window.shotsAPI.getBySeries(seriesId)
      applySeriesShots(latestShots)
    } catch {
      setShotError(t('projectLibrary.saveError'))
    }
  }

  async function generateShotsFromScript(targetCount: number) {
    if (!scriptContent.trim()) {
      setShotError(t('projectLibrary.aiEditorEmpty'))
      return
    }
    if (!currentSeriesScenes.length) {
      setShotError(t('projectLibrary.shotNeedScenes'))
      return
    }

    setGeneratingShotsFromScript(true)
    setShotError('')
    const targetShotCount = Number.isFinite(targetCount)
      ? Math.max(1, Math.min(200, Math.round(targetCount)))
      : 20
    enqueueTask(t('projectLibrary.shotGenerateFromScript'), async () => {
      try {
        const result = await window.aiAPI.extractShotsFromScript({
          script: scriptContent,
          scenes: currentSeriesScenes.map((scene) => ({ id: scene.id, title: scene.title })),
          characters: projectCharacters.map((character) => ({ id: character.id, name: character.name })),
          relations: projectCharacterRelations.map((row) => ({
            source_ref: row.source_character_id,
            target_ref: row.target_character_id,
            relation_type: row.relation_type,
            strength: row.strength,
            notes: row.notes,
            evidence: row.evidence,
          })),
          props: projectProps.map((prop) => ({
            id: prop.id,
            name: prop.name,
            category: prop.category,
            description: prop.description,
          })),
          target_count: targetShotCount,
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
          prop_ids: shot.prop_refs,
          shot_index: index + 1,
          thumbnail: null,
          production_first_frame: null,
          production_last_frame: null,
          production_video: null,
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

    const sceneMap = new Map(currentSeriesScenes.map((scene) => [scene.id, scene]))
    const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))
    const propMap = new Map(projectProps.map((prop) => [prop.id, prop]))
    const shotsToGenerate = [...seriesShots].sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
    const shotOrder = new Map(shotsToGenerate.map((shot, index) => [shot.id, index]))

    async function generateShotImage(shot: ShotCard) {
      const shotOrderIndex = shotOrder.get(shot.id) ?? -1
      const previousShot = shotOrderIndex > 0 ? shotsToGenerate[shotOrderIndex - 1] : undefined
      const nextShot = shotOrderIndex >= 0 && shotOrderIndex + 1 < shotsToGenerate.length
        ? shotsToGenerate[shotOrderIndex + 1]
        : undefined
      const scene = sceneMap.get(shot.scene_id)
      const characterNames = shot.character_ids
        .map((id) => characterMap.get(id)?.name)
        .filter(Boolean)
        .join(', ')
      const propNames = shot.prop_ids
        .map((id) => propMap.get(id)?.name)
        .filter(Boolean)
        .join(', ')

      const referenceImages: string[] = []
      const sceneRef = await readThumbnailAsBase64(scene?.thumbnail ?? null)
      if (sceneRef) referenceImages.push(sceneRef)
      for (const cid of shot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }
      for (const pid of shot.prop_ids.slice(0, 3)) {
        const pref = await readThumbnailAsBase64(propMap.get(pid)?.thumbnail ?? null)
        if (pref) referenceImages.push(pref)
      }

      const prompt = buildShotImagePrompt({
        shot,
        scene,
        characterNames,
        propNames,
        previousShot,
        nextShot,
        sceneMap,
        characterMap,
        propMap,
      })

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: prompt, images: referenceImages } : prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
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
      }, 'media')
    }
  }

  async function generateSingleShotImage(id: string) {
    const shot = seriesShots.find((item) => item.id === id)

    if (!shot) return
    setGeneratingShotId(id)
    setShotError('')
    try {
      const sortedShots = [...seriesShots].sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
      const shotOrderIndex = sortedShots.findIndex((item) => item.id === shot.id)
      const previousShot = shotOrderIndex > 0 ? sortedShots[shotOrderIndex - 1] : undefined
      const nextShot = shotOrderIndex >= 0 && shotOrderIndex + 1 < sortedShots.length
        ? sortedShots[shotOrderIndex + 1]
        : undefined
      const sceneMap = new Map(currentSeriesScenes.map((scene) => [scene.id, scene]))
      const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))
      const propMap = new Map(projectProps.map((prop) => [prop.id, prop]))
      const scene = sceneMap.get(shot.scene_id)
      const characterNames = shot.character_ids
        .map((cid) => characterMap.get(cid)?.name)
        .filter(Boolean)
        .join(', ')
      const propNames = shot.prop_ids
        .map((pid) => propMap.get(pid)?.name)
        .filter(Boolean)
        .join(', ')

      const referenceImages: string[] = []
      const sceneRef = await readThumbnailAsBase64(scene?.thumbnail ?? null)
      if (sceneRef) referenceImages.push(sceneRef)
      for (const cid of shot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }
      for (const pid of shot.prop_ids.slice(0, 3)) {
        const pref = await readThumbnailAsBase64(propMap.get(pid)?.thumbnail ?? null)
        if (pref) referenceImages.push(pref)
      }

      const prompt = buildShotImagePrompt({
        shot,
        scene,
        characterNames,
        propNames,
        previousShot,
        nextShot,
        sceneMap,
        characterMap,
        propMap,
      })

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: prompt, images: referenceImages } : prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })

      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext, 'videos')
      await window.shotsAPI.update({ ...shot, thumbnail: savedPath })
      setSeriesShots((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail: savedPath } : item)))
    } catch {
      setShotError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setGeneratingShotId(null)
    }
  }

  function queueGenerateSingleShotImage(id: string) {
    const shot = seriesShots.find((item) => item.id === id)
    const taskTitle = `${t('projectLibrary.shotGenerateSingleImage')} · #${shot?.shot_index ?? '-'} ${shot?.title || t('projectLibrary.shotCardUntitled')}`
    enqueueTask(taskTitle, async () => {
      await generateSingleShotImage(id)
    }, 'media')
  }

  async function generateProductionFrame(shotId: string, kind: 'first' | 'last') {
    const shot = seriesShots.find((item) => item.id === shotId)
    if (!shot) return

    const latestShots = await window.shotsAPI.getBySeries(seriesId)
    const orderedShots = latestShots
      .slice()
      .sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
    const shotOrderIndex = orderedShots.findIndex((item) => item.id === shotId)
    const activeShot = shotOrderIndex >= 0 ? orderedShots[shotOrderIndex] : null
    if (!activeShot) return
    const previousShot = shotOrderIndex > 0 ? orderedShots[shotOrderIndex - 1] : undefined
    const nextShot = shotOrderIndex >= 0 && shotOrderIndex + 1 < orderedShots.length
      ? orderedShots[shotOrderIndex + 1]
      : undefined

    const busyKey = `${shotId}:${kind}`
    setProductionFrameBusyKey(busyKey)
    setShotError('')
    try {
      if (kind === 'first' && previousShot?.production_last_frame) {
        const linkedFirstFrame = previousShot.production_last_frame
        const updatedShot: ShotCard = {
          ...activeShot,
          production_first_frame: linkedFirstFrame,
          production_last_frame: activeShot.production_last_frame ?? null,
        }
        await window.shotsAPI.update(updatedShot)
        setSeriesShots((prev) => prev.map((item) => (item.id === shotId
          ? { ...item, production_first_frame: linkedFirstFrame }
          : item)))
        setProductionFrames((prev) => ({
          ...prev,
          [shotId]: {
            first: linkedFirstFrame,
            last: prev[shotId]?.last ?? activeShot.production_last_frame ?? null,
            video: prev[shotId]?.video ?? activeShot.production_video ?? null,
          },
        }))
        return
      }

      const sceneMap = new Map(currentSeriesScenes.map((scene) => [scene.id, scene]))
      const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))
      const propMap = new Map(projectProps.map((prop) => [prop.id, prop]))
      const scene = sceneMap.get(activeShot.scene_id)
      const characterNames = activeShot.character_ids
        .map((cid) => characterMap.get(cid)?.name)
        .filter(Boolean)
        .join(', ')
      const propNames = activeShot.prop_ids
        .map((pid) => propMap.get(pid)?.name)
        .filter(Boolean)
        .join(', ')

      const referenceImages: string[] = []
      const middleRef = await readThumbnailAsBase64(activeShot.thumbnail)
      if (middleRef) referenceImages.push(middleRef)
      const sceneRef = await readThumbnailAsBase64(scene?.thumbnail ?? null)
      if (sceneRef) referenceImages.push(sceneRef)
      for (const cid of activeShot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }
      for (const pid of activeShot.prop_ids.slice(0, 3)) {
        const pref = await readThumbnailAsBase64(propMap.get(pid)?.thumbnail ?? null)
        if (pref) referenceImages.push(pref)
      }

      if (!middleRef) {
        setShotError(t('projectLibrary.productionNeedMiddleFrame'))
        return
      }

      const prompt = [
        `Cinematic storyboard ${kind === 'first' ? 'starting' : 'ending'} keyframe, production-ready, high detail, no watermark text.`,
        `Use the first reference image as the MIDDLE frame of the same shot. Generate a ${kind === 'first' ? 'preceding' : 'following'} frame with strict continuity.`,
        'Keep identity, costume, location, composition logic, and lighting continuity.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Shot title: ${activeShot.title || 'untitled shot'}`,
        `Shot size: ${activeShot.shot_size || 'unknown'}`,
        `Camera angle: ${activeShot.camera_angle || 'unknown'}`,
        `Camera movement: ${activeShot.camera_move || 'unknown'}`,
        `Action: ${activeShot.action || 'unknown'}`,
        `Scene: ${scene?.title || 'unknown'}`,
        `Location: ${scene?.location || 'unknown'}`,
        `Time: ${scene?.time || 'unknown'}`,
        `Mood: ${scene?.mood || 'unknown'}`,
        characterNames ? `Characters in shot: ${characterNames}` : 'Characters in shot: none',
        propNames ? `Props in shot: ${propNames}` : 'Props in shot: none',
      ].join('\n')

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: prompt, images: referenceImages } : prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

      const updatedShot: ShotCard = {
        ...activeShot,
        production_first_frame: kind === 'first'
          ? savedPath
          : activeShot.production_first_frame ?? null,
        production_last_frame: kind === 'last'
          ? savedPath
          : activeShot.production_last_frame ?? null,
      }
      await window.shotsAPI.update(updatedShot)
      setSeriesShots((prev) => prev.map((item) => (item.id === shotId
        ? {
            ...item,
            production_first_frame: kind === 'first' ? savedPath : item.production_first_frame,
            production_last_frame: kind === 'last' ? savedPath : item.production_last_frame,
          }
        : item)))

      setProductionFrames((prev) => ({
        ...prev,
        [shotId]: {
          first: kind === 'first' ? savedPath : prev[shotId]?.first ?? null,
          last: kind === 'last' ? savedPath : prev[shotId]?.last ?? null,
          video: prev[shotId]?.video ?? null,
        },
      }))

      if (kind === 'last' && nextShot) {
        const linkedNextShot: ShotCard = {
          ...nextShot,
          production_first_frame: savedPath,
          production_last_frame: nextShot.production_last_frame ?? null,
        }
        await window.shotsAPI.update(linkedNextShot)
        setSeriesShots((prev) => prev.map((item) => (item.id === nextShot.id
          ? { ...item, production_first_frame: savedPath }
          : item)))
        setProductionFrames((prev) => ({
          ...prev,
          [nextShot.id]: {
            first: savedPath,
            last: prev[nextShot.id]?.last ?? nextShot.production_last_frame ?? null,
            video: prev[nextShot.id]?.video ?? nextShot.production_video ?? null,
          },
        }))
      }
    } catch {
      setShotError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setProductionFrameBusyKey(null)
    }
  }

  function queueGenerateProductionFrame(shotId: string, kind: 'first' | 'last') {
    const shot = seriesShots.find((item) => item.id === shotId)
    const actionLabel = kind === 'first'
      ? t('projectLibrary.productionGenerateFirstFrame')
      : t('projectLibrary.productionGenerateLastFrame')
    const taskTitle = `${actionLabel} · #${shot?.shot_index ?? '-'} ${shot?.title || t('projectLibrary.shotCardUntitled')}`
    enqueueTask(taskTitle, async () => {
      await generateProductionFrame(shotId, kind)
    }, 'media')
  }

  function queueGenerateAllFirstLastFrames() {
    if (!seriesShots.length) {
      setShotError(t('projectLibrary.shotEmpty'))
      return
    }
    const orderedShotIds = [...seriesShots]
      .sort((a, b) => a.shot_index - b.shot_index || a.created_at - b.created_at)
      .map((shot) => shot.id)
    const total = orderedShotIds.length
    const taskTitle = t('projectLibrary.productionGenerateFirstLastFrames')
    const taskId = crypto.randomUUID()

    setTaskQueue((prev) => [
      ...prev,
      {
        id: taskId,
        title: taskTitle,
        status: 'queued',
        message: t('projectLibrary.taskQueued'),
        created_at: Date.now(),
      },
    ])

    void mediaQueueRef.current.add(async () => {
      updateTask(taskId, { status: 'running', message: `${t('projectLibrary.taskRunning')} 0/${total}` })
      try {
        let completed = 0
        for (const shotId of orderedShotIds) {
          await generateProductionFrame(shotId, 'first')
          await generateProductionFrame(shotId, 'last')
          completed += 1
          updateTask(taskId, { message: `${t('projectLibrary.taskRunning')} ${completed}/${total}` })
        }
        updateTask(taskId, { status: 'success', message: `${t('projectLibrary.taskSuccess')} ${total}/${total}` })
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('projectLibrary.taskFailed')
        updateTask(taskId, { status: 'error', message: msg })
      }
    })
  }

  async function generateProductionVideo(shotId: string, params: { durationSec: number; ratio: string; mode: 'single' | 'first_last' }) {
    const shot = seriesShots.find((item) => item.id === shotId)
    if (!shot) return

    setProductionVideoBusyShotId(shotId)
    setShotError('')
    try {
      const sceneMap = new Map(currentSeriesScenes.map((scene) => [scene.id, scene]))
      const characterMap = new Map(projectCharacters.map((character) => [character.id, character]))
      const propMap = new Map(projectProps.map((prop) => [prop.id, prop]))
      const scene = sceneMap.get(shot.scene_id)
      const characterNames = shot.character_ids
        .map((cid) => characterMap.get(cid)?.name)
        .filter(Boolean)
        .join(', ')
      const propNames = shot.prop_ids
        .map((pid) => propMap.get(pid)?.name)
        .filter(Boolean)
        .join(', ')

      const pair = productionFrames[shotId]
      const referenceImages: string[] = []

      if (params.mode === 'single') {
        const middleRef = await readThumbnailAsBase64(shot.thumbnail)
        if (!middleRef) {
          setShotError(t('projectLibrary.productionNeedMiddleFrame'))
          return
        }
        referenceImages.push(middleRef)
      } else {
        const firstRef = await readThumbnailAsBase64(pair?.first ?? null)
        const lastRef = await readThumbnailAsBase64(pair?.last ?? null)
        if (!firstRef || !lastRef) {
          setShotError(t('projectLibrary.productionNeedFirstLastFrames'))
          return
        }
        referenceImages.push(firstRef, lastRef)
      }
      for (const cid of shot.character_ids.slice(0, 3)) {
        const cref = await readThumbnailAsBase64(characterMap.get(cid)?.thumbnail ?? null)
        if (cref) referenceImages.push(cref)
      }
      for (const pid of shot.prop_ids.slice(0, 3)) {
        const pref = await readThumbnailAsBase64(propMap.get(pid)?.thumbnail ?? null)
        if (pref) referenceImages.push(pref)
      }

      const prompt = [
        'Cinematic video generation for storyboard production, no watermark text.',
        params.mode === 'single'
          ? 'Generate a short coherent clip using the single reference frame as key visual anchor.'
          : 'Generate a short coherent clip transitioning from first frame to last frame with continuity.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Shot title: ${shot.title || 'untitled shot'}`,
        `Shot size: ${shot.shot_size || 'unknown'}`,
        `Camera angle: ${shot.camera_angle || 'unknown'}`,
        `Camera movement: ${shot.camera_move || 'unknown'}`,
        `Action: ${shot.action || 'unknown'}`,
        `Scene: ${scene?.title || 'unknown'}`,
        `Location: ${scene?.location || 'unknown'}`,
        `Time: ${scene?.time || 'unknown'}`,
        `Mood: ${scene?.mood || 'unknown'}`,
        characterNames ? `Characters in shot: ${characterNames}` : 'Characters in shot: none',
        propNames ? `Props in shot: ${propNames}` : 'Props in shot: none',
      ].join('\n')

      const result = await window.aiAPI.generateVideo({
        prompt: { text: prompt, images: referenceImages },
        modelKey: selectedVideoModelKey || undefined,
        options: {
          ratio: params.ratio,
          durationSec: params.durationSec,
        },
      })

      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext, 'videos')

      const updatedShot: ShotCard = {
        ...shot,
        production_video: savedPath,
      }
      await window.shotsAPI.update(updatedShot)
      setSeriesShots((prev) => prev.map((item) => (item.id === shotId ? updatedShot : item)))

      setProductionFrames((prev) => ({
        ...prev,
        [shotId]: {
          first: prev[shotId]?.first ?? null,
          last: prev[shotId]?.last ?? null,
          video: savedPath,
        },
      }))
    } finally {
      setProductionVideoBusyShotId(null)
    }
  }

  function queueGenerateProductionVideo(shotId: string, params: { durationSec: number; ratio: string; mode: 'single' | 'first_last' }) {
    const shot = seriesShots.find((item) => item.id === shotId)
    const taskTitle = `${t('projectLibrary.productionGenerateVideo')} · #${shot?.shot_index ?? '-'} ${shot?.title || t('projectLibrary.shotCardUntitled')}`
    enqueueTask(taskTitle, async () => {
      await generateProductionVideo(shotId, params)
    }, 'media')
  }

  function buildProductionVideoClips(includeTrim = true) {
    return seriesShots
      .slice()
      .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
      .filter((shot) => Boolean(shot.production_video))
      .map((shot) => {
        const base = {
          shotId: shot.id,
          title: shot.title,
          path: shot.production_video!,
        }
        if (!includeTrim) return base
        return {
          ...base,
          trimStartSec: 0,
          trimEndSec: Math.max(0.1, shot.duration_sec || 3),
        }
      })
  }

  function queueExportMergedVideo() {
    if (exportingMergedVideo) return

    const clips = buildProductionVideoClips(false)
    if (clips.length === 0) {
      setShotError(t('projectLibrary.productionNeedVideos'))
      return
    }

    setShotError('')
    setExportingMergedVideo(true)
    setProductionAutoEditVideo(null)

    enqueueTask(t('projectLibrary.productionExportMergedVideo'), async () => {
      try {
        const result = await window.mediaAPI.exportMergedVideo({
          ratio: projectRatio,
          orderedShotIds: clips.map((clip) => clip.shotId),
          clips,
        })
        if (result.canceled) return
        if (!result.outputPath) {
          throw new Error(t('projectLibrary.taskFailed'))
        }
        setProductionAutoEditVideo(result.outputPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : t('projectLibrary.taskFailed')
        setShotError(message)
        throw error
      } finally {
        setExportingMergedVideo(false)
      }
    }, 'media')
  }

  function queueExportFcpxml() {
    if (exportingTimeline) return

    const clips = buildProductionVideoClips(true)

    if (clips.length === 0) {
      setShotError(t('projectLibrary.productionNeedVideos'))
      return
    }

    setShotError('')
    setExportingTimeline(true)

    enqueueTask(t('projectLibrary.productionExportFcpxml'), async () => {
      try {
        const result = await window.mediaAPI.exportFcpxml({
          ratio: projectRatio,
          orderedShotIds: clips.map((clip) => clip.shotId),
          clips,
          projectName: `${projectName} - ${seriesTitle}`,
        })
        if (result.canceled) return
        if (!result.outputPath) {
          throw new Error(t('projectLibrary.taskFailed'))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('projectLibrary.taskFailed')
        setShotError(message)
        throw error
      } finally {
        setExportingTimeline(false)
      }
    }, 'media')
  }

  function queueExportEdl() {
    if (exportingEdl) return

    const clips = buildProductionVideoClips(true)

    if (clips.length === 0) {
      setShotError(t('projectLibrary.productionNeedVideos'))
      return
    }

    setShotError('')
    setExportingEdl(true)

    enqueueTask(t('projectLibrary.productionExportEdl'), async () => {
      try {
        const result = await window.mediaAPI.exportEdl({
          orderedShotIds: clips.map((clip) => clip.shotId),
          clips,
          projectName: `${projectName} - ${seriesTitle}`,
          fps: 30,
        })
        if (result.canceled) return
        if (!result.outputPath) {
          throw new Error(t('projectLibrary.taskFailed'))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('projectLibrary.taskFailed')
        setShotError(message)
        throw error
      } finally {
        setExportingEdl(false)
      }
    }, 'media')
  }

  function queueAutoEditVideo(prompt: string, editedClips?: EditedClipPayload[]) {
    // When editedClips are provided (from timeline editor), use them directly
    if (editedClips && editedClips.length > 0) {
      const taskTitle = t('projectLibrary.productionAutoEdit')
      setProductionAutoEditBusy(true)
      setShotError('')

      enqueueTask(taskTitle, async () => {
        try {
          const orderedShotIds = editedClips.map((clip) => clip.shotId)
          const editResult = await window.mediaAPI.autoEdit({
            ratio: projectRatio,
            orderedShotIds,
            clips: editedClips.map((clip) => ({
              shotId: clip.shotId,
              path: clip.path,
              trimStartSec: clip.trimStartSec,
              trimEndSec: clip.trimEndSec,
            })),
          })
          setProductionAutoEditVideo(editResult.outputPath)
        } catch (error) {
          const message = error instanceof Error ? error.message : t('projectLibrary.taskFailed')
          setShotError(message)
        } finally {
          setProductionAutoEditBusy(false)
        }
      }, 'media')
      return
    }

    // Fallback: derive clips from seriesShots (no trim info)
    const clips = seriesShots
      .slice()
      .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
      .filter((shot) => Boolean(shot.production_video))
      .map((shot) => ({
        shotId: shot.id,
        title: shot.title,
        action: shot.action,
        dialogue: shot.dialogue,
        durationSec: shot.duration_sec,
        path: shot.production_video!,
      }))

    if (clips.length === 0) {
      setShotError(t('projectLibrary.productionNeedVideos'))
      return
    }

    const taskTitle = t('projectLibrary.productionAutoEdit')
    setProductionAutoEditBusy(true)
    setShotError('')

    enqueueTask(taskTitle, async () => {
      try {
        let orderedShotIds = clips.map((clip) => clip.shotId)

        if (selectedTextModelKey) {
          const clipLines = clips
            .map((clip, index) => `${index + 1}. ${clip.shotId} | ${clip.title || 'untitled'} | duration=${clip.durationSec}s | action=${clip.action || '-'} | dialogue=${clip.dialogue || '-'}`)
            .join('\n')
          const aiContext = [
            'You are an editing planner. Return JSON only.',
            `User intent: ${prompt || 'Generate the most coherent story cut.'}`,
            `Ratio: ${projectRatio}`,
            'Available clips:',
            clipLines,
          ].join('\n')
          const instruction = 'Return ONLY one JSON object: {"orderedShotIds": string[]}. Keep IDs from the provided list only. Keep between 1 and 20 clips.'

          const result = await window.aiAPI.scriptToolkit({
            action: 'scene.rewrite',
            context: aiContext,
            instruction,
            modelKey: selectedTextModelKey,
          })

          if (result.ok) {
            const parsed = parseJsonObject(result.text)
            const candidateIds = Array.isArray(parsed?.orderedShotIds)
              ? parsed?.orderedShotIds.filter((item): item is string => typeof item === 'string')
              : []
            if (candidateIds.length > 0) {
              const valid = new Set(clips.map((clip) => clip.shotId))
              orderedShotIds = candidateIds.filter((id) => valid.has(id))
              if (orderedShotIds.length === 0) {
                orderedShotIds = clips.map((clip) => clip.shotId)
              }
            }
          }
        }

        const editResult = await window.mediaAPI.autoEdit({
          ratio: projectRatio,
          orderedShotIds,
          clips: clips.map((clip) => ({ shotId: clip.shotId, path: clip.path })),
        })

        setProductionAutoEditVideo(editResult.outputPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : t('projectLibrary.taskFailed')
        setShotError(message)
      } finally {
        setProductionAutoEditBusy(false)
      }
    }, 'media')
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
    mediaQueueRef.current.clear()
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

          <div className="absolute right-4 hidden xl:flex items-center gap-2">
            <label className="input input-sm input-bordered flex items-center gap-2 w-56">
              <ScrollText size={12} className="text-base-content/60" />
              <select
                className="w-full bg-transparent outline-none"
                value={selectedTextModelKey}
                onChange={(event) => setSelectedTextModelKey(event.target.value)}
              >
                {textModelOptions.length === 0 ? (
                  <option value="">{t('projectLibrary.aiModelEmpty')}</option>
                ) : (
                  textModelOptions.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="input input-sm input-bordered flex items-center gap-2 w-56">
              <Sparkles size={12} className="text-base-content/60" />
              <select
                className="w-full bg-transparent outline-none"
                value={selectedImageModelKey}
                onChange={(event) => setSelectedImageModelKey(event.target.value)}
              >
                {imageModelOptions.length === 0 ? (
                  <option value="">{t('projectLibrary.characterModelEmpty')}</option>
                ) : (
                  imageModelOptions.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto px-2">
            {workflowSteps.map((step) => {
              const isActive = activeStep === step.key
              const canOpen = canAccessStep(step.key)
              const isCompleted = workflowStepCompleted[step.key]
              const blockedReason = canOpen ? '' : getStepBlockedReason(step.key)
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  disabled={!canOpen}
                  title={blockedReason || undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border shrink-0 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : canOpen
                        ? 'border-base-300 hover:border-primary/30 text-base-content/70'
                        : 'border-base-300 text-base-content/40 cursor-not-allowed opacity-70'
                  }`}
                >
                  <CheckCircle2
                    size={12}
                    className={
                      isCompleted
                        ? 'text-success'
                        : isActive
                          ? 'text-primary'
                          : canOpen
                            ? 'text-base-content/50'
                            : 'text-base-content/35'
                    }
                  />
                  {step.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 min-h-0">
        {characterError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{characterError}</div> : null}
        {relationError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{relationError}</div> : null}
        {propError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{propError}</div> : null}
        {sceneError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{sceneError}</div> : null}
        {shotError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{shotError}</div> : null}
        {showCharacterPanel ? (
          <CharacterPanel
            characters={visibleCharacters}
            extractingFromDraft={extractMode === 'merge'}
            extractingRegenerate={extractMode === 'replace'}
            characterBusyId={characterBusyId}
            currentSeriesOnly={showCurrentSeriesCharactersOnly}
            onToggleCurrentSeriesOnly={setShowCurrentSeriesCharactersOnly}
            onAddCharacter={(draft) => void handleAddCharacter(draft)}
            onUpdateCharacter={(id, draft) => void handleUpdateCharacter(id, draft)}
            onSmartGenerateCharacter={handleSmartGenerateCharacter}
            onExtractFromScript={() => void handleExtractCharactersFromScript()}
            onRegenerateFromScript={() => void handleRegenerateCharactersFromScript()}
            onDeleteCharacter={(id, name) => void handleDeleteCharacter(id, name)}
            onGenerateTurnaround={(id) => queueGenerateCharacterImage(id)}
            onGenerateAllImages={() => void generateAllCharacterImages()}
            generatingAllImages={generatingCharacterImages}
          />
        ) : showPropPanel ? (
          <PropPanel
            props={visibleProps}
            extractingFromScript={propExtractMode === 'merge'}
            extractingRegenerate={propExtractMode === 'replace'}
            propBusyId={propBusyId}
            showAdvancedActions
            currentSeriesOnly={showCurrentSeriesPropsOnly}
            onToggleCurrentSeriesOnly={setShowCurrentSeriesPropsOnly}
            onAddProp={(draft) => void handleAddProp(draft)}
            onUpdateProp={(id, draft) => void handleUpdateProp(id, draft)}
            onDeleteProp={(id, name) => void handleDeleteProp(id, name)}
            onExtractFromScript={() => void handleExtractPropsFromScript()}
            onRegenerateFromScript={() => void handleRegeneratePropsFromScript()}
            onGenerateTurnaround={(id) => queueGeneratePropImage(id)}
            onGenerateAllImages={() => void generateAllPropImages()}
            generatingAllImages={generatingPropImages}
          />
        ) : showScenePanel ? (
          <ScenePanel
            scenes={visibleScenes}
            projectRatio={projectRatio}
            extractingFromScript={sceneExtractMode === 'merge'}
            extractingRegenerate={sceneExtractMode === 'replace'}
            sceneBusyId={sceneBusyId}
            currentSeriesOnly={showCurrentSeriesScenesOnly}
            onToggleCurrentSeriesOnly={setShowCurrentSeriesScenesOnly}
            onAddScene={(draft) => void handleAddScene(draft)}
            onUpdateScene={(id, draft) => void handleUpdateScene(id, draft)}
            onSmartGenerateScene={handleSmartGenerateScene}
            onExtractFromScript={() => void handleExtractScenesFromScript()}
            onRegenerateFromScript={() => void handleRegenerateScenesFromScript()}
            onDeleteScene={(id, title) => void handleDeleteScene(id, title)}
            onGenerateSceneImage={(id) => queueGenerateSceneImage(id)}
            onGenerateAllImages={() => void generateAllSceneImages()}
            generatingAllImages={generatingSceneImages}
          />
        ) : showShotPanel ? (
          <ShotPanel
            shots={seriesShots}
            scenes={currentSeriesScenes.map((scene) => ({ id: scene.id, title: scene.title }))}
            characters={projectCharacters.map((character) => ({ id: character.id, name: character.name }))}
            props={projectProps.map((prop) => ({ id: prop.id, name: prop.name }))}
            generatingFromScript={generatingShotsFromScript}
            generatingAllImages={generatingShotImages}
            generatingShotId={generatingShotId}
            onAddShot={addShot}
            onUpdateShot={updateShot}
            onDeleteShot={deleteShot}
            onGenerateFromScript={(targetCount) => void generateShotsFromScript(targetCount)}
            onGenerateAllImages={() => void generateAllShotImages()}
            onGenerateSingleImage={(id) => queueGenerateSingleShotImage(id)}
          />
        ) : showVideoPanel ? (
          <VideoPanel
            shots={seriesShots}
            scenes={currentSeriesScenes.map((scene) => ({ id: scene.id, title: scene.title }))}
            characters={projectCharacters.map((character) => ({ id: character.id, name: character.name }))}
            projectRatio={projectRatio}
            videoModelOptions={videoModelOptions}
            selectedVideoModelKey={selectedVideoModelKey}
            onVideoModelChange={setSelectedVideoModelKey}
            framesByShot={productionFrames}
            frameBusyKey={productionFrameBusyKey}
            videoBusyShotId={productionVideoBusyShotId}
            exportingMergedVideo={exportingMergedVideo}
            exportingTimeline={exportingTimeline}
            exportingEdl={exportingEdl}
            onGenerateFrame={(shotId, kind) => queueGenerateProductionFrame(shotId, kind)}
            onGenerateAllFirstLastFrames={queueGenerateAllFirstLastFrames}
            onExportMergedVideo={queueExportMergedVideo}
            onExportFcpxml={queueExportFcpxml}
            onExportEdl={queueExportEdl}
            onGenerateVideo={(shotId, params) => queueGenerateProductionVideo(shotId, params)}
          />
        ) : showProductionWorkspacePanel ? (
          <ProductionWorkspacePanel
            clips={productionTimelineClips}
            autoEditBusy={productionAutoEditBusy}
            masterVideoPath={productionAutoEditVideo}
            onAutoEdit={(prompt, editedClips) => queueAutoEditVideo(prompt, editedClips)}
          />
        ) : (
          <ScriptEditor
            content={scriptContent}
            selectedTextModelKey={selectedTextModelKey}
            generatingRelationsFromScript={optimizingRelations}
            onGenerateRelationsFromScript={queueOptimizeRelationsFromCurrentScript}
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
