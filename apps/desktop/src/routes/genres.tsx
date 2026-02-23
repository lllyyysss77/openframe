import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { PencilLine, Trash2, ImageOff, Plus, Upload, X } from 'lucide-react'
import { genresCollection, type Genre } from '../db/genres_collection'
import { categoriesCollection, type Category } from '../db/categories_collection'

export const Route = createFileRoute('/genres')({
  component: ListPage,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_GENRE = { name: '', code: '', description: '', thumbnail: '', category_id: '' }
const EMPTY_CAT = { name: '', code: '' }

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
  categories: Category[]
  editingId: string | null
  error: string
  saving: boolean
  onSave: () => void
  onClose: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function GenreModal({
  open, form, onChange, pendingFile, onFileSelect, onClearThumbnail,
  categories, editingId, error, saving, onSave, onClose, t,
}: GenreModalProps) {
  if (!open) return null
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
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
            <label className="label label-text text-xs pb-1">{t("styleLibrary.category")}</label>
            <select
              className="select select-bordered select-sm w-full"
              value={form.category_id}
              onChange={(e) => onChange({ ...form, category_id: e.target.value })}
            >
              <option value="">{t("styleLibrary.categoryPlaceholder")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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

// ── Category modal ────────────────────────────────────────────────────────────

interface CatModalProps {
  open: boolean
  form: typeof EMPTY_CAT
  onChange: (f: typeof EMPTY_CAT) => void
  editingId: string | null
  error: string
  onSave: () => void
  onClose: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function CatModal({ open, form, onChange, editingId, error, onSave, onClose, t }: CatModalProps) {
  if (!open) return null
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-lg mb-4">
          {editingId ? t('styleLibrary.edit') : t('styleLibrary.create')}
        </h3>
        <div className="flex flex-col gap-3">
          <div className="form-control">
            <label className="label label-text text-xs pb-1">{t("styleLibrary.name")}</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder={t('styleLibrary.categoryNamePlaceholder')}
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label label-text text-xs pb-1">{t("styleLibrary.code")}</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder={t('styleLibrary.categoryCodePlaceholder')}
              value={form.code}
              onChange={(e) => onChange({ ...form, code: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-error text-xs mt-3">{error}</p>}
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t("styleLibrary.cancel")}</button>
          <button className="btn btn-primary btn-sm" onClick={onSave}>
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
  categoryName: string | undefined
  onEdit: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function GenreCard({ genre, categoryName, onEdit, onDelete, t }: GenreCardProps) {
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
        {categoryName && (
          <span className="badge badge-ghost badge-sm w-fit">{categoryName}</span>
        )}
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

// ── Category card ─────────────────────────────────────────────────────────────

interface CatCardProps {
  cat: Category
  onEdit: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function CatCard({ cat, onEdit, onDelete, t }: CatCardProps) {
  return (
    <div className="card bg-base-100 border border-base-300 hover:border-base-content/20 transition-colors">
      <div className="card-body p-4 gap-1">
        <h3 className="font-semibold">{cat.name}</h3>
        <code className="text-xs text-base-content/50">{cat.code}</code>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-base-content/40">{formatDate(cat.created_at)}</span>
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
  const [tab, setTab] = useState<'genres' | 'categories'>('genres')

  // ── Genre state
  const [genreModalOpen, setGenreModalOpen] = useState(false)
  const [genreForm, setGenreForm] = useState(EMPTY_GENRE)
  const [genreEditId, setGenreEditId] = useState<string | null>(null)
  const [genreError, setGenreError] = useState('')
  const [genreSaving, setGenreSaving] = useState(false)
  const [genreDeleteTarget, setGenreDeleteTarget] = useState<Genre | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [originalThumbnail, setOriginalThumbnail] = useState('')

  // ── Category state
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catForm, setCatForm] = useState(EMPTY_CAT)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catError, setCatError] = useState('')
  const [catDeleteTarget, setCatDeleteTarget] = useState<Category | null>(null)

  // ── Data
  const { data: genresList } = useLiveQuery(genresCollection)
  const { data: categoriesList } = useLiveQuery(categoriesCollection)

  const genres = useMemo(
    () => [...(genresList ?? [])].sort((a, b) => b.created_at - a.created_at),
    [genresList],
  )
  const categories = useMemo(
    () => [...(categoriesList ?? [])].sort((a, b) => b.created_at - a.created_at),
    [categoriesList],
  )
  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
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
      thumbnail: genre.thumbnail ?? '',
      category_id: genre.category_id ?? '',
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
          draft.thumbnail = thumbnailPath || null
          draft.category_id = genreForm.category_id || null
        })
      } else {
        genresCollection.insert({
          id: crypto.randomUUID(),
          name: genreForm.name.trim(),
          code: genreForm.code.trim(),
          description: genreForm.description.trim(),
          thumbnail: thumbnailPath || null,
          category_id: genreForm.category_id || null,
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

  // ── Category handlers
  function openCatCreate() {
    setCatEditId(null)
    setCatForm(EMPTY_CAT)
    setCatError('')
    setCatModalOpen(true)
  }

  function openCatEdit(cat: Category) {
    setCatEditId(cat.id)
    setCatForm({ name: cat.name, code: cat.code })
    setCatError('')
    setCatModalOpen(true)
  }

  function closeCatModal() {
    setCatModalOpen(false)
    setCatError('')
  }

  function handleCatSave() {
    if (!catForm.name.trim() || !catForm.code.trim()) {
      setCatError(t('styleLibrary.requiredError'))
      return
    }
    try {
      if (catEditId) {
        categoriesCollection.update(catEditId, (draft) => {
          draft.name = catForm.name.trim()
          draft.code = catForm.code.trim()
        })
      } else {
        categoriesCollection.insert({
          id: crypto.randomUUID(),
          name: catForm.name.trim(),
          code: catForm.code.trim(),
          created_at: Date.now(),
        })
      }
      closeCatModal()
    } catch {
      setCatError(t('styleLibrary.saveError'))
    }
  }

  function handleCatDelete(cat: Category) {
    try { categoriesCollection.delete(cat.id) } catch { /* silent */ }
    setCatDeleteTarget(null)
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
          onClick={tab === 'genres' ? openGenreCreate : openCatCreate}
        >
          <Plus size={15} />
          {t('styleLibrary.create')}
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-border mb-6">
        <button
          role="tab"
          className={`tab ${tab === `genres` ? `tab-active` : ``}`}
          onClick={() => setTab('genres')}
        >
          {t('styleLibrary.genres')}
        </button>
        <button
          role="tab"
          className={`tab ${tab === `categories` ? `tab-active` : ``}`}
          onClick={() => setTab('categories')}
        >
          {t('styleLibrary.categories')}
        </button>
      </div>

      {/* ── Genres tab ── */}
      {tab === 'genres' && (
        genres.length === 0 ? (
          <div className="text-center text-base-content/40 py-16 text-sm">{t("styleLibrary.empty")}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {genres.map((genre) => (
              <GenreCard
                key={genre.id}
                genre={genre}
                categoryName={genre.category_id ? categoryMap[genre.category_id] : undefined}
                onEdit={() => openGenreEdit(genre)}
                onDelete={() => setGenreDeleteTarget(genre)}
                t={t}
              />
            ))}
          </div>
        )
      )}

      {/* ── Categories tab ── */}
      {tab === 'categories' && (
        categories.length === 0 ? (
          <div className="text-center text-base-content/40 py-16 text-sm">{t("styleLibrary.emptyCat")}</div>
        ) : (
          <div className="grid grid-cols-3 gap-4 xl:grid-cols-4 2xl:grid-cols-5">
            {categories.map((cat) => (
              <CatCard
                key={cat.id}
                cat={cat}
                onEdit={() => openCatEdit(cat)}
                onDelete={() => setCatDeleteTarget(cat)}
                t={t}
              />
            ))}
          </div>
        )
      )}

      {/* Modals */}
      <GenreModal
        open={genreModalOpen}
        form={genreForm}
        onChange={setGenreForm}
        pendingFile={pendingFile}
        onFileSelect={setPendingFile}
        onClearThumbnail={handleClearThumbnail}
        categories={categories}
        editingId={genreEditId}
        error={genreError}
        saving={genreSaving}
        onSave={handleGenreSave}
        onClose={closeGenreModal}
        t={t}
      />
      <CatModal
        open={catModalOpen}
        form={catForm}
        onChange={setCatForm}
        editingId={catEditId}
        error={catError}
        onSave={handleCatSave}
        onClose={closeCatModal}
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
      {catDeleteTarget && (
        <DeleteDialog
          name={catDeleteTarget.name}
          onConfirm={() => handleCatDelete(catDeleteTarget)}
          onCancel={() => setCatDeleteTarget(null)}
          t={t}
        />
      )}
    </main>
  )
}
