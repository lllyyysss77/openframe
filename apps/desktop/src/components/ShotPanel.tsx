import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Clapperboard, PlusCircle, Sparkles, Trash2, X } from 'lucide-react'

type SceneOption = { id: string; title: string }
type CharacterOption = { id: string; name: string }

export type ShotDraft = {
  scene_id: string
  title: string
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
  character_ids: string[]
}

export type ShotCard = ShotDraft & {
  id: string
  series_id: string
  shot_index: number
  thumbnail: string | null
  production_first_frame: string | null
  production_last_frame: string | null
  production_video: string | null
  created_at: number
}

interface ShotPanelProps {
  shots: ShotCard[]
  scenes: SceneOption[]
  characters: CharacterOption[]
  generatingFromScript: boolean
  generatingAllImages: boolean
  generatingShotId: string | null
  onAddShot: (draft: ShotDraft) => void
  onUpdateShot: (id: string, draft: ShotDraft) => void
  onDeleteShot: (id: string, title: string) => void
  onGenerateFromScript: () => void
  onGenerateAllImages: () => void
  onGenerateSingleImage: (id: string) => void
}

const emptyDraft: ShotDraft = {
  scene_id: '',
  title: '',
  shot_size: '',
  camera_angle: '',
  camera_move: '',
  duration_sec: 3,
  action: '',
  dialogue: '',
  character_ids: [],
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function ShotPanel({
  shots,
  scenes,
  characters,
  generatingFromScript,
  generatingAllImages,
  generatingShotId,
  onAddShot,
  onUpdateShot,
  onDeleteShot,
  onGenerateFromScript,
  onGenerateAllImages,
  onGenerateSingleImage,
}: ShotPanelProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [previewShotId, setPreviewShotId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<ShotDraft>(emptyDraft)

  const previewShot = previewShotId ? shots.find((item) => item.id === previewShotId) ?? null : null

  const sceneNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const scene of scenes) map.set(scene.id, scene.title)
    return map
  }, [scenes])

  const characterNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of characters) map.set(c.id, c.name)
    return map
  }, [characters])

  function openCreate() {
    setEditingId(null)
    setDraft({ ...emptyDraft, scene_id: scenes[0]?.id ?? '' })
    setError('')
    setOpen(true)
  }

  function openEdit(card: ShotCard) {
    setEditingId(card.id)
    setDraft({
      scene_id: card.scene_id,
      title: card.title,
      shot_size: card.shot_size,
      camera_angle: card.camera_angle,
      camera_move: card.camera_move,
      duration_sec: card.duration_sec,
      action: card.action,
      dialogue: card.dialogue,
      character_ids: card.character_ids,
    })
    setError('')
    setOpen(true)
  }

  function submit() {
    if (!draft.scene_id) {
      setError(t('projectLibrary.shotSceneRequired'))
      return
    }
    if (!draft.title.trim()) {
      setError(t('projectLibrary.shotTitleRequired'))
      return
    }

    const payload: ShotDraft = {
      ...draft,
      title: draft.title.trim(),
      shot_size: draft.shot_size.trim(),
      camera_angle: draft.camera_angle.trim(),
      camera_move: draft.camera_move.trim(),
      action: draft.action.trim(),
      dialogue: draft.dialogue.trim(),
      duration_sec: Number.isFinite(draft.duration_sec) ? Math.max(1, draft.duration_sec) : 3,
    }

    if (editingId) onUpdateShot(editingId, payload)
    else onAddShot(payload)
    setOpen(false)
  }

  return (
    <section className="h-full rounded-2xl border border-base-300 bg-linear-to-br from-base-200/30 via-base-100 to-base-200/20 text-base-content p-4 md:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide">{t('projectLibrary.shotPanelTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-1">{t('projectLibrary.shotPanelSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onGenerateFromScript}
            disabled={generatingAllImages || generatingFromScript}
          >
            <Camera size={12} />
            {generatingFromScript ? t('projectLibrary.aiStreaming') : t('projectLibrary.shotGenerateFromScript')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onGenerateAllImages}
            disabled={generatingAllImages || generatingFromScript}
          >
            <Clapperboard size={12} />
            {generatingAllImages ? t('projectLibrary.aiStreaming') : t('projectLibrary.shotGenerateAllImages')}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap items-start gap-3 pr-2">
          <article className="w-64 h-80 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 flex flex-col items-center justify-center gap-3 text-base-content/75 cursor-pointer hover:border-primary/40 hover:bg-base-100 transition-colors" onClick={openCreate}>
            <PlusCircle size={24} className="text-base-content/55" />
            <p className="text-sm font-medium">{t('projectLibrary.shotSetup')}</p>
          </article>

          {shots.map((shot) => (
            <article key={shot.id} className="w-64 h-80 shrink-0 rounded-xl border border-base-300 bg-base-100 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(shot)}>
              <button
                type="button"
                className="h-28 border-b border-base-300 bg-linear-to-b from-base-200 via-base-100 to-base-200/70 flex items-center justify-center w-full"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (shot.thumbnail) setPreviewShotId(shot.id)
                }}
              >
                {getThumbnailSrc(shot.thumbnail) ? (
                  <img src={getThumbnailSrc(shot.thumbnail)!} alt={shot.title} className="h-full w-full object-cover" />
                ) : (
                  <Clapperboard size={28} className="text-base-content/60" />
                )}
              </button>
              <div className="p-3 flex-1 min-h-0 flex flex-col">
                <p className="text-sm font-semibold line-clamp-1">#{shot.shot_index} {shot.title}</p>
                <p className="mt-1 text-xs text-base-content/65 line-clamp-1">{sceneNameMap.get(shot.scene_id) || t('projectLibrary.sceneCardUntitled')}</p>
                <p className="mt-2 text-xs text-base-content/65 line-clamp-1">{[shot.shot_size, shot.camera_angle, shot.camera_move].filter(Boolean).join(' · ') || '-'}</p>
                <p className="mt-2 text-xs text-base-content/65 line-clamp-2">{shot.action || '-'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {shot.character_ids.slice(0, 3).map((id) => (
                    <span key={id} className="badge badge-sm badge-outline">{characterNameMap.get(id) || '?'}</span>
                  ))}
                </div>
                <div className="mt-auto pt-3 border-t border-base-300 flex justify-center gap-1">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onGenerateSingleImage(shot.id)
                    }}
                    disabled={generatingFromScript || generatingAllImages || generatingShotId === shot.id}
                    title={t('projectLibrary.shotGenerateSingleImage')}
                  >
                    <Sparkles size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline text-error border-error/40 hover:bg-error/10"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteShot(shot.id, shot.title)
                    }}
                    title={t('projectLibrary.delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-base-content/35" onClick={() => setOpen(false)} />
          <article className="relative z-10 w-full max-w-3xl rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
            <div className="border-b border-base-300 bg-base-100 px-5 py-4 md:px-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold">{editingId ? t('projectLibrary.shotEditTitle') : t('projectLibrary.shotCreateTitle')}</h3>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="p-5 md:p-6 max-h-[70vh] overflow-auto grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotSceneLabel')}</span>
                <select className="select select-bordered w-full" value={draft.scene_id} onChange={(e) => setDraft((p) => ({ ...p, scene_id: e.target.value }))}>
                  <option value="">{t('projectLibrary.shotScenePlaceholder')}</option>
                  {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title || t('projectLibrary.sceneCardUntitled')}</option>)}
                </select>
              </label>

              <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotTitleLabel')}</span>
                <input className="input input-bordered w-full" placeholder={t('projectLibrary.shotTitlePlaceholder')} value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotSizeLabel')}</span>
                <input className="input input-bordered w-full" placeholder={t('projectLibrary.shotSizePlaceholder')} value={draft.shot_size} onChange={(e) => setDraft((p) => ({ ...p, shot_size: e.target.value }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotDurationLabel')}</span>
                <input type="number" min={1} className="input input-bordered w-full" value={draft.duration_sec} onChange={(e) => setDraft((p) => ({ ...p, duration_sec: Number(e.target.value || 1) }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotAngleLabel')}</span>
                <input className="input input-bordered w-full" placeholder={t('projectLibrary.shotAnglePlaceholder')} value={draft.camera_angle} onChange={(e) => setDraft((p) => ({ ...p, camera_angle: e.target.value }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotMoveLabel')}</span>
                <input className="input input-bordered w-full" placeholder={t('projectLibrary.shotMovePlaceholder')} value={draft.camera_move} onChange={(e) => setDraft((p) => ({ ...p, camera_move: e.target.value }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotActionLabel')}</span>
                <textarea className="textarea textarea-bordered min-h-20 w-full" placeholder={t('projectLibrary.shotActionPlaceholder')} value={draft.action} onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value }))} />
              </label>

              <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotDialogueLabel')}</span>
                <textarea className="textarea textarea-bordered min-h-20 w-full" placeholder={t('projectLibrary.shotDialoguePlaceholder')} value={draft.dialogue} onChange={(e) => setDraft((p) => ({ ...p, dialogue: e.target.value }))} />
              </label>

              <div className="form-control flex flex-col items-start gap-1 md:col-span-2">
                <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.shotCharactersLabel')}</span>
                <div className="w-full rounded-lg border border-base-300 p-2 max-h-40 overflow-auto flex flex-wrap gap-2">
                  {characters.map((c) => {
                    const checked = draft.character_ids.includes(c.id)
                    return (
                      <label key={c.id} className="label cursor-pointer gap-2 rounded-md border border-base-300 px-2 py-1">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={checked}
                          onChange={(e) => {
                            setDraft((p) => ({
                              ...p,
                              character_ids: e.target.checked ? [...p.character_ids, c.id] : p.character_ids.filter((id) => id !== c.id),
                            }))
                          }}
                        />
                        <span className="text-xs">{c.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {error ? <p className="text-error text-xs md:col-span-2">{error}</p> : null}
            </div>

            <div className="border-t border-base-300 bg-base-100 px-5 py-3 md:px-6 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>{t('projectLibrary.shotCreateCancel')}</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={submit}>{editingId ? t('projectLibrary.shotUpdateConfirm') : t('projectLibrary.shotCreateConfirm')}</button>
            </div>
          </article>
        </div>
      ) : null}

      {previewShot && getThumbnailSrc(previewShot.thumbnail) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-base-content/70"
            aria-label={t('projectLibrary.close')}
            onClick={() => setPreviewShotId(null)}
          />
          <article className="relative z-10 w-full max-w-6xl rounded-xl border border-base-300 bg-base-100 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-base-300">
              <p className="text-sm font-medium line-clamp-1">{previewShot.title || t('projectLibrary.shotCardUntitled')}</p>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setPreviewShotId(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="bg-black/80 max-h-[80vh] overflow-auto flex items-center justify-center p-4">
              <img
                src={getThumbnailSrc(previewShot.thumbnail)!}
                alt={previewShot.title || t('projectLibrary.shotCardUntitled')}
                className="max-w-full h-auto object-contain rounded"
              />
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
