import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { buildCostumeSwapPrompt, buildCostumeSwapSuffix } from '@openframe/prompts'
import type { Costume } from '../../db/costumes_collection'
import type { CreateCostumeDraft } from './types'
import { type PromptOverrides } from '../../utils/prompt_overrides'
import { readImageReferenceAsDataUrl } from '../../utils/image_reference'

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
  projectCharacters: Array<{ id: string; name: string; thumbnail?: string | null }>
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((id) => set.has(id))
}

function shortError(err: unknown): string {
  if (err instanceof Error) {
    const msg = (err.message || '').trim()
    if (msg) return msg.split('\n')[0]
  }
  const raw = String(err || '').trim()
  if (!raw || raw === '[object Object]') return ''
  return raw.split('\n')[0]
}

function normalizeCostumeDraft(draft: CreateCostumeDraft): CreateCostumeDraft {
  return {
    name: (draft.name || '').trim(),
    category: (draft.category || '').trim(),
    description: (draft.description || '').trim(),
    character_ids: normalizeIds(Array.isArray(draft.character_ids) ? draft.character_ids : []),
    thumbnail: typeof draft.thumbnail === 'string' ? draft.thumbnail : null,
  }
}

async function collectCharacterReferenceImages(args: {
  characterIds: string[]
  characterMap: Map<string, { name: string; thumbnail: string | null }>
}): Promise<{ images: string[]; hasAnyCharacterImage: boolean }> {
  const images: string[] = []
  let hasAnyCharacterImage = false

  for (const characterId of normalizeIds(args.characterIds).slice(0, 3)) {
    const thumbnail = args.characterMap.get(characterId)?.thumbnail ?? null
    if (!thumbnail) continue
    hasAnyCharacterImage = true

    const parsedRef = await readImageReferenceAsDataUrl(thumbnail)
    if (parsedRef) {
      images.push(parsedRef)
    }
  }

  return {
    images: normalizeIds(images),
    hasAnyCharacterImage,
  }
}

function mergeCostumeValues(base: Costume, incoming: Costume): Costume {
  return {
    ...base,
    category: base.category || incoming.category,
    description: base.description || incoming.description,
    character_ids: normalizeIds([
      ...base.character_ids,
      ...incoming.character_ids,
    ]),
    thumbnail: base.thumbnail || incoming.thumbnail,
  }
}

function buildSeriesCostumes(params: {
  mode: 'merge' | 'replace'
  seriesCostumes: Costume[]
  projectCostumes: Costume[]
  extractedCostumes: Costume[]
}): Costume[] {
  const { mode, seriesCostumes, projectCostumes, extractedCostumes } = params
  const next: Costume[] = []
  const nameIndex = new Map<string, number>()
  const projectByName = new Map<string, Costume>()

  for (const item of projectCostumes) {
    const key = normalizeName(item.name)
    if (key && !projectByName.has(key)) projectByName.set(key, item)
  }

  function upsert(item: Costume) {
    const key = normalizeName(item.name)
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
    next[hitIndex] = mergeCostumeValues(next[hitIndex], item)
  }

  if (mode === 'merge') {
    for (const item of seriesCostumes) {
      upsert(item)
    }
  }

  for (const item of extractedCostumes) {
    const key = normalizeName(item.name)
    if (!key) continue
    const projectHit = projectByName.get(key)
    upsert(projectHit ? mergeCostumeValues(projectHit, item) : item)
  }

  return next
}

export function useCostumeStudioLogic(params: Params) {
  const {
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    projectRatio,
    projectCharacters,
    selectedTextModelKey,
    selectedImageModelKey,
    enqueueTask,
  } = params

  const [costumeExtractMode, setCostumeExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [costumeBusyId, setCostumeBusyId] = useState<string | null>(null)
  const [costumeError, setCostumeError] = useState('')
  const [projectCostumes, setProjectCostumes] = useState<Costume[]>([])
  const [allProjectCostumes, setAllProjectCostumes] = useState<Costume[]>([])
  const [showCurrentSeriesCostumesOnly, setShowCurrentSeriesCostumesOnly] = useState(true)
  const [generatingCostumeImages, setGeneratingCostumeImages] = useState(false)

  const characterMap = useMemo(() => {
    const map = new Map<string, { name: string; thumbnail: string | null }>()
    for (const character of projectCharacters) {
      map.set(character.id, {
        name: character.name,
        thumbnail: character.thumbnail ?? null,
      })
    }
    return map
  }, [projectCharacters])

  useEffect(() => {
    let active = true
    if (!seriesId) {
      setProjectCostumes([])
      return () => {
        active = false
      }
    }
    window.costumesAPI
      .getBySeries(seriesId)
      .then((rows) => {
        if (active) setProjectCostumes(rows)
      })
      .catch(() => {
        if (active) setProjectCostumes([])
      })

    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    let active = true
    if (!projectId) {
      setAllProjectCostumes([])
      return () => {
        active = false
      }
    }
    window.costumesAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setAllProjectCostumes(rows)
      })
      .catch(() => {
        if (active) setAllProjectCostumes([])
      })

    return () => {
      active = false
    }
  }, [projectId])

  const visibleCostumes = useMemo(() => {
    if (showCurrentSeriesCostumesOnly) return projectCostumes
    return allProjectCostumes
  }, [allProjectCostumes, projectCostumes, showCurrentSeriesCostumesOnly])

  async function extractCostumesFromScript(mode: 'merge' | 'replace') {
    if (!seriesId) {
      setCostumeError(t('projectLibrary.emptySeries'))
      return
    }
    if (!scriptContent.trim()) {
      setCostumeError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setCostumeExtractMode(mode)
    setCostumeError('')
    enqueueTask(mode === 'replace' ? t('projectLibrary.costumeRegenerate') : t('projectLibrary.costumeFromDraft'), async () => {
      try {
        const result = await window.aiAPI.extractPropsFromScript({
          script: scriptContent,
          modelKey: selectedTextModelKey || undefined,
        })
        if (!result.ok) {
          setCostumeError(result.error)
          return
        }

        const extractedRows: Costume[] = result.props.map((item, index) => ({
          id: crypto.randomUUID(),
          project_id: projectId,
          name: item.name,
          category: item.category,
          description: item.description,
          character_ids: [],
          thumbnail: null,
          created_at: Date.now() + index,
        }))

        const nextRows = buildSeriesCostumes({
          mode,
          seriesCostumes: projectCostumes,
          projectCostumes: allProjectCostumes,
          extractedCostumes: extractedRows,
        })
        await window.costumesAPI.replaceBySeries({ projectId, seriesId, costumes: nextRows })
        setProjectCostumes(nextRows)
        try {
          const rows = await window.costumesAPI.getByProject(projectId)
          setAllProjectCostumes(rows)
        } catch {
          // keep current list when refresh fails
        }
      } catch {
        setCostumeError(t('projectLibrary.aiToolkitFailed'))
      } finally {
        setCostumeExtractMode(null)
      }
    })
  }

  async function handleExtractCostumesFromScript() {
    await extractCostumesFromScript('merge')
  }

  async function handleRegenerateCostumesFromScript() {
    const shouldReplace = window.confirm(t('projectLibrary.costumeRegenerateConfirm'))
    if (!shouldReplace) return
    await extractCostumesFromScript('replace')
  }

  async function persistCostume(nextCostume: Costume) {
    const normalized = {
      ...nextCostume,
      character_ids: normalizeIds(nextCostume.character_ids),
    }
    await window.costumesAPI.update(normalized)
    setProjectCostumes((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)))
    setAllProjectCostumes((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)))
  }

  async function handleDeleteCostume(id: string, name: string) {
    if (!seriesId) return
    setCostumeError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.costumeDeleteConfirm', {
        name: name || t('projectLibrary.costumeDefaultName'),
      }),
    )
    if (!shouldDelete) return

    try {
      await window.costumesAPI.unlinkFromSeries({ seriesId, costumeId: id })
      const [seriesRows, projectRows] = await Promise.all([
        window.costumesAPI.getBySeries(seriesId),
        window.costumesAPI.getByProject(projectId),
      ])
      setProjectCostumes(seriesRows)
      setAllProjectCostumes(projectRows)
    } catch {
      setCostumeError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddCostume(draft: CreateCostumeDraft) {
    if (!projectId || !seriesId) return
    setCostumeError('')
    const nextDraft = normalizeCostumeDraft(draft)
    const normalizedName = normalizeName(nextDraft.name)
    const existing = normalizedName
      ? allProjectCostumes.find((item) => normalizeName(item.name) === normalizedName)
      : null

    if (existing) {
      const merged = mergeCostumeValues(existing, {
        ...existing,
        name: nextDraft.name,
        category: nextDraft.category,
        description: nextDraft.description,
        character_ids: nextDraft.character_ids,
        thumbnail: nextDraft.thumbnail,
      })
      const changed = (
        merged.category !== existing.category
        || merged.description !== existing.description
        || !sameIds(merged.character_ids, existing.character_ids)
        || merged.thumbnail !== existing.thumbnail
      )

      try {
        if (changed) {
          await window.costumesAPI.update(merged)
          setAllProjectCostumes((prev) => prev.map((item) => (item.id === merged.id ? merged : item)))
        }
        await window.costumesAPI.linkToSeries({
          project_id: projectId,
          series_id: seriesId,
          costume_id: existing.id,
          created_at: Date.now(),
        })
        setProjectCostumes((prev) => {
          const next = prev.some((item) => item.id === existing.id)
            ? prev.map((item) => (item.id === existing.id ? merged : item))
            : [...prev, merged]
          return next.sort((left, right) => left.created_at - right.created_at)
        })
        return
      } catch (err) {
        setCostumeError(shortError(err) || t('projectLibrary.saveError'))
        return
      }
    }

    const row: Costume = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: nextDraft.name,
      category: nextDraft.category,
      description: nextDraft.description,
      character_ids: nextDraft.character_ids,
      thumbnail: nextDraft.thumbnail,
      created_at: Date.now(),
    }

    try {
      await window.costumesAPI.insert(row)
      await window.costumesAPI.linkToSeries({
        project_id: projectId,
        series_id: seriesId,
        costume_id: row.id,
        created_at: Date.now(),
      })
      setProjectCostumes((prev) => [...prev, row].sort((left, right) => left.created_at - right.created_at))
      setAllProjectCostumes((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]))
    } catch (err) {
      setCostumeError(shortError(err) || t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateCostume(id: string, draft: CreateCostumeDraft) {
    const current = projectCostumes.find((item) => item.id === id) ?? allProjectCostumes.find((item) => item.id === id)
    if (!current) return
    setCostumeError('')
    const nextDraft = normalizeCostumeDraft(draft)
    try {
      await persistCostume({
        ...current,
        ...nextDraft,
      })
    } catch (err) {
      setCostumeError(shortError(err) || t('projectLibrary.saveError'))
    }
  }

  async function handleSmartGenerateCostume(
    draft: CreateCostumeDraft,
  ): Promise<{ ok: true; draft: CreateCostumeDraft } | { ok: false; error: string }> {
    if (!draft.name.trim()) {
      return { ok: false, error: t('projectLibrary.costumeNameRequired') }
    }

    const linkedCharacters = normalizeIds(draft.character_ids)
      .map((characterId) => characterMap.get(characterId)?.name)
      .filter(Boolean)
      .join(', ')
    const { images: referenceImages, hasAnyCharacterImage } = await collectCharacterReferenceImages({
      characterIds: draft.character_ids,
      characterMap,
    })
    if (!hasAnyCharacterImage) {
      return { ok: false, error: t('projectLibrary.costumeNeedCharacterImage') }
    }
    const prompt = buildCostumeSwapPrompt({
      projectCategory: projectCategory || 'unknown',
      projectStyle: projectGenre || 'unknown',
      costumeName: draft.name || 'unknown',
      category: draft.category || 'unknown',
      description: draft.description || 'unknown',
      linkedCharacters,
    })
    const finalPrompt = `${prompt}\n\n${buildCostumeSwapSuffix(projectGenre || 'unknown')}`

    try {
      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: finalPrompt, images: referenceImages } : finalPrompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

      return {
        ok: true,
        draft: {
          ...draft,
          thumbnail: savedPath,
        },
      }
    } catch {
      return { ok: false, error: t('projectLibrary.aiToolkitFailed') }
    }
  }

  async function handleGenerateCostumeTurnaround(id: string) {
    const costume = projectCostumes.find((item) => item.id === id) ?? allProjectCostumes.find((item) => item.id === id)
    if (!costume) return

    setCostumeBusyId(id)
    setCostumeError('')
    try {
      const linkedCharacters = normalizeIds(costume.character_ids)
        .map((characterId) => characterMap.get(characterId)?.name)
        .filter(Boolean)
        .join(', ')
      const { images: referenceImages, hasAnyCharacterImage } = await collectCharacterReferenceImages({
        characterIds: costume.character_ids,
        characterMap,
      })
      if (!hasAnyCharacterImage) {
        setCostumeError(t('projectLibrary.costumeNeedCharacterImage'))
        return
      }
      const prompt = buildCostumeSwapPrompt({
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        costumeName: costume.name || 'unknown',
        category: costume.category || 'unknown',
        description: costume.description || 'unknown',
        linkedCharacters,
      })
      const finalPrompt = `${prompt}\n\n${buildCostumeSwapSuffix(projectGenre || 'unknown')}`

      const result = await window.aiAPI.generateImage({
        prompt: referenceImages.length > 0 ? { text: finalPrompt, images: referenceImages } : finalPrompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        setCostumeError(result.error)
        return
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

      await persistCostume({
        ...costume,
        thumbnail: savedPath,
      })
    } catch {
      setCostumeError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setCostumeBusyId(null)
    }
  }

  function queueGenerateCostumeImage(id: string) {
    const costume = projectCostumes.find((item) => item.id === id) ?? allProjectCostumes.find((item) => item.id === id)
    const taskTitle = `${t('projectLibrary.costumeGenerateTurnaround')} · ${costume?.name || t('projectLibrary.costumePanelTitle')}`
    enqueueTask(taskTitle, async () => {
      await handleGenerateCostumeTurnaround(id)
    }, 'media')
  }

  async function generateAllCostumeImages() {
    if (!projectCostumes.length) {
      setCostumeError(t('projectLibrary.costumeEmptyHint'))
      return
    }

    setGeneratingCostumeImages(true)
    setCostumeError('')

    let remaining = projectCostumes.length
    for (const costume of [...projectCostumes]) {
      const taskTitle = `${t('projectLibrary.costumeGenerateTurnaround')} · ${costume.name || t('projectLibrary.costumePanelTitle')}`
      enqueueTask(taskTitle, async () => {
        try {
          await handleGenerateCostumeTurnaround(costume.id)
        } finally {
          remaining -= 1
          if (remaining <= 0) {
            setGeneratingCostumeImages(false)
          }
        }
      }, 'media')
    }
  }

  const costumePanelProps = {
    costumes: visibleCostumes,
    characters: projectCharacters,
    showSmartGenerate: true,
    extractingFromScript: costumeExtractMode === 'merge',
    extractingRegenerate: costumeExtractMode === 'replace',
    costumeBusyId,
    showAdvancedActions: true,
    currentSeriesOnly: showCurrentSeriesCostumesOnly,
    onToggleCurrentSeriesOnly: setShowCurrentSeriesCostumesOnly,
    onAddCostume: handleAddCostume,
    onUpdateCostume: handleUpdateCostume,
    onDeleteCostume: handleDeleteCostume,
    onSmartGenerateCostume: handleSmartGenerateCostume,
    onExtractFromScript: handleExtractCostumesFromScript,
    onRegenerateFromScript: handleRegenerateCostumesFromScript,
    onGenerateTurnaround: queueGenerateCostumeImage,
    onGenerateAllImages: generateAllCostumeImages,
    generatingAllImages: generatingCostumeImages,
  }

  return {
    costumeExtractMode,
    costumeBusyId,
    costumeError,
    generatingCostumeImages,
    projectCostumes,
    allProjectCostumes,
    visibleCostumes,
    showCurrentSeriesCostumesOnly,
    setShowCurrentSeriesCostumesOnly,
    handleAddCostume,
    handleUpdateCostume,
    handleDeleteCostume,
    handleExtractCostumesFromScript,
    handleRegenerateCostumesFromScript,
    queueGenerateCostumeImage,
    generateAllCostumeImages,
    costumePanelProps,
  }
}
