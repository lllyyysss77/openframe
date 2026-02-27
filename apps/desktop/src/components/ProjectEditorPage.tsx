import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft, Check, ChevronsUpDown, Search } from 'lucide-react'
import { PROJECT_CATEGORIES } from '@openframe/shared'
import { projectsCollection } from '../db/projects_collection'
import { genresCollection } from '../db/genres_collection'
import { ThumbnailGeneratorField } from './ThumbnailGeneratorField'

const EMPTY_PROJECT = {
  name: '',
  video_ratio: '16:9' as '16:9' | '9:16',
  category: '',
  genre: '',
  thumbnail: '',
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

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('openframe-thumb://')) return value
  const normalized = value.startsWith('file://') ? value.slice(7) : value
  return `openframe-thumb://local?path=${encodeURIComponent(normalized)}`
}

interface GenrePickerModalProps {
  open: boolean
  genres: Array<{ id: string; name: string; code: string; description: string; prompt: string; thumbnail: string | null }>
  selectedGenreId: string
  onSelect: (genreId: string) => void
  onClose: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function GenrePickerModal({ open, genres, selectedGenreId, onSelect, onClose, t }: GenrePickerModalProps) {
  const [keyword, setKeyword] = useState('')
  const filteredGenres = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return genres
    return genres.filter((genre) => {
      const name = genre.name.toLowerCase()
      const code = genre.code.toLowerCase()
      return name.includes(q) || code.includes(q)
    })
  }, [genres, keyword])

  useEffect(() => {
    if (!open) setKeyword('')
  }, [open])

  if (!open) return null

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-5xl p-0 border border-base-300 shadow-2xl">
        <div className="px-6 py-5 border-b border-base-300 bg-linear-to-r from-base-200 to-base-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base leading-none">{t('projectLibrary.genrePickerTitle')}</h3>
              <p className="text-xs text-base-content/60 mt-2">{t('projectLibrary.genrePickerHint')}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('projectLibrary.close')}</button>
          </div>

          <label className="input input-bordered input-sm mt-4 w-full flex items-center gap-2 bg-base-100/90">
            <Search size={14} className="text-base-content/50" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('projectLibrary.genrePickerSearch')}
              className="grow"
            />
          </label>
        </div>

        <div className="max-h-[70vh] overflow-auto p-6">
          {genres.length === 0 ? (
            <div className="text-sm text-base-content/60">{t('projectLibrary.genrePickerEmpty')}</div>
          ) : filteredGenres.length === 0 ? (
            <div className="text-sm text-base-content/60">{t('projectLibrary.genrePickerNoResult')}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGenres.map((genre) => {
                const active = selectedGenreId === genre.id
                return (
                  <button
                    key={genre.id}
                    type="button"
                    className={`text-left rounded-xl border p-3 transition-all hover:-translate-y-0.5 ${active ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-md' : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:shadow-sm'}`}
                    onClick={() => {
                      onSelect(genre.id)
                      onClose()
                    }}
                  >
                    <div className="flex gap-3 items-start">
                      <div className="w-16 h-16 rounded-lg bg-base-200 overflow-hidden shrink-0 border border-base-300">
                        {getThumbnailSrc(genre.thumbnail) ? (
                          <img src={getThumbnailSrc(genre.thumbnail)!} alt={genre.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-linear-to-br from-base-200 to-base-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold leading-snug truncate">{genre.name}</div>
                          {active && (
                            <span className="badge badge-primary badge-sm gap-1 shrink-0">
                              <Check size={12} />
                              {t('projectLibrary.selected')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-base-content/50 mt-0.5">{genre.code}</div>
                        <div className="text-sm text-base-content/70 line-clamp-2 mt-1">{genre.description}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

function parseCategoryIds(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx)
}

export function ProjectEditorPage({ projectId }: { projectId?: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const { data: projectsList } = useLiveQuery(projectsCollection)
  const { data: genresList } = useLiveQuery(genresCollection)
  const searchProjectId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('projectId') ?? undefined
  }, [location.search])
  const currentProjectId = projectId ?? searchProjectId
  const isEdit = !!currentProjectId
  const target = useMemo(
    () => (projectsList ?? []).find((p) => p.id === currentProjectId),
    [projectsList, currentProjectId],
  )

  const [form, setForm] = useState(EMPTY_PROJECT)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [originalThumbnail, setOriginalThumbnail] = useState('')
  const [genrePickerOpen, setGenrePickerOpen] = useState(false)
  const localeKey: 'en' | 'cn' = i18n.language.startsWith('zh') ? 'cn' : 'en'
  const selectedCategoryIds = useMemo(() => parseCategoryIds(form.category), [form.category])
  const selectedGenre = useMemo(
    () => (genresList ?? []).find((genre) => genre.id === form.genre) ?? null,
    [genresList, form.genre],
  )

  function toggleCategory(id: string) {
    const current = new Set(selectedCategoryIds)
    if (current.has(id)) {
      current.delete(id)
    } else {
      current.add(id)
    }
    const ordered = PROJECT_CATEGORIES.map((c) => c.id).filter((cid) => current.has(cid))
    setForm((prev) => ({ ...prev, category: ordered.join(',') }))
  }

  useEffect(() => {
    if (!isEdit || !target) return
    setForm({
      name: target.name,
      video_ratio: target.video_ratio,
      category: target.category,
      genre: target.genre,
      thumbnail: target.thumbnail ?? '',
    })
    setOriginalThumbnail(target.thumbnail ?? '')
  }, [isEdit, target])

  async function handleSave() {
    const name = form.name.trim()
    const category = form.category.trim()
    const genre = form.genre.trim()

    if (!name || !category || !genre) {
      setError(t('projectLibrary.requiredError'))
      return
    }

    setSaving(true)
    setError('')
    try {
      let thumbnailPath = form.thumbnail
      if (pendingFile) {
        const ext = extFromMediaType(pendingFile.type) || pendingFile.name.split('.').pop()?.toLowerCase() || 'png'
        const buffer = await pendingFile.arrayBuffer()
        thumbnailPath = await window.thumbnailsAPI.save(new Uint8Array(buffer), ext)
        if (originalThumbnail && originalThumbnail !== thumbnailPath) {
          await window.thumbnailsAPI.delete(originalThumbnail)
        }
      } else if (!form.thumbnail && originalThumbnail) {
        await window.thumbnailsAPI.delete(originalThumbnail)
      }

      if (isEdit && currentProjectId) {
        projectsCollection.update(currentProjectId, (draft) => {
          draft.name = name
          draft.video_ratio = form.video_ratio
          draft.category = category
          draft.genre = genre
          draft.thumbnail = thumbnailPath || null
        })
      } else {
        projectsCollection.insert({
          id: crypto.randomUUID(),
          name,
          video_ratio: form.video_ratio,
          category,
          genre,
          series_count: 0,
          thumbnail: thumbnailPath || null,
          created_at: Date.now(),
        })
      }

      if (isEdit && currentProjectId) {
        navigate({ to: '/projects/$projectId', params: { projectId: currentProjectId } })
      } else {
        navigate({ to: '/projects' })
      }
    } catch {
      setError(t('projectLibrary.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && !projectsList) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl">Loading...</div>
      </main>
    )
  }

  if (isEdit && projectsList && !target) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl flex flex-col gap-3">
          <p className="text-sm text-base-content/60">{t('projectLibrary.notFound')}</p>
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ to: '/projects' })}>
              <ArrowLeft size={14} />
              {t('projectLibrary.backToList')}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold mb-1">{isEdit ? t('projectLibrary.edit') : t('projectLibrary.create')}</h1>
            <p className="text-base-content/60 text-sm">{t('projectLibrary.subtitle')}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-xs mb-2" onClick={() => navigate({ to: '/projects' })}>
            <ArrowLeft size={14} />
            {t('projectLibrary.backToList')}
          </button>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('projectLibrary.name')}</label>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder={t('projectLibrary.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('projectLibrary.videoRatio')}</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={form.video_ratio}
                  onChange={(e) => setForm({ ...form, video_ratio: e.target.value as '16:9' | '9:16' })}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('projectLibrary.category')}</label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-base-300 bg-base-200/30 p-3">
                  {PROJECT_CATEGORIES.map((item) => (
                    <label key={item.id} className="label cursor-pointer justify-start gap-2 py-0">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selectedCategoryIds.includes(item.id)}
                        onChange={() => toggleCategory(item.id)}
                      />
                      <span className="label-text text-sm">{item.locales[localeKey]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('projectLibrary.genre')}</label>
                <button
                  type="button"
                  className="w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-left transition-colors hover:border-base-content/30 hover:bg-base-200/40"
                  onClick={() => setGenrePickerOpen(true)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-base-200 border border-base-300 shrink-0">
                      {selectedGenre?.thumbnail && getThumbnailSrc(selectedGenre.thumbnail) ? (
                        <img src={getThumbnailSrc(selectedGenre.thumbnail)!} alt={selectedGenre.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-base-200 to-base-300" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {selectedGenre?.name ?? t('projectLibrary.genrePlaceholder')}
                      </div>
                      <div className="text-xs text-base-content/60 truncate">
                        {selectedGenre?.code ?? t('projectLibrary.genrePickerHint')}
                      </div>
                    </div>

                    <ChevronsUpDown size={14} className="text-base-content/50 shrink-0" />
                  </div>
                </button>
              </div>
            </div>

            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t('projectLibrary.thumbnail')}</label>
              <ThumbnailGeneratorField
                layout="vertical"
                savedPath={form.thumbnail}
                pendingFile={pendingFile}
                onPendingFileChange={setPendingFile}
                onSavedPathChange={(path) => setForm((prev) => ({ ...prev, thumbnail: path }))}
                buildPrompt={() => {
                  const name = form.name.trim()
                  const hasCategory = selectedCategoryIds.length > 0
                  const hasGenre = !!selectedGenre
                  const hasRatio = form.video_ratio === '16:9' || form.video_ratio === '9:16'

                  if (!name || !hasCategory || !hasGenre || !hasRatio) {
                    return { error: t('projectLibrary.thumbnailFieldsRequired') }
                  }

                  const categoryNames = selectedCategoryIds
                    .map((id) => PROJECT_CATEGORIES.find((item) => item.id === id)?.locales[localeKey] ?? id)
                    .join(', ')
                  const genreName = selectedGenre.name
                  const ratioHint = form.video_ratio === '9:16' ? 'vertical mobile frame' : 'cinematic wide frame'

                  return {
                    prompt: [
                      'Create a high-quality cinematic project thumbnail image.',
                      `Category: ${categoryNames}.`,
                      `Project name concept: ${name}.`,
                      `Style genre: ${genreName}.`,
                      `Aspect ratio: ${form.video_ratio}, ${ratioHint}.`,
                      'No text, no watermark, dramatic lighting, strong composition, highly detailed.',
                    ].join(' '),
                  }
                }}
                texts={{
                  placeholder: t('projectLibrary.thumbnailPlaceholder'),
                  modelEmpty: t('projectLibrary.thumbnailNoModel'),
                  generateButton: t('projectLibrary.thumbnailGenerate'),
                  generateError: t('projectLibrary.thumbnailGenerateError'),
                }}
              />
            </div>

            {error && <p className="text-error text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate({ to: '/projects' })} disabled={saving}>
                {t('projectLibrary.cancel')}
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving && <span className="loading loading-spinner loading-xs" />}
                {isEdit ? t('projectLibrary.update') : t('projectLibrary.create')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <GenrePickerModal
        open={genrePickerOpen}
        genres={genresList ?? []}
        selectedGenreId={form.genre}
        onSelect={(genreId) => setForm((prev) => ({ ...prev, genre: genreId }))}
        onClose={() => setGenrePickerOpen(false)}
        t={t}
      />
    </main>
  )
}
