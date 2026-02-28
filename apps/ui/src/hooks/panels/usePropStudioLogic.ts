import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import type { Prop } from '../../db/props_collection'
import type { CreatePropDraft } from './types'
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

function normalizePropName(name: string): string {
  return name.trim().toLowerCase()
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

export function usePropStudioLogic(params: Params) {
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

  const [propExtractMode, setPropExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [propBusyId, setPropBusyId] = useState<string | null>(null)
  const [propError, setPropError] = useState('')
  const [projectProps, setProjectProps] = useState<Prop[]>([])
  const [allProjectProps, setAllProjectProps] = useState<Prop[]>([])
  const [showCurrentSeriesPropsOnly, setShowCurrentSeriesPropsOnly] = useState(true)
  const [generatingPropImages, setGeneratingPropImages] = useState(false)

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

  const visibleProps = useMemo(() => {
    if (showCurrentSeriesPropsOnly) return projectProps
    return allProjectProps
  }, [allProjectProps, projectProps, showCurrentSeriesPropsOnly])

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
      const prompt = renderPromptTemplate(promptOverrides.propTurnaround, {
        projectCategory: projectCategory || 'unknown',
        projectStyle: projectGenre || 'unknown',
        propName: prop.name || 'unknown',
        category: prop.category || 'unknown',
        description: prop.description || 'unknown',
      })

      const result = await window.aiAPI.generateImage({
        prompt,
        modelKey: selectedImageModelKey || undefined,
        options: { ratio: projectRatio },
      })
      if (!result.ok) {
        setPropError(result.error)
        return
      }

      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(
          new Uint8Array(result.data),
          extFromMediaType(result.mediaType),
        )

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

  const propPanelProps = {
    props: visibleProps,
    extractingFromScript: propExtractMode === 'merge',
    extractingRegenerate: propExtractMode === 'replace',
    propBusyId,
    showAdvancedActions: true,
    currentSeriesOnly: showCurrentSeriesPropsOnly,
    onToggleCurrentSeriesOnly: setShowCurrentSeriesPropsOnly,
    onAddProp: handleAddProp,
    onUpdateProp: handleUpdateProp,
    onDeleteProp: handleDeleteProp,
    onExtractFromScript: handleExtractPropsFromScript,
    onRegenerateFromScript: handleRegeneratePropsFromScript,
    onGenerateTurnaround: queueGeneratePropImage,
    onGenerateAllImages: generateAllPropImages,
    generatingAllImages: generatingPropImages,
  }

  return {
    propExtractMode,
    propBusyId,
    propError,
    generatingPropImages,
    projectProps,
    allProjectProps,
    visibleProps,
    showCurrentSeriesPropsOnly,
    setShowCurrentSeriesPropsOnly,
    handleAddProp,
    handleUpdateProp,
    handleDeleteProp,
    handleExtractPropsFromScript,
    handleRegeneratePropsFromScript,
    queueGeneratePropImage,
    generateAllPropImages,
    propPanelProps,
  }
}
