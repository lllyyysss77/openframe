import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import type { Character } from '../../db/characters_collection'
import type { CharacterRelation } from '../../db/character_relations_collection'
import type { Prop } from '../../db/props_collection'
import type { Scene, ShotCard, ShotDraft, EditedClipPayload } from './types'
import {
  renderPromptTemplate,
  type PromptOverrides,
} from '../../utils/prompt_overrides'

type EnqueueTask = (
  title: string,
  runner: () => Promise<void>,
  queueType?: 'default' | 'media',
) => void

type Params = {
  t: TFunction
  seriesId: string
  scriptContent: string
  projectRatio: '16:9' | '9:16'
  projectCategory: string
  projectGenre: string
  projectName: string
  seriesTitle: string
  selectedTextModelKey: string
  selectedImageModelKey: string
  selectedVideoModelKey: string
  videoModelOptions: Array<{ key: string; label: string }>
  onVideoModelChange: (value: string) => void
  currentSeriesScenes: Scene[]
  projectCharacters: Character[]
  projectCharacterRelations: CharacterRelation[]
  projectProps: Prop[]
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

export function useShotProductionStudioLogic(params: Params) {
  const {
    t,
    seriesId,
    scriptContent,
    projectRatio,
    projectCategory,
    projectGenre,
    projectName,
    seriesTitle,
    selectedTextModelKey,
    selectedImageModelKey,
    selectedVideoModelKey,
    videoModelOptions,
    onVideoModelChange,
    currentSeriesScenes,
    projectCharacters,
    projectCharacterRelations,
    projectProps,
    promptOverrides,
    enqueueTask,
  } = params

  const [shotError, setShotError] = useState('')
  const [seriesShots, setSeriesShots] = useState<ShotCard[]>([])
  const [generatingShotsFromScript, setGeneratingShotsFromScript] = useState(false)
  const [generatingShotImages, setGeneratingShotImages] = useState(false)
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null)
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

  const refreshShotsBySeries = useCallback(async () => {
    if (!seriesId) {
      applySeriesShots([])
      return
    }
    try {
      const rows = await window.shotsAPI.getBySeries(seriesId)
      applySeriesShots(rows)
    } catch {
      applySeriesShots([])
    }
  }, [seriesId])

  useEffect(() => {
    void refreshShotsBySeries()
  }, [refreshShotsBySeries])

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
      await refreshShotsBySeries()
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

      const prompt = renderPromptTemplate(promptOverrides.shotImage, {
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        shotTitle: shot.title || 'untitled shot',
        shotSize: shot.shot_size || 'unknown',
        cameraAngle: shot.camera_angle || 'unknown',
        cameraMove: shot.camera_move || 'unknown',
        action: shot.action || 'unknown',
        sceneTitle: scene?.title || 'unknown',
        location: scene?.location || 'unknown',
        time: scene?.time || 'unknown',
        mood: scene?.mood || 'unknown',
        characters: characterNames || 'none',
        props: propNames || 'none',
        previousShotContext: formatShotContextLine(previousShot, sceneMap, characterMap, propMap),
        nextShotContext: formatShotContextLine(nextShot, sceneMap, characterMap, propMap),
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

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

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

      const prompt = renderPromptTemplate(promptOverrides.shotImage, {
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        shotTitle: shot.title || 'untitled shot',
        shotSize: shot.shot_size || 'unknown',
        cameraAngle: shot.camera_angle || 'unknown',
        cameraMove: shot.camera_move || 'unknown',
        action: shot.action || 'unknown',
        sceneTitle: scene?.title || 'unknown',
        location: scene?.location || 'unknown',
        time: scene?.time || 'unknown',
        mood: scene?.mood || 'unknown',
        characters: characterNames || 'none',
        props: propNames || 'none',
        previousShotContext: formatShotContextLine(previousShot, sceneMap, characterMap, propMap),
        nextShotContext: formatShotContextLine(nextShot, sceneMap, characterMap, propMap),
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

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
          'videos',
        )
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

      const prompt = renderPromptTemplate(promptOverrides.productionFrame, {
        frameKind: kind === 'first' ? 'starting' : 'ending',
        direction: kind === 'first' ? 'preceding' : 'following',
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        shotTitle: activeShot.title || 'untitled shot',
        shotSize: activeShot.shot_size || 'unknown',
        cameraAngle: activeShot.camera_angle || 'unknown',
        cameraMove: activeShot.camera_move || 'unknown',
        action: activeShot.action || 'unknown',
        sceneTitle: scene?.title || 'unknown',
        location: scene?.location || 'unknown',
        time: scene?.time || 'unknown',
        mood: scene?.mood || 'unknown',
        characters: characterNames || 'none',
        props: propNames || 'none',
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

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

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

    enqueueTask(t('projectLibrary.productionGenerateFirstLastFrames'), async () => {
      for (const shotId of orderedShotIds) {
        await generateProductionFrame(shotId, 'first')
        await generateProductionFrame(shotId, 'last')
      }
    }, 'media')
  }

  async function generateProductionVideo(shotId: string, opts: { durationSec: number; ratio: string; mode: 'single' | 'first_last' }) {
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

      if (opts.mode === 'single') {
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

      const prompt = renderPromptTemplate(promptOverrides.productionVideo, {
        modeHint: opts.mode === 'single'
          ? 'Generate a short coherent clip using the single reference frame as key visual anchor.'
          : 'Generate a short coherent clip transitioning from first frame to last frame with continuity.',
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        shotTitle: shot.title || 'untitled shot',
        shotSize: shot.shot_size || 'unknown',
        cameraAngle: shot.camera_angle || 'unknown',
        cameraMove: shot.camera_move || 'unknown',
        action: shot.action || 'unknown',
        sceneTitle: scene?.title || 'unknown',
        location: scene?.location || 'unknown',
        time: scene?.time || 'unknown',
        mood: scene?.mood || 'unknown',
        characters: characterNames || 'none',
        props: propNames || 'none',
      })

      const result = await window.aiAPI.generateVideo({
        prompt: { text: prompt, images: referenceImages },
        modelKey: selectedVideoModelKey || undefined,
        options: {
          ratio: opts.ratio,
          durationSec: opts.durationSec,
        },
      })

      if (!result.ok) {
        setShotError(result.error)
        return
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
          'videos',
        )

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

  function queueGenerateProductionVideo(shotId: string, opts: { durationSec: number; ratio: string; mode: 'single' | 'first_last' }) {
    const shot = seriesShots.find((item) => item.id === shotId)
    const taskTitle = `${t('projectLibrary.productionGenerateVideo')} · #${shot?.shot_index ?? '-'} ${shot?.title || t('projectLibrary.shotCardUntitled')}`
    enqueueTask(taskTitle, async () => {
      await generateProductionVideo(shotId, opts)
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

  const shotSceneOptions = useMemo(
    () => currentSeriesScenes.map((scene) => ({ id: scene.id, title: scene.title })),
    [currentSeriesScenes],
  )
  const shotCharacterOptions = useMemo(
    () => projectCharacters.map((character) => ({ id: character.id, name: character.name })),
    [projectCharacters],
  )
  const shotPropOptions = useMemo(
    () => projectProps.map((prop) => ({ id: prop.id, name: prop.name })),
    [projectProps],
  )

  const shotPanelProps = {
    shots: seriesShots,
    scenes: shotSceneOptions,
    characters: shotCharacterOptions,
    props: shotPropOptions,
    generatingFromScript: generatingShotsFromScript,
    generatingAllImages: generatingShotImages,
    generatingShotId,
    onAddShot: addShot,
    onUpdateShot: updateShot,
    onDeleteShot: deleteShot,
    onGenerateFromScript: (targetCount: number) => {
      void generateShotsFromScript(targetCount)
    },
    onGenerateAllImages: () => {
      void generateAllShotImages()
    },
    onGenerateSingleImage: (id: string) => {
      queueGenerateSingleShotImage(id)
    },
  }

  const videoPanelProps = {
    shots: seriesShots,
    scenes: shotSceneOptions,
    characters: shotCharacterOptions,
    projectRatio,
    videoModelOptions,
    selectedVideoModelKey,
    onVideoModelChange,
    framesByShot: productionFrames,
    frameBusyKey: productionFrameBusyKey,
    videoBusyShotId: productionVideoBusyShotId,
    exportingMergedVideo,
    exportingTimeline,
    exportingEdl,
    onGenerateFrame: (shotId: string, kind: 'first' | 'last') => {
      queueGenerateProductionFrame(shotId, kind)
    },
    onGenerateAllFirstLastFrames: queueGenerateAllFirstLastFrames,
    onExportMergedVideo: queueExportMergedVideo,
    onExportFcpxml: queueExportFcpxml,
    onExportEdl: queueExportEdl,
    onGenerateVideo: (shotId: string, params: { durationSec: number; ratio: string; mode: 'single' | 'first_last' }) => {
      queueGenerateProductionVideo(shotId, params)
    },
  }

  const productionWorkspacePanelProps = {
    clips: productionTimelineClips,
    autoEditBusy: productionAutoEditBusy,
    masterVideoPath: productionAutoEditVideo,
    onAutoEdit: (prompt: string, editedClips: EditedClipPayload[]) => {
      queueAutoEditVideo(prompt, editedClips)
    },
  }

  return {
    shotError,
    setShotError,
    seriesShots,
    generatingShotsFromScript,
    generatingShotImages,
    generatingShotId,
    productionFrames,
    productionFrameBusyKey,
    productionVideoBusyShotId,
    productionAutoEditBusy,
    productionAutoEditVideo,
    exportingMergedVideo,
    exportingTimeline,
    exportingEdl,
    productionTimelineClips,
    refreshShotsBySeries,
    addShot,
    updateShot,
    deleteShot,
    generateShotsFromScript,
    generateAllShotImages,
    queueGenerateSingleShotImage,
    queueGenerateProductionFrame,
    queueGenerateAllFirstLastFrames,
    queueGenerateProductionVideo,
    queueExportMergedVideo,
    queueExportFcpxml,
    queueExportEdl,
    queueAutoEditVideo,
    shotPanelProps,
    videoPanelProps,
    productionWorkspacePanelProps,
  }
}
