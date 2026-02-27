import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Package2, PlusCircle, RefreshCw, ScrollText, Sparkles, Tag, Trash2, Upload, X } from 'lucide-react'
import type { Prop } from '../db/props_collection'

type CreatePropDraft = {
  name: string
  category: string
  description: string
  thumbnail: string | null
}

export type { CreatePropDraft }

interface PropPanelProps {
  props: Prop[]
  extractingFromScript?: boolean
  extractingRegenerate?: boolean
  propBusyId?: string | null
  showAdvancedActions?: boolean
  currentSeriesOnly?: boolean
  onToggleCurrentSeriesOnly?: (next: boolean) => void
  onAddProp: (draft: CreatePropDraft) => void
  onUpdateProp: (id: string, draft: CreatePropDraft) => void
  onDeleteProp: (id: string, name: string) => void
  onExtractFromScript?: () => void
  onRegenerateFromScript?: () => void
  onGenerateTurnaround?: (id: string) => void
  onGenerateAllImages?: () => void
  generatingAllImages?: boolean
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function PropPanel({
  props,
  extractingFromScript = false,
  extractingRegenerate = false,
  propBusyId = null,
  showAdvancedActions = false,
  currentSeriesOnly = false,
  onToggleCurrentSeriesOnly,
  onAddProp,
  onUpdateProp,
  onDeleteProp,
  onExtractFromScript,
  onRegenerateFromScript,
  onGenerateTurnaround,
  onGenerateAllImages,
  generatingAllImages = false,
}: PropPanelProps) {
  const { t } = useTranslation()
  const [editingPropId, setEditingPropId] = useState<string | null>(null)
  const [previewPropId, setPreviewPropId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createUploading, setCreateUploading] = useState(false)
  const createUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createDraft, setCreateDraft] = useState<CreatePropDraft>({
    name: '',
    category: '',
    description: '',
    thumbnail: null,
  })

  const editingProp = editingPropId
    ? props.find((item) => item.id === editingPropId) ?? null
    : null
  const previewProp = previewPropId
    ? props.find((item) => item.id === previewPropId) ?? null
    : null

  function handleOpenCreate() {
    setEditingPropId(null)
    setCreateError('')
    setCreateDraft({
      name: '',
      category: '',
      description: '',
      thumbnail: null,
    })
    setCreateOpen(true)
  }

  function handleOpenEdit(prop: Prop) {
    setEditingPropId(prop.id)
    setCreateError('')
    setCreateDraft({
      name: prop.name,
      category: prop.category,
      description: prop.description,
      thumbnail: prop.thumbnail,
    })
    setCreateOpen(true)
  }

  function extFromFile(file: File): string {
    const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
    if (fromName) return fromName
    if (file.type === 'image/jpeg') return 'jpg'
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/webp') return 'webp'
    if (file.type === 'image/gif') return 'gif'
    if (file.type === 'image/bmp') return 'bmp'
    if (file.type === 'image/avif') return 'avif'
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
    if (!createDraft.name.trim()) {
      setCreateError(t('projectLibrary.propNameRequired'))
      return
    }

    const payload = {
      name: createDraft.name.trim(),
      category: createDraft.category.trim(),
      description: createDraft.description.trim(),
      thumbnail: createDraft.thumbnail,
    }

    if (editingPropId) {
      onUpdateProp(editingPropId, payload)
    } else {
      onAddProp(payload)
    }

    setCreateOpen(false)
  }

  return (
    <section className="h-full rounded-2xl border border-base-300 bg-linear-to-br from-base-200/30 via-base-100 to-base-200/20 text-base-content p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide">{t('projectLibrary.propPanelTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-1">{t('projectLibrary.propPanelSubtitle')}</p>
        </div>

        {showAdvancedActions ? (
          <div className="flex items-center gap-3">
            {onToggleCurrentSeriesOnly ? (
              <label className="inline-flex items-center gap-1.5 text-xs text-base-content/70 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={currentSeriesOnly}
                  onChange={(event) => onToggleCurrentSeriesOnly(event.target.checked)}
                />
                {t('projectLibrary.propCurrentSeriesOnly')}
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onExtractFromScript}
              disabled={extractingFromScript || extractingRegenerate}
            >
              <FolderOpen size={12} />
              {extractingFromScript ? t('projectLibrary.aiStreaming') : t('projectLibrary.propFromDraft')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onRegenerateFromScript}
              disabled={extractingFromScript || extractingRegenerate}
            >
              <RefreshCw size={12} />
              {extractingRegenerate ? t('projectLibrary.aiStreaming') : t('projectLibrary.propRegenerate')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onGenerateAllImages}
              disabled={extractingFromScript || extractingRegenerate || generatingAllImages || propBusyId !== null}
            >
              <Sparkles size={12} />
              {generatingAllImages ? t('projectLibrary.aiStreaming') : t('projectLibrary.propGenerateAllImages')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap items-start gap-3 pr-2">
          <article
            className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 flex flex-col items-center justify-center gap-3 text-base-content/75 cursor-pointer hover:border-primary/40 hover:bg-base-100 transition-colors"
            onClick={handleOpenCreate}
          >
            <PlusCircle size={24} className="text-base-content/55" />
            <p className="text-sm font-medium">{t('projectLibrary.propSetup')}</p>
            <p className="text-xs text-base-content/55">{t('projectLibrary.propEmptyHint')}</p>
          </article>

          {props.length === 0 ? (
            <article className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 p-4 flex items-center justify-center text-center text-sm text-base-content/60">
              {t('projectLibrary.emptyProps')}
            </article>
          ) : null}

          {props.map((card) => (
            <article
              key={card.id}
              className="w-56 h-105 shrink-0 rounded-xl border border-base-300 bg-base-100 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleOpenEdit(card)}
            >
              <button
                type="button"
                className="h-40 border-b border-base-300 bg-linear-to-b from-base-200 via-base-100 to-base-200/70 flex items-end justify-center w-full"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (card.thumbnail) setPreviewPropId(card.id)
                }}
              >
                {getThumbnailSrc(card.thumbnail) ? (
                  <img src={getThumbnailSrc(card.thumbnail)!} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <Package2 size={40} className="mb-4 text-base-content/50" />
                )}
              </button>

              <div className="p-3 flex-1 min-h-0 flex flex-col">
                <p className="text-base font-semibold line-clamp-1">{card.name || t('projectLibrary.propDefaultName')}</p>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <Tag size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-1 overflow-hidden text-ellipsis wrap-break-word">{card.category || '-'}</span>
                </div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <ScrollText size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-3 overflow-hidden text-ellipsis wrap-break-word">{card.description || '-'}</span>
                </div>

                <div className="mt-auto pt-3 border-t border-base-300 flex items-center justify-center gap-1">
                  {showAdvancedActions ? (
                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onGenerateTurnaround?.(card.id)
                      }}
                      disabled={propBusyId === card.id || extractingFromScript || extractingRegenerate}
                      title={t('projectLibrary.propGenerateTurnaround')}
                    >
                      <Sparkles size={12} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-xs btn-outline text-error border-error/40 hover:bg-error/10"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteProp(card.id, card.name)
                    }}
                    disabled={propBusyId === card.id}
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

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-base-content/35"
            aria-label={t('projectLibrary.close')}
            onClick={() => setCreateOpen(false)}
          />
          <article className="relative z-10 w-full max-w-4xl rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
            <div className="border-b border-base-300 bg-linear-to-r from-base-200/60 via-base-100 to-base-200/30 px-4 py-3 md:px-5 flex items-center justify-between">
              <h3 className="text-xl font-semibold">{editingProp ? t('projectLibrary.propEditTitle') : t('projectLibrary.propCreateTitle')}</h3>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-4 md:p-5">
              <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] items-start gap-3">
                <aside className="self-start rounded-xl border border-base-300 bg-linear-to-br from-base-200/90 via-base-100 to-base-200/70 p-3 min-h-0 flex flex-col items-center justify-start gap-3">
                  {getThumbnailSrc(createDraft.thumbnail) ? (
                    <img src={getThumbnailSrc(createDraft.thumbnail)!} alt={createDraft.name || 'prop'} className="h-52 w-full rounded-lg object-cover" />
                  ) : (
                    <Package2 size={48} className="text-base-content/55" />
                  )}

                  <p className="text-sm font-medium text-center wrap-break-word">
                    {createDraft.name.trim() || t('projectLibrary.propNameLabel')}
                  </p>

                  <div className="flex flex-col gap-2 w-full max-w-48">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => createUploadInputRef.current?.click()}
                      disabled={createUploading}
                    >
                      <Upload size={14} />
                      {createUploading ? t('projectLibrary.aiStreaming') : t('projectLibrary.propManualUpload')}
                    </button>
                    <input ref={createUploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleCreateUploadChange} />
                  </div>
                </aside>

                <div className="self-start grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.propNameLabel')}</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder={t('projectLibrary.propNamePlaceholder')}
                      value={createDraft.name}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>

                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.propCategoryLabel')}</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder={t('projectLibrary.propCategoryPlaceholder')}
                      value={createDraft.category}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, category: event.target.value }))}
                    />
                  </label>

                  <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.propDescriptionLabel')}</span>
                    <textarea
                      className="textarea textarea-bordered textarea-sm min-h-24"
                      placeholder={t('projectLibrary.propDescriptionPlaceholder')}
                      value={createDraft.description}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                </div>
              </div>

              {createError ? <p className="text-error text-xs mt-3">{createError}</p> : null}
            </div>

            <div className="border-t border-base-300 bg-base-100 px-5 py-3 md:px-6 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreateOpen(false)}>
                {t('projectLibrary.propCreateCancel')}
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateSubmit}>
                {editingProp ? t('projectLibrary.propUpdateConfirm') : t('projectLibrary.propCreateConfirm')}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {previewProp && getThumbnailSrc(previewProp.thumbnail) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-base-content/70"
            aria-label={t('projectLibrary.close')}
            onClick={() => setPreviewPropId(null)}
          />
          <article className="relative z-10 w-full max-w-6xl rounded-xl border border-base-300 bg-base-100 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-base-300">
              <p className="text-sm font-medium line-clamp-1">{previewProp.name || t('projectLibrary.propDefaultName')}</p>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setPreviewPropId(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="bg-black/80 max-h-[80vh] overflow-auto flex items-center justify-center p-4">
              <img
                src={getThumbnailSrc(previewProp.thumbnail)!}
                alt={previewProp.name || t('projectLibrary.propDefaultName')}
                className="max-w-full h-auto object-contain rounded"
              />
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
