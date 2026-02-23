import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { PencilLine, Trash2, ImageOff, Plus, Upload, X } from 'lucide-react'
import { genresCollection, type Genre } from '../db/genres_collection'

export const Route = createFileRoute('/genres')({
  component: ListPage,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_GENRE = { name: '', code: '', description: '', prompt: '', thumbnail: '' }

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value
  return `file://${value}`
}

// ── Thumbnail uploader ────────────────────────────────────────────────────────

interface ThumbnailUploaderProps {
  /** 已保存到磁盘的路径（DB 中存储的值） */
  savedPath: string
  /** 用户选择了但尚未上传的文件 */
  pendingFile: File | null
  onSelect: (file: File) => void
  onClear: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function ThumbnailUploader({ savedPath, pendingFile, onSelect, onClear, t }: ThumbnailUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onSelect(file)
  }

  const displaySrc = previewUrl ?? getThumbnailSrc(savedPath)

  return (
    <div
      className="relative w-full h-40 rounded-lg border-2 border-dashed border-base-300 cursor-pointer overflow-hidden hover:border-primary transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      {displaySrc ? (
        <>
          <img src={displaySrc} alt="thumbnail" className="w-full h-full object-cover" />
          <button
            className="absolute top-2 right-2 btn btn-circle btn-xs btn-neutral opacity-80 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onClear() }}
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-base-content/30 select-none">
          <Upload size={22} />
          <span className="text-xs">{t("styleLibrary.thumbnailPlaceholder")}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ── Genre modal ───────────────────────────────────────────────────────────────

interface GenreModalProps {
  open: boolean
  form: typeof EMPTY_GENRE
  onChange: (f: typeof EMPTY_GENRE) => void
  pendingFile: File | null
  onFileSelect: (file: File) => void
  onClearThumbnail: () => void
  editingId: string | null
  error: string
  saving: boolean
  onSave: () => void
  onClose: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function GenreModal({
  open, form, onChange, pendingFile, onFileSelect, onClearThumbnail,
  editingId, error, saving, onSave, onClose, t,
}: GenreModalProps) {
  if (!open) return null
  return (
    <dialog className="modal modal-open">
      <div className="modal-box w-3xl max-w-[92vw]">
        <h3 className="font-bold text-lg mb-4">
          {editingId ? t('styleLibrary.edit') : t('styleLibrary.create')}
        </h3>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t("styleLibrary.name")}</label>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder={t('styleLibrary.namePlaceholder')}
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t("styleLibrary.code")}</label>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder={t('styleLibrary.codePlaceholder')}
                value={form.code}
                onChange={(e) => onChange({ ...form, code: e.target.value })}
              />
            </div>
          </div>
          <div className="form-control">
            <label className="label label-text text-xs pb-1">{t("styleLibrary.description")}</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder={t('styleLibrary.descriptionPlaceholder')}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label label-text text-xs pb-1">{t("styleLibrary.prompt")}</label>
            <textarea
              className="textarea textarea-bordered textarea-sm w-full h-36 font-mono"
              placeholder={t('styleLibrary.promptPlaceholder')}
              value={form.prompt}
              onChange={(e) => onChange({ ...form, prompt: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label label-text text-xs pb-1">{t("styleLibrary.thumbnail")}</label>
            <ThumbnailUploader
              savedPath={form.thumbnail}
              pendingFile={pendingFile}
              onSelect={onFileSelect}
              onClear={onClearThumbnail}
              t={t}
            />
          </div>
        </div>
        {error && <p className="text-error text-xs mt-3">{error}</p>}
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            {t('styleLibrary.cancel')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
            {saving && <span className="loading loading-spinner loading-xs" />}
            {editingId ? t('styleLibrary.update') : t('styleLibrary.create')}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteDialog({ name, onConfirm, onCancel, t }: { name: string; onConfirm: () => void; onCancel: () => void; t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-sm">
        <p className="text-sm">{t("styleLibrary.deleteConfirm", { name })}</p>
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t("styleLibrary.cancel")}</button>
          <button className="btn btn-error btn-sm" onClick={onConfirm}>{t("styleLibrary.delete")}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </dialog>
  )
}

// ── Genre card ────────────────────────────────────────────────────────────────

interface GenreCardProps {
  genre: Genre
  onEdit: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function GenreCard({ genre, onEdit, onDelete, t }: GenreCardProps) {
  return (
    <div className="card bg-base-100 border border-base-300 hover:border-base-content/20 transition-colors">
      <figure className="h-36 bg-base-200 overflow-hidden rounded-t-box shrink-0">
        {getThumbnailSrc(genre.thumbnail) ? (
          <img src={getThumbnailSrc(genre.thumbnail)!} alt={genre.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base-content/20">
            <ImageOff size={32} />
          </div>
        )}
      </figure>
      <div className="card-body p-4 gap-2">
        <div>
          <h3 className="font-semibold leading-snug">{genre.name}</h3>
          <code className="text-xs text-base-content/50">{genre.code}</code>
        </div>
        {genre.description && (
          <p className="text-sm text-base-content/60 line-clamp-2">{genre.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-xs text-base-content/40">{formatDate(genre.created_at)}</span>
          <div className="flex gap-1">
            <button className="btn btn-ghost btn-xs" onClick={onEdit}>
              <PencilLine size={13} />
              {t('styleLibrary.edit')}
            </button>
            <button className="btn btn-ghost btn-xs text-error" onClick={onDelete}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ListPage() {
  const { t } = useTranslation()

  // ── Genre state
  const [genreModalOpen, setGenreModalOpen] = useState(false)
  const [genreForm, setGenreForm] = useState(EMPTY_GENRE)
  const [genreEditId, setGenreEditId] = useState<string | null>(null)
  const [genreError, setGenreError] = useState('')
  const [genreSaving, setGenreSaving] = useState(false)
  const [genreDeleteTarget, setGenreDeleteTarget] = useState<Genre | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [originalThumbnail, setOriginalThumbnail] = useState('')

  // ── Data
  const { data: genresList } = useLiveQuery(genresCollection)

  const genres = useMemo(
    () => [...(genresList ?? [])].sort((a, b) => b.created_at - a.created_at),
    [genresList],
  )

  // ── Genre handlers
  function openGenreCreate() {
    setGenreEditId(null)
    setGenreForm(EMPTY_GENRE)
    setPendingFile(null)
    setOriginalThumbnail('')
    setGenreError('')
    setGenreModalOpen(true)
  }

  function openGenreEdit(genre: Genre) {
    setGenreEditId(genre.id)
    setGenreForm({
      name: genre.name,
      code: genre.code,
      description: genre.description,
      prompt: genre.prompt,
      thumbnail: genre.thumbnail ?? '',
    })
    setPendingFile(null)
    setOriginalThumbnail(genre.thumbnail ?? '')
    setGenreError('')
    setGenreModalOpen(true)
  }

  function closeGenreModal() {
    setGenreModalOpen(false)
    setPendingFile(null)
    setGenreError('')
  }

  function handleClearThumbnail() {
    setPendingFile(null)
    setGenreForm((f) => ({ ...f, thumbnail: '' }))
  }

  async function handleGenreSave() {
    if (!genreForm.name.trim() || !genreForm.code.trim()) {
      setGenreError(t('styleLibrary.requiredError'))
      return
    }
    setGenreSaving(true)
    try {
      // 上传图片（如果有新选的文件）
      let thumbnailPath = genreForm.thumbnail
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const buffer = await pendingFile.arrayBuffer()
        thumbnailPath = await window.thumbnailsAPI.save(new Uint8Array(buffer), ext)
        // 替换旧图时删除旧文件
        if (originalThumbnail && originalThumbnail !== thumbnailPath) {
          await window.thumbnailsAPI.delete(originalThumbnail)
        }
      } else if (!genreForm.thumbnail && originalThumbnail) {
        // 用户清空了缩略图，删除旧文件
        await window.thumbnailsAPI.delete(originalThumbnail)
      }

      if (genreEditId) {
        genresCollection.update(genreEditId, (draft) => {
          draft.name = genreForm.name.trim()
          draft.code = genreForm.code.trim()
          draft.description = genreForm.description.trim()
          draft.prompt = genreForm.prompt.trim()
          draft.thumbnail = thumbnailPath || null
        })
      } else {
        genresCollection.insert({
          id: crypto.randomUUID(),
          name: genreForm.name.trim(),
          code: genreForm.code.trim(),
          description: genreForm.description.trim(),
          prompt: genreForm.prompt.trim(),
          thumbnail: thumbnailPath || null,
          created_at: Date.now(),
        })
      }
      closeGenreModal()
    } catch {
      setGenreError(t('styleLibrary.saveError'))
    } finally {
      setGenreSaving(false)
    }
  }

  function handleGenreDelete(genre: Genre) {
    try {
      genresCollection.delete(genre.id)
      if (genre.thumbnail) window.thumbnailsAPI.delete(genre.thumbnail)
    } catch { /* silent */ }
    setGenreDeleteTarget(null)
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("menu.list")}</h1>
          <p className="text-base-content/60 text-sm">{t("styleLibrary.subtitle")}</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={openGenreCreate}
        >
          <Plus size={15} />
          {t('styleLibrary.create')}
        </button>
      </div>

      {genres.length === 0 ? (
        <div className="text-center text-base-content/40 py-16 text-sm">{t("styleLibrary.empty")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {genres.map((genre) => (
            <GenreCard
              key={genre.id}
              genre={genre}
              onEdit={() => openGenreEdit(genre)}
              onDelete={() => setGenreDeleteTarget(genre)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <GenreModal
        open={genreModalOpen}
        form={genreForm}
        onChange={setGenreForm}
        pendingFile={pendingFile}
        onFileSelect={setPendingFile}
        onClearThumbnail={handleClearThumbnail}
        editingId={genreEditId}
        error={genreError}
        saving={genreSaving}
        onSave={handleGenreSave}
        onClose={closeGenreModal}
        t={t}
      />
      {genreDeleteTarget && (
        <DeleteDialog
          name={genreDeleteTarget.name}
          onConfirm={() => handleGenreDelete(genreDeleteTarget)}
          onCancel={() => setGenreDeleteTarget(null)}
          t={t}
        />
      )}
    </main>
  )
}
