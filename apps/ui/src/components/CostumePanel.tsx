import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Package2, PlusCircle, ScrollText, Sparkles, Tag, Trash2, Upload, User, X } from 'lucide-react'
import type { Costume } from '../db/costumes_collection'

type CharacterOption = {
  id: string
  name: string
}

type CreateCostumeDraft = {
  name: string
  category: string
  description: string
  character_ids: string[]
  thumbnail: string | null
}

export type { CreateCostumeDraft }

interface CostumePanelProps {
  costumes: Costume[]
  characters: CharacterOption[]
  panelTitle?: string
  panelSubtitle?: string
  fixedCharacterId?: string | null
  showSmartGenerate?: boolean
  extractingFromScript?: boolean
  extractingRegenerate?: boolean
  costumeBusyId?: string | null
  showAdvancedActions?: boolean
  currentSeriesOnly?: boolean
  onToggleCurrentSeriesOnly?: (next: boolean) => void
  onAddCostume: (draft: CreateCostumeDraft) => void
  onUpdateCostume: (id: string, draft: CreateCostumeDraft) => void
  onDeleteCostume: (id: string, name: string) => void
  onSmartGenerateCostume?: (
    draft: CreateCostumeDraft,
  ) => Promise<{ ok: true; draft: CreateCostumeDraft } | { ok: false; error: string }>
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

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export function CostumePanel({
  costumes,
  characters,
  panelTitle,
  panelSubtitle,
  fixedCharacterId = null,
  showSmartGenerate = true,
  extractingFromScript = false,
  extractingRegenerate = false,
  costumeBusyId = null,
  showAdvancedActions = false,
  currentSeriesOnly = false,
  onToggleCurrentSeriesOnly,
  onAddCostume,
  onUpdateCostume,
  onDeleteCostume,
  onSmartGenerateCostume,
  onGenerateTurnaround,
  onGenerateAllImages,
  generatingAllImages = false,
}: CostumePanelProps) {
  const { t } = useTranslation()
  const [editingCostumeId, setEditingCostumeId] = useState<string | null>(null)
  const [previewCostumeId, setPreviewCostumeId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'basic' | 'characters'>('basic')
  const [createError, setCreateError] = useState('')
  const [createUploading, setCreateUploading] = useState(false)
  const [createGenerating, setCreateGenerating] = useState(false)
  const createUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createDraft, setCreateDraft] = useState<CreateCostumeDraft>({
    name: '',
    category: '',
    description: '',
    character_ids: [],
    thumbnail: null,
  })

  const characterNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const character of characters) {
      map.set(character.id, character.name)
    }
    return map
  }, [characters])
  const isCharacterScoped = Boolean(fixedCharacterId)
  const fixedCharacter = useMemo(
    () => (fixedCharacterId ? characters.find((item) => item.id === fixedCharacterId) ?? null : null),
    [characters, fixedCharacterId],
  )

  const editingCostume = editingCostumeId
    ? costumes.find((item) => item.id === editingCostumeId) ?? null
    : null
  const previewCostume = previewCostumeId
    ? costumes.find((item) => item.id === previewCostumeId) ?? null
    : null

  function applyFixedCharacter(ids: string[]): string[] {
    if (!fixedCharacterId) return normalizeIds(ids)
    return normalizeIds([fixedCharacterId, ...ids])
  }

  function handleOpenCreate() {
    setEditingCostumeId(null)
    setCreateTab('basic')
    setCreateError('')
    setCreateDraft({
      name: '',
      category: '',
      description: '',
      character_ids: fixedCharacterId ? [fixedCharacterId] : [],
      thumbnail: null,
    })
    setCreateOpen(true)
  }

  function handleOpenEdit(costume: Costume) {
    setEditingCostumeId(costume.id)
    setCreateTab('basic')
    setCreateError('')
    setCreateDraft({
      name: costume.name,
      category: costume.category,
      description: costume.description,
      character_ids: applyFixedCharacter(costume.character_ids),
      thumbnail: costume.thumbnail,
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

  function toggleCharacter(characterId: string) {
    if (fixedCharacterId) return
    setCreateDraft((prev) => {
      const exists = prev.character_ids.includes(characterId)
      if (exists) {
        return {
          ...prev,
          character_ids: prev.character_ids.filter((id) => id !== characterId),
        }
      }
      return {
        ...prev,
        character_ids: [...prev.character_ids, characterId],
      }
    })
  }

  function handleCreateSubmit() {
    if (!createDraft.name.trim()) {
      setCreateError(t('projectLibrary.costumeNameRequired'))
      return
    }
    const characterIds = applyFixedCharacter(createDraft.character_ids)
    if (characterIds.length === 0) {
      setCreateError(t('projectLibrary.costumeCharacterRequired'))
      return
    }

    const payload = {
      name: createDraft.name.trim(),
      category: createDraft.category.trim(),
      description: createDraft.description.trim(),
      character_ids: characterIds,
      thumbnail: createDraft.thumbnail,
    }

    if (editingCostumeId) {
      onUpdateCostume(editingCostumeId, payload)
    } else {
      onAddCostume(payload)
    }

    setCreateOpen(false)
  }

  async function handleSmartGenerate() {
    if (!onSmartGenerateCostume) return
    if (!createDraft.name.trim()) {
      setCreateError(t('projectLibrary.costumeNameRequired'))
      return
    }

    setCreateGenerating(true)
    setCreateError('')
    try {
      const result = await onSmartGenerateCostume({
        ...createDraft,
        character_ids: applyFixedCharacter(createDraft.character_ids),
      })
      if (!result.ok) {
        setCreateError(result.error)
        return
      }
      setCreateDraft({
        ...result.draft,
        character_ids: applyFixedCharacter(result.draft.character_ids),
      })
    } finally {
      setCreateGenerating(false)
    }
  }

  return (
    <section className="h-full rounded-2xl border border-base-300 bg-linear-to-br from-base-200/30 via-base-100 to-base-200/20 text-base-content p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide">{panelTitle || t('projectLibrary.costumePanelTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-1">{panelSubtitle || t('projectLibrary.costumePanelSubtitle')}</p>
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
                {t('projectLibrary.costumeCurrentSeriesOnly')}
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onGenerateAllImages}
              disabled={extractingFromScript || extractingRegenerate || generatingAllImages || costumeBusyId !== null}
            >
              <Sparkles size={12} />
              {generatingAllImages ? t('projectLibrary.aiStreaming') : t('projectLibrary.costumeGenerateAllImages')}
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
            <p className="text-sm font-medium">{t('projectLibrary.costumeSetup')}</p>
            <p className="text-xs text-base-content/55">{t('projectLibrary.costumeEmptyHint')}</p>
          </article>

          {costumes.length === 0 ? (
            <article className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 p-4 flex items-center justify-center text-center text-sm text-base-content/60">
              {t('projectLibrary.emptyCostumes')}
            </article>
          ) : null}

          {costumes.map((card) => (
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
                  if (card.thumbnail) setPreviewCostumeId(card.id)
                }}
              >
                {getThumbnailSrc(card.thumbnail) ? (
                  <img src={getThumbnailSrc(card.thumbnail)!} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <Package2 size={40} className="mb-4 text-base-content/50" />
                )}
              </button>

              <div className="p-3 flex-1 min-h-0 flex flex-col">
                <p className="text-base font-semibold line-clamp-1">{card.name || t('projectLibrary.costumeDefaultName')}</p>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <Tag size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-1 overflow-hidden text-ellipsis wrap-break-word">{card.category || '-'}</span>
                </div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <ScrollText size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-3 overflow-hidden text-ellipsis wrap-break-word">{card.description || '-'}</span>
                </div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <User size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-2 overflow-hidden text-ellipsis wrap-break-word">
                    {card.character_ids.map((id) => characterNameMap.get(id)).filter(Boolean).join(' / ') || '-'}
                  </span>
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
                      disabled={costumeBusyId === card.id || extractingFromScript || extractingRegenerate}
                      title={t('projectLibrary.costumeGenerateTurnaround')}
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
                      onDeleteCostume(card.id, card.name)
                    }}
                    disabled={costumeBusyId === card.id}
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
              <h3 className="text-xl font-semibold">{editingCostume ? t('projectLibrary.costumeEditTitle') : t('projectLibrary.costumeCreateTitle')}</h3>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-4 md:p-5">
              <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] items-start gap-3">
                <aside className="self-start rounded-xl border border-base-300 bg-linear-to-br from-base-200/90 via-base-100 to-base-200/70 p-3 min-h-0 flex flex-col items-center justify-start gap-3">
                  {getThumbnailSrc(createDraft.thumbnail) ? (
                    <img src={getThumbnailSrc(createDraft.thumbnail)!} alt={createDraft.name || 'costume'} className="h-52 w-full rounded-lg object-cover" />
                  ) : (
                    <Package2 size={48} className="text-base-content/55" />
                  )}

                  <p className="text-sm font-medium text-center wrap-break-word">
                    {createDraft.name.trim() || t('projectLibrary.costumeNameLabel')}
                  </p>

                  <div className="flex flex-col gap-2 w-full max-w-48">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => createUploadInputRef.current?.click()}
                      disabled={createUploading || createGenerating}
                    >
                      <Upload size={14} />
                      {createUploading ? t('projectLibrary.aiStreaming') : t('projectLibrary.costumeManualUpload')}
                    </button>
                    {showSmartGenerate && onSmartGenerateCostume ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => void handleSmartGenerate()}
                        disabled={createUploading || createGenerating}
                      >
                        <Sparkles size={14} />
                        {createGenerating ? t('projectLibrary.aiStreaming') : t('projectLibrary.costumeSmartGenerate')}
                      </button>
                    ) : null}
                    <input ref={createUploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleCreateUploadChange} />
                  </div>
                </aside>

                <div className="self-start grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
                  <div className="md:col-span-2 tabs tabs-box bg-base-200/70 mb-1">
                    <button
                      type="button"
                      className={`tab ${createTab === 'basic' ? 'tab-active' : ''}`}
                      onClick={() => setCreateTab('basic')}
                    >
                      {t('projectLibrary.costumeFormTabBasic')}
                    </button>
                    {!isCharacterScoped ? (
                      <button
                        type="button"
                        className={`tab ${createTab === 'characters' ? 'tab-active' : ''}`}
                        onClick={() => setCreateTab('characters')}
                      >
                        {t('projectLibrary.costumeFormTabCharacters')} ({createDraft.character_ids.length})
                      </button>
                    ) : null}
                  </div>

                  {createTab === 'basic' || isCharacterScoped ? (
                    <>
                      <label className="form-control flex flex-col items-start gap-1">
                        <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.costumeNameLabel')}</span>
                        <input
                          className="input input-bordered input-sm"
                          placeholder={t('projectLibrary.costumeNamePlaceholder')}
                          value={createDraft.name}
                          onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                        />
                      </label>

                      <label className="form-control flex flex-col items-start gap-1">
                        <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.costumeCategoryLabel')}</span>
                        <input
                          className="input input-bordered input-sm"
                          placeholder={t('projectLibrary.costumeCategoryPlaceholder')}
                          value={createDraft.category}
                          onChange={(event) => setCreateDraft((prev) => ({ ...prev, category: event.target.value }))}
                        />
                      </label>

                      <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                        <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.costumeDescriptionLabel')}</span>
                        <textarea
                          className="textarea textarea-bordered textarea-sm min-h-24"
                          placeholder={t('projectLibrary.costumeDescriptionPlaceholder')}
                          value={createDraft.description}
                          onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                        />
                      </label>
                      {isCharacterScoped ? (
                        <label className="form-control flex flex-col items-start gap-1 md:col-span-2">
                          <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.costumeLinkedCharacterLabel')}</span>
                          <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm">
                            {fixedCharacter?.name || '-'}
                          </div>
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <div className="md:col-span-2">
                      <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.costumeCharactersLabel')}</span>
                      <div className="mt-1 rounded-lg border border-base-300 bg-base-100 p-2 max-h-52 overflow-auto">
                        {characters.length === 0 ? (
                          <p className="text-xs text-base-content/60">{t('projectLibrary.costumeCharacterEmpty')}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {characters.map((character) => {
                              const checked = createDraft.character_ids.includes(character.id)
                              return (
                                <label key={character.id} className="inline-flex items-center gap-1.5 rounded-md border border-base-300 px-2 py-1 text-xs cursor-pointer hover:border-primary/40">
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs"
                                    checked={checked}
                                    onChange={() => toggleCharacter(character.id)}
                                  />
                                  <span>{character.name || '-'}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {createError ? <p className="text-error text-xs mt-3">{createError}</p> : null}
            </div>

            <div className="border-t border-base-300 bg-base-100 px-5 py-3 md:px-6 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreateOpen(false)}>
                {t('projectLibrary.costumeCreateCancel')}
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateSubmit}>
                {editingCostume ? t('projectLibrary.costumeUpdateConfirm') : t('projectLibrary.costumeCreateConfirm')}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {previewCostume && getThumbnailSrc(previewCostume.thumbnail) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-base-content/70"
            aria-label={t('projectLibrary.close')}
            onClick={() => setPreviewCostumeId(null)}
          />
          <article className="relative z-10 w-full max-w-6xl rounded-xl border border-base-300 bg-base-100 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-base-300">
              <p className="text-sm font-medium line-clamp-1">{previewCostume.name || t('projectLibrary.costumeDefaultName')}</p>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setPreviewCostumeId(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="bg-black/80 max-h-[80vh] overflow-auto flex items-center justify-center p-4">
              <img
                src={getThumbnailSrc(previewCostume.thumbnail)!}
                alt={previewCostume.name || t('projectLibrary.costumeDefaultName')}
                className="max-w-full h-auto object-contain rounded"
              />
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
