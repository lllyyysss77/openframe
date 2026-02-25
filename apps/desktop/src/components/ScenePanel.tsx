import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, FolderOpen, MapPin, PlusCircle, RefreshCw, ScrollText, Sparkles, Trash2, Upload, X } from 'lucide-react'

type SceneCard = {
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

type CreateSceneDraft = {
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
}

export type { CreateSceneDraft }

interface ScenePanelProps {
  scenes: SceneCard[]
  extractingFromScript: boolean
  extractingRegenerate: boolean
  sceneBusyId: string | null
  showAdvancedActions?: boolean
  showSmartGenerate?: boolean
  seriesOptions?: Array<{ id: string; title: string }>
  onAddSceneWithSeries?: (draft: CreateSceneDraft, seriesId: string) => void
  onUpdateSceneWithSeries?: (id: string, draft: CreateSceneDraft, seriesId: string) => void
  onAddScene: (draft: CreateSceneDraft) => void
  onUpdateScene: (id: string, draft: CreateSceneDraft) => void
  onSmartGenerateScene: (draft: CreateSceneDraft) => Promise<{ ok: true; draft: CreateSceneDraft } | { ok: false; error: string }>
  onExtractFromScript: () => void
  onRegenerateFromScript: () => void
  onDeleteScene: (id: string, title: string) => void
  onGenerateSceneImage: (id: string) => void
  onGenerateAllImages: () => void
  generatingAllImages: boolean
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function ScenePanel({
  scenes,
  extractingFromScript,
  extractingRegenerate,
  sceneBusyId,
  showAdvancedActions = true,
  showSmartGenerate = true,
  seriesOptions,
  onAddSceneWithSeries,
  onUpdateSceneWithSeries,
  onAddScene,
  onUpdateScene,
  onSmartGenerateScene,
  onExtractFromScript,
  onRegenerateFromScript,
  onDeleteScene,
  onGenerateSceneImage,
  onGenerateAllImages,
  generatingAllImages,
}: ScenePanelProps) {
  const { t } = useTranslation()
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createUploading, setCreateUploading] = useState(false)
  const [createGenerating, setCreateGenerating] = useState(false)
  const createUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createSeriesId, setCreateSeriesId] = useState(seriesOptions?.[0]?.id ?? '')
  const [createDraft, setCreateDraft] = useState<CreateSceneDraft>({
    title: '',
    location: '',
    time: '',
    mood: '',
    description: '',
    shot_notes: '',
    thumbnail: null,
  })
  const seriesNameMap = useMemo(
    () => new Map((seriesOptions ?? []).map((item) => [item.id, item.title])),
    [seriesOptions],
  )

  useEffect(() => {
    if (!seriesOptions || seriesOptions.length === 0) return
    setCreateSeriesId((prev) => {
      if (seriesOptions.some((item) => item.id === prev)) return prev
      return seriesOptions[0]?.id ?? ''
    })
  }, [seriesOptions])

  function handleOpenCreate() {
    setEditingSceneId(null)
    setCreateError('')
    setCreateSeriesId(seriesOptions?.[0]?.id ?? '')
    setCreateDraft({ title: '', location: '', time: '', mood: '', description: '', shot_notes: '', thumbnail: null })
    setCreateOpen(true)
  }

  function handleOpenEdit(scene: SceneCard) {
    setEditingSceneId(scene.id)
    setCreateError('')
    setCreateDraft({
      title: scene.title,
      location: scene.location,
      time: scene.time,
      mood: scene.mood,
      description: scene.description,
      shot_notes: scene.shot_notes,
      thumbnail: scene.thumbnail,
    })
    setCreateSeriesId(scene.series_id)
    setCreateOpen(true)
  }

  async function handleSmartGenerate() {
    if (!createDraft.title.trim()) {
      setCreateError(t('projectLibrary.sceneTitleRequired'))
      return
    }
    setCreateGenerating(true)
    setCreateError('')
    try {
      const result = await onSmartGenerateScene(createDraft)
      if (!result.ok) {
        setCreateError(result.error)
        return
      }
      setCreateDraft(result.draft)
    } finally {
      setCreateGenerating(false)
    }
  }

  function extFromFile(file: File): string {
    const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
    if (fromName) return fromName
    if (file.type === 'image/jpeg') return 'jpg'
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/webp') return 'webp'
    if (file.type === 'image/gif') return 'gif'
    return 'png'
  }

  async function handleCreateUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setCreateUploading(true)
    setCreateError('')
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const savedPath = await window.thumbnailsAPI.save(buf, extFromFile(file))
      setCreateDraft((prev) => ({ ...prev, thumbnail: savedPath }))
    } catch {
      setCreateError(t('projectLibrary.saveError'))
    } finally {
      setCreateUploading(false)
    }
  }

  function handleCreateSubmit() {
    if (!createDraft.title.trim()) {
      setCreateError(t('projectLibrary.sceneTitleRequired'))
      return
    }
    if (seriesOptions && seriesOptions.length > 0 && !createSeriesId) {
      setCreateError(t('projectLibrary.sceneSeriesRequired'))
      return
    }

    const targetSeriesId = createSeriesId || seriesOptions?.[0]?.id || ''
    const payload: CreateSceneDraft = {
      title: createDraft.title.trim(),
      location: createDraft.location.trim(),
      time: createDraft.time.trim(),
      mood: createDraft.mood.trim(),
      description: createDraft.description.trim(),
      shot_notes: createDraft.shot_notes.trim(),
      thumbnail: createDraft.thumbnail,
    }
    if (editingSceneId) {
      if (onUpdateSceneWithSeries) {
        onUpdateSceneWithSeries(editingSceneId, payload, targetSeriesId)
      } else {
        onUpdateScene(editingSceneId, payload)
      }
    } else if (onAddSceneWithSeries) {
      onAddSceneWithSeries(payload, targetSeriesId)
    } else {
      onAddScene(payload)
    }
    setCreateOpen(false)
  }

  return (
    <section className="h-full rounded-2xl border border-base-300 bg-linear-to-br from-base-200/30 via-base-100 to-base-200/20 text-base-content p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide">{t('projectLibrary.scenePanelTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-1">{t('projectLibrary.scenePanelSubtitle')}</p>
        </div>
        {showAdvancedActions ? (
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm btn-outline" onClick={onExtractFromScript} disabled={extractingFromScript || extractingRegenerate}>
              <FolderOpen size={12} />
              {extractingFromScript ? t('projectLibrary.aiStreaming') : t('projectLibrary.sceneFromDraft')}
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onRegenerateFromScript} disabled={extractingFromScript || extractingRegenerate}>
              <RefreshCw size={12} />
              {extractingRegenerate ? t('projectLibrary.aiStreaming') : t('projectLibrary.sceneRegenerate')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onGenerateAllImages}
              disabled={extractingFromScript || extractingRegenerate || generatingAllImages || sceneBusyId !== null}
            >
              <Sparkles size={12} />
              {generatingAllImages ? t('projectLibrary.aiStreaming') : t('projectLibrary.sceneGenerateAllImages')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap items-start gap-3 pr-2">
          <article className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 flex flex-col items-center justify-center gap-3 text-base-content/75 cursor-pointer hover:border-primary/40 hover:bg-base-100 transition-colors" onClick={handleOpenCreate}>
            <PlusCircle size={24} className="text-base-content/55" />
            <p className="text-sm font-medium">{t('projectLibrary.sceneSetup')}</p>
            <p className="text-xs text-base-content/55">{t('projectLibrary.sceneEmptyHint')}</p>
          </article>

          {scenes.length === 0 ? (
            <article className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 p-4 flex items-center justify-center text-center text-sm text-base-content/60">
              {t('projectLibrary.emptyScenes')}
            </article>
          ) : null}

          {scenes.map((scene) => (
            <article key={scene.id} className="w-56 h-105 shrink-0 rounded-xl border border-base-300 bg-base-100 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleOpenEdit(scene)}>
              <div className="h-44 border-b border-base-300 bg-linear-to-b from-base-200 via-base-100 to-base-200/70 flex items-end justify-center">
                {getThumbnailSrc(scene.thumbnail) ? <img src={getThumbnailSrc(scene.thumbnail)!} alt={scene.title} className="h-full w-full object-cover" /> : <Clapperboard size={38} className="mb-4 text-base-content/50" />}
              </div>
              <div className="p-3 flex-1 min-h-0 flex flex-col">
                <p className="text-base font-semibold line-clamp-1">{scene.title || t('projectLibrary.sceneCardUntitled')}</p>
                {seriesNameMap.get(scene.series_id) ? <p className="mt-1 text-[11px] text-base-content/55 line-clamp-1">{seriesNameMap.get(scene.series_id)}</p> : null}
                <div className="mt-2 flex gap-1 text-xs text-base-content/65"><MapPin size={12} className="shrink-0 mt-0.5" /><span className="line-clamp-1">{[scene.location, scene.time].filter(Boolean).join(' · ') || '-'}</span></div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65"><Sparkles size={12} className="shrink-0 mt-0.5" /><span className="line-clamp-2 wrap-break-word">{scene.mood || '-'}</span></div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65"><ScrollText size={12} className="shrink-0 mt-0.5" /><span className="line-clamp-2 wrap-break-word">{scene.description || '-'}</span></div>

                <div className="mt-auto pt-3 border-t border-base-300 flex items-center justify-center gap-1">
                  {showAdvancedActions ? (
                    <button type="button" className="btn btn-xs btn-outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGenerateSceneImage(scene.id) }} disabled={sceneBusyId === scene.id || extractingFromScript || extractingRegenerate} title={t('projectLibrary.sceneGenerateImage')}><Sparkles size={12} /></button>
                  ) : null}
                  <button type="button" className="btn btn-xs btn-outline text-error border-error/40 hover:bg-error/10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteScene(scene.id, scene.title) }} disabled={sceneBusyId === scene.id} title={t('projectLibrary.delete')}><Trash2 size={12} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-base-content/35" aria-label={t('projectLibrary.close')} onClick={() => setCreateOpen(false)} />
          <article className="relative z-10 w-full max-w-5xl rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
            <div className="border-b border-base-300 bg-linear-to-r from-base-200/60 via-base-100 to-base-200/30 px-4 py-3 md:px-5 flex items-center justify-between">
              <h3 className="text-xl font-semibold">{editingSceneId ? t('projectLibrary.sceneEditTitle') : t('projectLibrary.sceneCreateTitle')}</h3>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setCreateOpen(false)}><X size={16} /></button>
            </div>
            <div className="p-4 md:p-5">
              <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] items-start gap-3">
                <aside className="self-start rounded-xl border border-base-300 bg-linear-to-br from-base-200/90 via-base-100 to-base-200/70 p-3 min-h-0 flex flex-col items-center justify-start gap-3">
                  {getThumbnailSrc(createDraft.thumbnail) ? <img src={getThumbnailSrc(createDraft.thumbnail)!} alt={createDraft.title || 'scene'} className="h-52 w-full rounded-lg object-cover" /> : <Clapperboard size={48} className="text-base-content/55" />}
                  <p className="text-sm font-medium text-center wrap-break-word">{createDraft.title.trim() || t('projectLibrary.sceneTitleLabel')}</p>
                  <div className="flex flex-col gap-2 w-full max-w-48">
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => createUploadInputRef.current?.click()} disabled={createUploading || createGenerating}><Upload size={14} />{createUploading ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterManualUpload')}</button>
                    {showSmartGenerate ? (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleSmartGenerate()} disabled={createUploading || createGenerating}><Sparkles size={14} />{createGenerating ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterSmartGenerate')}</button>
                    ) : null}
                    <input ref={createUploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleCreateUploadChange} />
                  </div>
                </aside>
                <div className="self-start grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
                  {seriesOptions && seriesOptions.length > 0 ? (
                    <label className="form-control flex flex-col items-start gap-1 md:col-span-2"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneSeriesLabel')}</span><select className="select select-bordered select-sm" value={createSeriesId} onChange={(e) => setCreateSeriesId(e.target.value)}><option value="">{t('projectLibrary.sceneSeriesPlaceholder')}</option>{seriesOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                  ) : null}
                  <label className="form-control flex flex-col items-start gap-1"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneTitleLabel')}</span><input className="input input-bordered input-sm" placeholder={t('projectLibrary.sceneTitlePlaceholder')} value={createDraft.title} onChange={(e) => setCreateDraft((p) => ({ ...p, title: e.target.value }))} /></label>
                  <label className="form-control flex flex-col items-start gap-1"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneLocationLabel')}</span><input className="input input-bordered input-sm" placeholder={t('projectLibrary.sceneLocationPlaceholder')} value={createDraft.location} onChange={(e) => setCreateDraft((p) => ({ ...p, location: e.target.value }))} /></label>
                  <label className="form-control flex flex-col items-start gap-1"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneTimeLabel')}</span><input className="input input-bordered input-sm" placeholder={t('projectLibrary.sceneTimePlaceholder')} value={createDraft.time} onChange={(e) => setCreateDraft((p) => ({ ...p, time: e.target.value }))} /></label>
                  <label className="form-control flex flex-col items-start gap-1"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneMoodLabel')}</span><input className="input input-bordered input-sm" placeholder={t('projectLibrary.sceneMoodPlaceholder')} value={createDraft.mood} onChange={(e) => setCreateDraft((p) => ({ ...p, mood: e.target.value }))} /></label>
                  <label className="form-control flex flex-col items-start gap-1 md:col-span-2"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneDescriptionLabel')}</span><textarea className="textarea textarea-bordered textarea-sm min-h-16" placeholder={t('projectLibrary.sceneDescriptionPlaceholder')} value={createDraft.description} onChange={(e) => setCreateDraft((p) => ({ ...p, description: e.target.value }))} /></label>
                  <label className="form-control flex flex-col items-start gap-1 md:col-span-2"><span className="text-sm font-medium text-base-content/75">{t('projectLibrary.sceneShotNotesLabel')}</span><textarea className="textarea textarea-bordered textarea-sm min-h-16" placeholder={t('projectLibrary.sceneShotNotesPlaceholder')} value={createDraft.shot_notes} onChange={(e) => setCreateDraft((p) => ({ ...p, shot_notes: e.target.value }))} /></label>
                </div>
              </div>
              {createError ? <p className="text-error text-xs mt-3">{createError}</p> : null}
            </div>
            <div className="border-t border-base-300 bg-base-100 px-5 py-3 md:px-6 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreateOpen(false)}>{t('projectLibrary.sceneCreateCancel')}</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateSubmit}>{editingSceneId ? t('projectLibrary.sceneUpdateConfirm') : t('projectLibrary.sceneCreateConfirm')}</button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
