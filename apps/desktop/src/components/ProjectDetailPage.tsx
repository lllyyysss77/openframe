import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft, Clock3, Play, Plus, Trash2 } from 'lucide-react'
import { charactersCollection } from '../db/characters_collection'
import { projectsCollection } from '../db/projects_collection'
import { seriesCollection } from '../db/series_collection'
import { CharacterPanel, type CreateCharacterDraft } from './CharacterPanel'
import { ScenePanel, type CreateSceneDraft } from './ScenePanel'
import { StudioWorkspace } from './StudioWorkspace'

type ProjectDetailTab = 'episodes' | 'characters' | 'scenes'
type Scene = Awaited<ReturnType<Window['scenesAPI']['getBySeries']>>[number]

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const { data: projects } = useLiveQuery(projectsCollection)
  const { data: allSeries } = useLiveQuery(seriesCollection)
  const { data: allCharacters } = useLiveQuery(charactersCollection)

  const project = useMemo(() => (projects ?? []).find((p) => p.id === projectId) ?? null, [projects, projectId])
  const series = useMemo(
    () => (allSeries ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.sort_index - b.sort_index),
    [allSeries, projectId],
  )
  const projectCharacters = useMemo(
    () => (allCharacters ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.created_at - b.created_at),
    [allCharacters, projectId],
  )
  const seriesSortIndexMap = useMemo(() => new Map(series.map((item) => [item.id, item.sort_index])), [series])
  const sceneSeriesOptions = useMemo(
    () =>
      series.map((item) => ({
        id: item.id,
        title: item.title || `${t('projectLibrary.seriesNo')} ${item.sort_index}`,
      })),
    [series, t],
  )
  const selectedSeriesId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('seriesId')
  }, [location.search])
  const isStudioWindow = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('studio') === '1'
  }, [location.search])
  const selectedSeries = useMemo(
    () => series.find((item) => item.id === selectedSeriesId) ?? null,
    [series, selectedSeriesId],
  )

  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('episodes')
  const [saving, setSaving] = useState(false)
  const [characterError, setCharacterError] = useState('')
  const [sceneError, setSceneError] = useState('')
  const [projectScenes, setProjectScenes] = useState<Scene[]>([])
  const [scenesLoading, setScenesLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (series.length === 0) {
      setProjectScenes([])
      setScenesLoading(false)
      return
    }

    setScenesLoading(true)
    const sortIndexMap = new Map(series.map((item) => [item.id, item.sort_index]))
    Promise.all(
      series.map((item) =>
        window.scenesAPI
          .getBySeries(item.id)
          .catch(() => [] as Scene[]),
      ),
    )
      .then((rowsList) => {
        if (!active) return
        const merged = rowsList
          .flat()
          .sort((a, b) => {
            const aSort = sortIndexMap.get(a.series_id) ?? Number.MAX_SAFE_INTEGER
            const bSort = sortIndexMap.get(b.series_id) ?? Number.MAX_SAFE_INTEGER
            if (aSort !== bSort) return aSort - bSort
            return a.created_at - b.created_at
          })
        setProjectScenes(merged)
      })
      .finally(() => {
        if (active) setScenesLoading(false)
      })

    return () => {
      active = false
    }
  }, [series])

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
    try {
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

  async function handleAddProjectScene(draft: CreateSceneDraft, seriesId: string) {
    if (!seriesId) {
      setSceneError(t('projectLibrary.sceneSeriesRequired'))
      return
    }
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
      setProjectScenes((prev) =>
        [...prev, row].sort((a, b) => {
          const aSort = seriesSortIndexMap.get(a.series_id) ?? Number.MAX_SAFE_INTEGER
          const bSort = seriesSortIndexMap.get(b.series_id) ?? Number.MAX_SAFE_INTEGER
          if (aSort !== bSort) return aSort - bSort
          return a.created_at - b.created_at
        }),
      )
    } catch {
      setSceneError(t('projectLibrary.saveError'))
    }
  }

  async function handleUpdateProjectScene(id: string, draft: CreateSceneDraft, seriesId: string) {
    const current = projectScenes.find((item) => item.id === id)
    if (!current) return

    const targetSeriesId = seriesId || current.series_id
    if (!targetSeriesId) {
      setSceneError(t('projectLibrary.sceneSeriesRequired'))
      return
    }

    setSceneError('')
    const nextScene: Scene = {
      ...current,
      ...draft,
      series_id: targetSeriesId,
    }
    try {
      await window.scenesAPI.update(nextScene)
      setProjectScenes((prev) =>
        prev
          .map((item) => (item.id === id ? nextScene : item))
          .sort((a, b) => {
            const aSort = seriesSortIndexMap.get(a.series_id) ?? Number.MAX_SAFE_INTEGER
            const bSort = seriesSortIndexMap.get(b.series_id) ?? Number.MAX_SAFE_INTEGER
            if (aSort !== bSort) return aSort - bSort
            return a.created_at - b.created_at
          }),
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

    const prompt = [
      'Character portrait design, clean background, cinematic style, no text watermark.',
      `Project category: ${project?.category || 'unknown'}`,
      `Project style: ${project?.genre || 'unknown'}`,
      `Name: ${draft.name || 'unknown'}`,
      `Gender: ${draft.gender || 'unknown'}`,
      `Age: ${draft.age || 'unknown'}`,
      `Personality: ${draft.personality || 'unknown'}`,
      `Appearance: ${draft.appearance || 'unknown'}`,
      `Background: ${draft.background || 'unknown'}`,
    ].join('\n')

    try {
      const result = await window.aiAPI.generateImage({
        prompt,
        options: { ratio: project?.video_ratio ?? '16:9' },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const bytes = new Uint8Array(result.data)
      const mediaType = result.mediaType.toLowerCase()
      const ext = mediaType.includes('png')
        ? 'png'
        : mediaType.includes('webp')
          ? 'webp'
          : mediaType.includes('gif')
            ? 'gif'
            : 'jpg'
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)
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

  async function handleSmartGenerateProjectScene(
    draft: CreateSceneDraft,
  ): Promise<{ ok: true; draft: CreateSceneDraft } | { ok: false; error: string }> {
    if (!draft.title.trim()) {
      return { ok: false, error: t('projectLibrary.sceneTitleRequired') }
    }

    const prompt = [
      'Cinematic environment storyboard frame, no humans, no text watermark.',
      `Project category: ${project?.category || 'unknown'}`,
      `Project style: ${project?.genre || 'unknown'}`,
      `Scene title: ${draft.title || 'unknown'}`,
      `Location: ${draft.location || 'unknown'}`,
      `Time: ${draft.time || 'unknown'}`,
      `Mood: ${draft.mood || 'unknown'}`,
      `Description: ${draft.description || 'unknown'}`,
      `Shot notes: ${draft.shot_notes || 'unknown'}`,
    ].join('\n')

    try {
      const result = await window.aiAPI.generateImage({
        prompt,
        options: { ratio: project?.video_ratio ?? '16:9' },
      })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const bytes = new Uint8Array(result.data)
      const mediaType = result.mediaType.toLowerCase()
      const ext = mediaType.includes('png')
        ? 'png'
        : mediaType.includes('webp')
          ? 'webp'
          : mediaType.includes('gif')
            ? 'gif'
            : 'jpg'
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)
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
        seriesId={selectedSeries?.id ?? ''}
        projectName={project.name}
        projectRatio={project.video_ratio}
        projectCategory={project.category}
        projectGenre={project.genre}
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
              onGenerateAllImages={() => undefined}
              generatingAllImages={false}
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
                  extractingFromScript={false}
                  extractingRegenerate={false}
                  sceneBusyId={null}
                  showAdvancedActions={false}
                  showSmartGenerate
                  seriesOptions={sceneSeriesOptions}
                  onAddScene={(draft) => void handleAddProjectScene(draft, sceneSeriesOptions[0]?.id ?? '')}
                  onAddSceneWithSeries={(draft, seriesId) => void handleAddProjectScene(draft, seriesId)}
                  onUpdateScene={(id, draft) => {
                    const current = projectScenes.find((item) => item.id === id)
                    if (!current) return
                    void handleUpdateProjectScene(id, draft, current.series_id)
                  }}
                  onUpdateSceneWithSeries={(id, draft, seriesId) => void handleUpdateProjectScene(id, draft, seriesId)}
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
