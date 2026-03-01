import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft, Clock3, PencilLine, Play, Plus, Trash2 } from 'lucide-react'
import {
  buildCostumeSwapSuffix,
  buildSceneStyleSuffix,
  TURNAROUND_THREE_VIEW_SUFFIX,
} from '@openframe/prompts'
import { charactersCollection } from '../db/characters_collection'
import { characterRelationsCollection } from '../db/character_relations_collection'
import { costumesCollection } from '../db/costumes_collection'
import { propsCollection } from '../db/props_collection'
import { projectsCollection } from '../db/projects_collection'
import { seriesCollection } from '../db/series_collection'
import { settingsCollection } from '../db/settings_collection'
import { genresCollection } from '../db/genres_collection'
import { CharacterRelationGraphPanel } from './CharacterRelationGraphPanel'
import { CharacterPanel, type CreateCharacterDraft } from './CharacterPanel'
import { CostumePanel, type CreateCostumeDraft } from './CostumePanel'
import { PropPanel, type CreatePropDraft } from './PropPanel'
import { ScenePanel, type CreateSceneDraft } from './ScenePanel'
import { StudioWorkspace } from './StudioWorkspace'
import {
  PROMPT_OVERRIDES_SETTING_KEY,
  parsePromptOverridesFromSetting,
  renderPromptTemplate,
} from '../utils/prompt_overrides'
import { readImageReferenceAsDataUrl } from '../utils/image_reference'

type ProjectDetailTab = 'episodes' | 'characters' | 'relations' | 'props' | 'scenes'
type Scene = Awaited<ReturnType<Window['scenesAPI']['getByProject']>>[number]

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const { data: projects } = useLiveQuery(projectsCollection)
  const { data: allSeries } = useLiveQuery(seriesCollection)
  const { data: allGenres } = useLiveQuery(genresCollection)
  const { data: allCharacters } = useLiveQuery(charactersCollection)
  const { data: allCharacterRelations } = useLiveQuery(characterRelationsCollection)
  const { data: allCostumes } = useLiveQuery(costumesCollection)
  const { data: allProps } = useLiveQuery(propsCollection)
  const { data: settingsList } = useLiveQuery(settingsCollection)

  const project = useMemo(() => (projects ?? []).find((p) => p.id === projectId) ?? null, [projects, projectId])
  const series = useMemo(
    () => (allSeries ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.sort_index - b.sort_index),
    [allSeries, projectId],
  )
  const projectCharacters = useMemo(
    () => (allCharacters ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.created_at - b.created_at),
    [allCharacters, projectId],
  )
  const projectProps = useMemo(
    () => (allProps ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.created_at - b.created_at),
    [allProps, projectId],
  )
  const projectCostumes = useMemo(
    () => (allCostumes ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.created_at - b.created_at),
    [allCostumes, projectId],
  )
  const projectCharacterRelations = useMemo(
    () => (allCharacterRelations ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.created_at - b.created_at),
    [allCharacterRelations, projectId],
  )
  const projectStyle = useMemo(() => {
    const raw = (project?.genre ?? '').trim()
    if (!raw) return 'unknown'

    const matched = (allGenres ?? []).find((item) =>
      item.id === raw
      || item.name.trim().toLowerCase() === raw.toLowerCase()
      || item.code.trim().toLowerCase() === raw.toLowerCase(),
    )
    if (!matched) return raw

    const stylePrompt = matched.prompt.trim()
    const styleDescription = matched.description.trim()
    if (stylePrompt) return `${matched.name} | ${stylePrompt}`
    if (styleDescription) return `${matched.name} | ${styleDescription}`
    return matched.name
  }, [allGenres, project?.genre])
  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((item) => [item.id, item.value])),
    [settingsList],
  )
  const promptOverrides = useMemo(
    () => parsePromptOverridesFromSetting(settingsMap[PROMPT_OVERRIDES_SETTING_KEY], i18n.language),
    [settingsMap, i18n.language],
  )
  const selectedSeriesId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('seriesId')
  }, [location.search])
  const studioSeriesId = useMemo(
    () => selectedSeriesId ?? series[0]?.id ?? '',
    [selectedSeriesId, series],
  )
  const isStudioWindow = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('studio') === '1'
  }, [location.search])
  const selectedSeries = useMemo(
    () => series.find((item) => item.id === studioSeriesId) ?? null,
    [series, studioSeriesId],
  )

  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('episodes')
  const [costumeLibraryCharacterId, setCostumeLibraryCharacterId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [characterError, setCharacterError] = useState('')
  const [costumeError, setCostumeError] = useState('')
  const [propError, setPropError] = useState('')
  const [sceneError, setSceneError] = useState('')
  const [projectScenes, setProjectScenes] = useState<Scene[]>([])
  const [scenesLoading, setScenesLoading] = useState(false)

  useEffect(() => {
    if (activeTab !== 'characters') {
      setCostumeLibraryCharacterId(null)
      setCostumeError('')
    }
  }, [activeTab])

  useEffect(() => {
    if (!costumeLibraryCharacterId) return
    const exists = projectCharacters.some((item) => item.id === costumeLibraryCharacterId)
    if (!exists) {
      setCostumeLibraryCharacterId(null)
      setCostumeError('')
    }
  }, [projectCharacters, costumeLibraryCharacterId])

  useEffect(() => {
    let active = true
    setScenesLoading(true)
    window.scenesAPI
      .getByProject(projectId)
      .then((rows) => {
        if (!active) return
        setProjectScenes(rows.sort((a, b) => a.created_at - b.created_at))
      })
      .catch(() => {
        if (active) setProjectScenes([])
      })
      .finally(() => {
        if (active) setScenesLoading(false)
      })

    return () => {
      active = false
    }
  }, [projectId])

  const tabs = useMemo<Array<{ key: ProjectDetailTab; label: string; subtitle: string }>>(
    () => [
      {
        key: 'episodes',
        label: t('projectLibrary.tabEpisodes'),
        subtitle: t('projectLibrary.episodesSubtitle'),
      },
      {
        key: 'characters',
        label: t('projectLibrary.tabCharacterLibrary'),
        subtitle: t('projectLibrary.charactersSubtitle'),
      },
      {
        key: 'relations',
        label: t('projectLibrary.tabRelationGraph'),
        subtitle: t('projectLibrary.relationsSubtitle'),
      },
      {
        key: 'props',
        label: t('projectLibrary.tabPropLibrary'),
        subtitle: t('projectLibrary.propsSubtitle'),
      },
      {
        key: 'scenes',
        label: t('projectLibrary.tabSceneLibrary'),
        subtitle: t('projectLibrary.scenesSubtitle'),
      },
    ],
    [t],
  )
  const activeTabMeta = useMemo(
    () => tabs.find((item) => item.key === activeTab) ?? tabs[0],
    [activeTab, tabs],
  )

  function normalizeName(value: string): string {
    return value.trim().toLowerCase()
  }

  function normalizeIds(ids: string[]): string[] {
    return Array.from(new Set(ids.filter(Boolean)))
  }

  function sameIds(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false
    const set = new Set(left)
    return right.every((id) => set.has(id))
  }

  function normalizeSceneTitle(value: string): string {
    return value.trim().toLowerCase()
  }

  function normalizeCharacterAgeKey(age: string): string {
    return (age || '').trim().toLowerCase()
  }

  function buildCharacterIdentityKey(name: string, age: string): string {
    const normalizedName = normalizeName(name)
    if (!normalizedName) return ''
    return `${normalizedName}::${normalizeCharacterAgeKey(age)}`
  }

  const costumeLibraryCharacter = useMemo(
    () => projectCharacters.find((item) => item.id === costumeLibraryCharacterId) ?? null,
    [projectCharacters, costumeLibraryCharacterId],
  )
  const filteredCharacterCostumes = useMemo(
    () => projectCostumes.filter((item) => costumeLibraryCharacterId ? item.character_ids.includes(costumeLibraryCharacterId) : true),
    [projectCostumes, costumeLibraryCharacterId],
  )

  async function handleAddSeries() {
    const duration = 0

    setSaving(true)
    try {
      const nextSortIndex = series.length === 0 ? 1 : Math.max(...series.map((s) => s.sort_index)) + 1
      seriesCollection.insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        title: `${t('projectLibrary.seriesNo')}${nextSortIndex}`,
        script: '',
        sort_index: nextSortIndex,
        thumbnail: null,
        duration,
        created_at: Date.now(),
      })
      projectsCollection.update(projectId, (draft) => {
        draft.series_count = draft.series_count + 1
      })
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteSeries(seriesId: string) {
    seriesCollection.delete(seriesId)
    projectsCollection.update(projectId, (draft) => {
      draft.series_count = Math.max(0, draft.series_count - 1)
    })
  }

  async function handleEnterCreation(seriesId: string) {
    try {
      await window.windowAPI.openStudio({ projectId, seriesId })
    } catch {
      // ignore open failures for now
    }
  }

  async function handleAddCharacter(draft: CreateCharacterDraft) {
    setCharacterError('')
    const key = buildCharacterIdentityKey(draft.name, draft.age)
    const existing = key
      ? projectCharacters.find((item) => buildCharacterIdentityKey(item.name, item.age) === key)
      : null
    try {
      if (existing) {
        const next = {
          ...existing,
          gender: existing.gender || draft.gender,
          age: existing.age || draft.age,
          personality: existing.personality || draft.personality,
          appearance: existing.appearance || draft.appearance,
          background: existing.background || draft.background,
          thumbnail: existing.thumbnail || draft.thumbnail,
        }
        const changed = (
          next.gender !== existing.gender
          || next.age !== existing.age
          || next.personality !== existing.personality
          || next.appearance !== existing.appearance
          || next.background !== existing.background
          || next.thumbnail !== existing.thumbnail
        )
        if (changed) {
          charactersCollection.update(existing.id, (current) => {
            current.gender = next.gender
            current.age = next.age
            current.personality = next.personality
            current.appearance = next.appearance
            current.background = next.background
            current.thumbnail = next.thumbnail
          })
        }
        return
      }
      charactersCollection.insert({
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
      })
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateCharacter(id: string, draft: CreateCharacterDraft) {
    const identityKey = buildCharacterIdentityKey(draft.name, draft.age)
    if (identityKey) {
      const duplicate = projectCharacters.find(
        (item) => item.id !== id && buildCharacterIdentityKey(item.name, item.age) === identityKey,
      )
      if (duplicate) {
        setCharacterError(t('projectLibrary.characterNameAgeUnique'))
        return
      }
    }

    setCharacterError('')
    try {
      charactersCollection.update(id, (current) => {
        current.name = draft.name
        current.gender = draft.gender
        current.age = draft.age
        current.personality = draft.personality
        current.thumbnail = draft.thumbnail
        current.appearance = draft.appearance
        current.background = draft.background
      })
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleDeleteCharacter(id: string, name: string) {
    setCharacterError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.characterDeleteConfirm', {
        name: name || t('projectLibrary.characterDefaultName'),
      }),
    )
    if (!shouldDelete) return

    try {
      charactersCollection.delete(id)
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  function handleOpenCharacterCostumeLibrary(id: string) {
    setCostumeError('')
    setCostumeLibraryCharacterId(id)
  }

  function handleCloseCharacterCostumeLibrary() {
    setCostumeLibraryCharacterId(null)
    setCostumeError('')
  }

  async function handleAddCostume(draft: CreateCostumeDraft) {
    setCostumeError('')
    const key = normalizeName(draft.name)
    const existing = key
      ? projectCostumes.find((item) => normalizeName(item.name) === key)
      : null
    const enforcedCharacterIds = normalizeIds([
      ...(costumeLibraryCharacterId ? [costumeLibraryCharacterId] : []),
      ...draft.character_ids,
    ])
    try {
      if (existing) {
        const next = {
          ...existing,
          category: existing.category || draft.category,
          description: existing.description || draft.description,
          character_ids: normalizeIds([...existing.character_ids, ...enforcedCharacterIds]),
          thumbnail: existing.thumbnail || draft.thumbnail,
        }
        const changed = (
          next.category !== existing.category
          || next.description !== existing.description
          || !sameIds(next.character_ids, existing.character_ids)
          || next.thumbnail !== existing.thumbnail
        )
        if (changed) {
          costumesCollection.update(existing.id, (current) => {
            current.category = next.category
            current.description = next.description
            current.character_ids = next.character_ids
            current.thumbnail = next.thumbnail
          })
        }
        return
      }
      costumesCollection.insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        character_ids: enforcedCharacterIds,
        thumbnail: draft.thumbnail,
        created_at: Date.now(),
      })
    } catch {
      setCostumeError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateCostume(id: string, draft: CreateCostumeDraft) {
    setCostumeError('')
    const enforcedCharacterIds = normalizeIds([
      ...(costumeLibraryCharacterId ? [costumeLibraryCharacterId] : []),
      ...draft.character_ids,
    ])
    try {
      costumesCollection.update(id, (current) => {
        current.name = draft.name
        current.category = draft.category
        current.description = draft.description
        current.character_ids = enforcedCharacterIds
        current.thumbnail = draft.thumbnail
      })
    } catch {
      setCostumeError(t('projectLibrary.saveError'))
    }
  }

  async function handleDeleteCostume(id: string, name: string) {
    setCostumeError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.costumeDeleteConfirm', {
        name: name || t('projectLibrary.costumeDefaultName'),
      }),
    )
    if (!shouldDelete) return

    try {
      costumesCollection.delete(id)
    } catch {
      setCostumeError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddProp(draft: CreatePropDraft) {
    setPropError('')
    const key = normalizeName(draft.name)
    const existing = key
      ? projectProps.find((item) => normalizeName(item.name) === key)
      : null
    try {
      if (existing) {
        const next = {
          ...existing,
          category: existing.category || draft.category,
          description: existing.description || draft.description,
          thumbnail: existing.thumbnail || draft.thumbnail,
        }
        const changed = (
          next.category !== existing.category
          || next.description !== existing.description
          || next.thumbnail !== existing.thumbnail
        )
        if (changed) {
          propsCollection.update(existing.id, (current) => {
            current.category = next.category
            current.description = next.description
            current.thumbnail = next.thumbnail
          })
        }
        return
      }
      propsCollection.insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        thumbnail: draft.thumbnail,
        created_at: Date.now(),
      })
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateProp(id: string, draft: CreatePropDraft) {
    setPropError('')
    try {
      propsCollection.update(id, (current) => {
        current.name = draft.name
        current.category = draft.category
        current.description = draft.description
        current.thumbnail = draft.thumbnail
      })
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleDeleteProp(id: string, name: string) {
    setPropError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.propDeleteConfirm', {
        name: name || t('projectLibrary.propDefaultName'),
      }),
    )
    if (!shouldDelete) return

    try {
      propsCollection.delete(id)
    } catch {
      setPropError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddProjectScene(draft: CreateSceneDraft) {
    setSceneError('')
    const key = normalizeSceneTitle(draft.title)
    const existing = key
      ? projectScenes.find((item) => normalizeSceneTitle(item.title) === key)
      : null

    try {
      if (existing) {
        const nextScene: Scene = {
          ...existing,
          location: existing.location || draft.location,
          time: existing.time || draft.time,
          mood: existing.mood || draft.mood,
          description: existing.description || draft.description,
          shot_notes: existing.shot_notes || draft.shot_notes,
          thumbnail: existing.thumbnail || draft.thumbnail,
        }
        const changed = (
          nextScene.location !== existing.location
          || nextScene.time !== existing.time
          || nextScene.mood !== existing.mood
          || nextScene.description !== existing.description
          || nextScene.shot_notes !== existing.shot_notes
          || nextScene.thumbnail !== existing.thumbnail
        )
        if (changed) {
          await window.scenesAPI.update(nextScene)
          setProjectScenes((prev) =>
            prev
              .map((item) => (item.id === existing.id ? nextScene : item))
              .sort((a, b) => a.created_at - b.created_at),
          )
        }
        return
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
      await window.scenesAPI.insert(row)
      setProjectScenes((prev) => [...prev, row].sort((a, b) => a.created_at - b.created_at))
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateProjectScene(id: string, draft: CreateSceneDraft) {
    const current = projectScenes.find((item) => item.id === id)
    if (!current) return

    setSceneError('')
    const nextScene: Scene = {
      ...current,
      ...draft,
    }
    try {
      await window.scenesAPI.update(nextScene)
      setProjectScenes((prev) =>
        prev
          .map((item) => (item.id === id ? nextScene : item))
          .sort((a, b) => a.created_at - b.created_at),
      )
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleDeleteProjectScene(id: string, title: string) {
    setSceneError('')
    const shouldDelete = window.confirm(
      t('projectLibrary.sceneDeleteConfirm', {
        name: title || t('projectLibrary.sceneCardUntitled'),
      }),
    )
    if (!shouldDelete) return
    try {
      await window.scenesAPI.delete(id)
      setProjectScenes((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleSmartGenerateProjectCharacter(
    draft: CreateCharacterDraft,
  ): Promise<{ ok: true; draft: CreateCharacterDraft } | { ok: false; error: string }> {
    if (!draft.name.trim()) {
      return { ok: false, error: t('projectLibrary.characterNameRequired') }
    }

    const prompt = renderPromptTemplate(promptOverrides.characterTurnaround, {
      projectCategory: project?.category || 'unknown',
      projectStyle,
      name: draft.name || 'unknown',
      gender: draft.gender || 'unknown',
      age: draft.age || 'unknown',
      personality: draft.personality || 'unknown',
      appearance: draft.appearance || 'unknown',
      background: draft.background || 'unknown',
    })
    const finalPrompt = `${prompt}\n\n${TURNAROUND_THREE_VIEW_SUFFIX}`

    try {
      const result = await window.aiAPI.generateImage({
        prompt: finalPrompt,
        options: { ratio: project?.video_ratio ?? '16:9' },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const mediaType = result.mediaType.toLowerCase()
      const ext = mediaType.includes('png')
        ? 'png'
        : mediaType.includes('webp')
          ? 'webp'
          : mediaType.includes('gif')
            ? 'gif'
            : 'jpg'
      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(new Uint8Array(result.data), ext)
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

  async function handleSmartGenerateProjectCostume(
    draft: CreateCostumeDraft,
  ): Promise<{ ok: true; draft: CreateCostumeDraft } | { ok: false; error: string }> {
    if (!draft.name.trim()) {
      return { ok: false, error: t('projectLibrary.costumeNameRequired') }
    }

    const normalizedCharacterIds = normalizeIds([
      ...(costumeLibraryCharacterId ? [costumeLibraryCharacterId] : []),
      ...draft.character_ids,
    ])
    const linkedCharacters = normalizedCharacterIds
      .map((id) => projectCharacters.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(', ')
    const referenceImages: string[] = []
    for (const characterId of normalizedCharacterIds.slice(0, 3)) {
      const character = projectCharacters.find((item) => item.id === characterId)
      const ref = await readImageReferenceAsDataUrl(character?.thumbnail ?? null)
      if (ref) referenceImages.push(ref)
    }
    if (referenceImages.length === 0) {
      return { ok: false, error: t('projectLibrary.costumeNeedCharacterImage') }
    }
    const prompt = renderPromptTemplate(promptOverrides.propTurnaround, {
      projectCategory: project?.category || 'unknown',
      projectStyle,
      propName: draft.name || 'unknown',
      category: draft.category || 'unknown',
      description: [
        draft.description || 'unknown',
        linkedCharacters ? `characters: ${linkedCharacters}` : '',
        'task: keep character identity and change outfit only',
      ]
        .filter(Boolean)
        .join('\n'),
    })
    const finalPrompt = `${prompt}\n\n${buildCostumeSwapSuffix(projectStyle)}`

    try {
      const result = await window.aiAPI.generateImage({
        prompt: { text: finalPrompt, images: referenceImages },
        options: { ratio: project?.video_ratio ?? '16:9' },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const mediaType = result.mediaType.toLowerCase()
      const ext = mediaType.includes('png')
        ? 'png'
        : mediaType.includes('webp')
          ? 'webp'
          : mediaType.includes('gif')
            ? 'gif'
            : 'jpg'
      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(new Uint8Array(result.data), ext)
      return {
        ok: true,
        draft: {
          ...draft,
          character_ids: normalizedCharacterIds,
          thumbnail: savedPath,
        },
      }
    } catch {
      return { ok: false, error: t('projectLibrary.aiToolkitFailed') }
    }
  }

  async function handleSmartGenerateProjectScene(
    draft: CreateSceneDraft,
  ): Promise<{ ok: true; draft: CreateSceneDraft } | { ok: false; error: string }> {
    if (!draft.title.trim()) {
      return { ok: false, error: t('projectLibrary.sceneTitleRequired') }
    }

    const prompt = renderPromptTemplate(promptOverrides.sceneTurnaround, {
      projectCategory: project?.category || 'unknown',
      projectStyle,
      sceneTitle: draft.title || 'unknown',
      location: draft.location || 'unknown',
      time: draft.time || 'unknown',
      mood: draft.mood || 'unknown',
    })
    const finalPrompt = `${prompt}\n\n${buildSceneStyleSuffix(projectStyle)}`

    try {
      const result = await window.aiAPI.generateImage({
        prompt: finalPrompt,
        options: { ratio: '16:9' },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const mediaType = result.mediaType.toLowerCase()
      const ext = mediaType.includes('png')
        ? 'png'
        : mediaType.includes('webp')
          ? 'webp'
          : mediaType.includes('gif')
            ? 'gif'
            : 'jpg'
      const savedPath = result.url
        ? result.url
        : await window.thumbnailsAPI.save(new Uint8Array(result.data), ext)
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

  if (!project) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        <p className="text-sm text-base-content/60">{t('projectLibrary.notFound')}</p>
      </main>
    )
  }

  if (isStudioWindow) {
    return (
      <StudioWorkspace
        projectId={projectId}
        seriesId={studioSeriesId}
        projectName={project.name}
        projectRatio={project.video_ratio}
        projectCategory={project.category}
        projectGenre={projectStyle}
        seriesTitle={selectedSeries?.title ?? t('projectLibrary.seriesNo')}
        scriptContent={selectedSeries?.script ?? ''}
      />
    )
  }

  return (
    <main className="flex-1 p-6 overflow-hidden bg-linear-to-br from-base-200/40 via-base-100 to-base-200/20">
      <div className="max-w-full h-full min-h-0 flex flex-col">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold mb-1 text-base-content">{project.name}</h1>
            <p className="text-base-content/60 text-sm">{activeTabMeta.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate({ to: '/projects/new', search: { projectId } })}
            >
              <PencilLine size={14} />
              {t('projectLibrary.edit')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ to: '/projects' })}>
              <ArrowLeft size={14} />
              {t('projectLibrary.backToList')}
            </button>
          </div>
        </div>

        <div className="mb-5 inline-flex rounded-lg border border-base-300 bg-base-100 p-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm ${activeTab === item.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {activeTab === 'characters' && characterError ? (
          <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{characterError}</div>
        ) : null}
        {activeTab === 'characters' && costumeError ? (
          <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{costumeError}</div>
        ) : null}
        {activeTab === 'props' && propError ? (
          <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{propError}</div>
        ) : null}
        {activeTab === 'scenes' && sceneError ? (
          <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{sceneError}</div>
        ) : null}

        <div className="min-h-0 flex-1">
          {activeTab === 'episodes' && (
            <div className="h-full overflow-y-auto">
              <div className="flex flex-wrap gap-4">
                {series.map((item) => (
                  <div key={item.id} className="w-64 rounded-xl border border-base-300 bg-base-100 p-4 hover:shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <span className="inline-flex items-center rounded-md bg-base-200 px-2 py-1 text-xs text-base-content/70">
                        {t('projectLibrary.seriesNo')} {item.sort_index}
                      </span>
                      <button
                        className="btn btn-ghost btn-xs text-base-content/50 hover:text-error"
                        onClick={() => handleDeleteSeries(item.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="mb-4">
                      <p className="text-lg font-semibold text-base-content">{item.title || `${t('projectLibrary.seriesNo')}${item.sort_index}`}</p>
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-base-content/60">
                        <Clock3 size={12} />
                        {item.duration} {t('projectLibrary.minute')}
                      </p>
                    </div>

                    <div className="border-t border-base-300 pt-3 flex justify-end">
                      <button type="button" className="btn btn-primary btn-xs" onClick={() => void handleEnterCreation(item.id)}>
                        <Play size={12} />
                        {t('projectLibrary.enterCreation')}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => void handleAddSeries()}
                  disabled={saving}
                  className="w-64 h-47.5 rounded-xl border border-dashed border-base-300 bg-base-100/60 hover:bg-base-200/60 transition-colors flex flex-col items-center justify-center gap-3 text-base-content"
                >
                  <Plus size={32} className="text-base-content/50" />
                  <p className="text-lg font-semibold">{t('projectLibrary.addSeries')}</p>
                  <p className="text-xs text-base-content/60">{t('projectLibrary.addSeriesHint')}</p>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'characters' && (
            costumeLibraryCharacterId ? (
              <div className="h-full flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={handleCloseCharacterCostumeLibrary}>
                    <ArrowLeft size={14} />
                    {t('projectLibrary.back')}
                  </button>
                  <p className="text-sm text-base-content/70">
                    {t('projectLibrary.characterCostumeLibrary', { name: costumeLibraryCharacter?.name || '-' })}
                  </p>
                </div>
                <div className="min-h-0 flex-1">
                  <CostumePanel
                    costumes={filteredCharacterCostumes}
                    characters={projectCharacters.map((item) => ({ id: item.id, name: item.name }))}
                    panelTitle={t('projectLibrary.characterCostumePanelTitle', { name: costumeLibraryCharacter?.name || '-' })}
                    panelSubtitle={t('projectLibrary.characterCostumePanelSubtitle', { name: costumeLibraryCharacter?.name || '-' })}
                    fixedCharacterId={costumeLibraryCharacterId}
                    showSmartGenerate
                    onAddCostume={(draft) => void handleAddCostume(draft)}
                    onUpdateCostume={(id, draft) => void handleUpdateCostume(id, draft)}
                    onDeleteCostume={(id, name) => void handleDeleteCostume(id, name)}
                    onSmartGenerateCostume={handleSmartGenerateProjectCostume}
                  />
                </div>
              </div>
            ) : (
              <CharacterPanel
                characters={projectCharacters}
                extractingFromDraft={false}
                extractingRegenerate={false}
                characterBusyId={null}
                showAdvancedActions={false}
                showSmartGenerate
                onAddCharacter={(draft) => void handleAddCharacter(draft)}
                onUpdateCharacter={(id, draft) => void handleUpdateCharacter(id, draft)}
                onSmartGenerateCharacter={handleSmartGenerateProjectCharacter}
                onExtractFromScript={() => undefined}
                onRegenerateFromScript={() => undefined}
                onDeleteCharacter={(id, name) => void handleDeleteCharacter(id, name)}
                onGenerateTurnaround={() => undefined}
                onGenerateCostume={(id) => handleOpenCharacterCostumeLibrary(id)}
                onGenerateAllImages={() => undefined}
                generatingAllImages={false}
              />
            )
          )}

          {activeTab === 'props' && (
            <PropPanel
              props={projectProps}
              onAddProp={(draft) => void handleAddProp(draft)}
              onUpdateProp={(id, draft) => void handleUpdateProp(id, draft)}
              onDeleteProp={(id, name) => void handleDeleteProp(id, name)}
            />
          )}

          {activeTab === 'relations' && (
            <CharacterRelationGraphPanel
              characters={projectCharacters.map((item) => ({ id: item.id, name: item.name, thumbnail: item.thumbnail }))}
              relations={projectCharacterRelations}
            />
          )}

          {activeTab === 'scenes' && (
            scenesLoading ? (
              <div className="h-full overflow-y-auto">
                <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-sm text-base-content/60">
                  {t('projectLibrary.loadingScenes')}
                </div>
              </div>
            ) : (
              <div className="h-full">
                <ScenePanel
                  scenes={projectScenes}
                  projectRatio={project.video_ratio}
                  extractingFromScript={false}
                  extractingRegenerate={false}
                  sceneBusyId={null}
                  showAdvancedActions={false}
                  showSmartGenerate
                  onAddScene={(draft) => void handleAddProjectScene(draft)}
                  onUpdateScene={(id, draft) => void handleUpdateProjectScene(id, draft)}
                  onSmartGenerateScene={handleSmartGenerateProjectScene}
                  onExtractFromScript={() => undefined}
                  onRegenerateFromScript={() => undefined}
                  onDeleteScene={(id, title) => void handleDeleteProjectScene(id, title)}
                  onGenerateSceneImage={() => undefined}
                  onGenerateAllImages={() => undefined}
                  generatingAllImages={false}
                />
              </div>
            )
          )}
        </div>
      </div>
    </main>
  )
}
