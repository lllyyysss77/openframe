import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Image, PlusCircle, RefreshCw, ScrollText, Sparkles, Trash2, Upload, User, X } from 'lucide-react'
import type { Character } from '../db/characters_collection'

type ModelOption = {
  key: string
  label: string
}

type CreateCharacterDraft = {
  name: string
  gender: '' | 'male' | 'female' | 'other'
  age: '' | 'child' | 'youth' | 'young_adult' | 'adult' | 'middle_aged' | 'elder'
  personality: string
  appearance: string
  background: string
  thumbnail: string | null
}

export type { CreateCharacterDraft }

interface CharacterPanelProps {
  characters: Character[]
  extractingFromDraft: boolean
  extractingRegenerate: boolean
  characterBusyId: string | null
  imageModelOptions: ModelOption[]
  selectedImageModelKey: string
  onImageModelChange: (modelKey: string) => void
  onAddCharacter: (draft: CreateCharacterDraft) => void
  onUpdateCharacter: (id: string, draft: CreateCharacterDraft) => void
  onSmartGenerateCharacter: (
    draft: CreateCharacterDraft,
  ) => Promise<{ ok: true; draft: CreateCharacterDraft } | { ok: false; error: string }>
  onExtractFromScript: () => void
  onRegenerateFromScript: () => void
  onDeleteCharacter: (id: string, name: string) => void
  onEnhanceCharacter: (id: string) => void
  onRefreshCharacter: (id: string) => void
  onGenerateTurnaround: (id: string) => void
  onUploadCharacter: (id: string) => void
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function CharacterPanel({
  characters,
  extractingFromDraft,
  extractingRegenerate,
  characterBusyId,
  imageModelOptions,
  selectedImageModelKey,
  onImageModelChange,
  onAddCharacter,
  onUpdateCharacter,
  onSmartGenerateCharacter,
  onExtractFromScript,
  onRegenerateFromScript,
  onDeleteCharacter,
  onEnhanceCharacter,
  onRefreshCharacter,
  onGenerateTurnaround,
  onUploadCharacter,
}: CharacterPanelProps) {
  const { t } = useTranslation()
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createUploading, setCreateUploading] = useState(false)
  const [createGenerating, setCreateGenerating] = useState(false)
  const createUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createDraft, setCreateDraft] = useState<CreateCharacterDraft>({
    name: '',
    gender: '',
    age: '',
    personality: '',
    appearance: '',
    background: '',
    thumbnail: null,
  })

  const editingCharacter = editingCharacterId
    ? characters.find((item) => item.id === editingCharacterId) ?? null
    : null

  function getGenderLabel(value: string): string {
    if (value === 'male') return t('projectLibrary.characterGenderMale')
    if (value === 'female') return t('projectLibrary.characterGenderFemale')
    if (value === 'other') return t('projectLibrary.characterGenderOther')
    return value || '-'
  }

  function getAgeLabel(value: string): string {
    if (value === 'child') return t('projectLibrary.characterAgeChild')
    if (value === 'youth') return t('projectLibrary.characterAgeYouth')
    if (value === 'young_adult') return t('projectLibrary.characterAgeYoungAdult')
    if (value === 'adult') return t('projectLibrary.characterAgeAdult')
    if (value === 'middle_aged') return t('projectLibrary.characterAgeMiddleAged')
    if (value === 'elder') return t('projectLibrary.characterAgeElder')
    return value || '-'
  }

  function handleOpenCreate() {
    setEditingCharacterId(null)
    setCreateError('')
    setCreateDraft({
      name: '',
      gender: '',
      age: '',
      personality: '',
      appearance: '',
      background: '',
      thumbnail: null,
    })
    setCreateOpen(true)
  }

  function handleOpenEdit(character: Character) {
    setEditingCharacterId(character.id)
    setCreateError('')
    setCreateDraft({
      name: character.name,
      gender: character.gender,
      age: character.age,
      personality: character.personality,
      appearance: character.appearance,
      background: character.background,
      thumbnail: character.thumbnail,
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

  async function handleSmartGenerate() {
    if (!createDraft.name.trim()) {
      setCreateError(t('projectLibrary.characterNameRequired'))
      return
    }

    setCreateGenerating(true)
    setCreateError('')
    try {
      const result = await onSmartGenerateCharacter(createDraft)
      if (!result.ok) {
        setCreateError(result.error)
        return
      }
      setCreateDraft(result.draft)
    } finally {
      setCreateGenerating(false)
    }
  }

  function handleCreateSubmit() {
    if (!createDraft.name.trim()) {
      setCreateError(t('projectLibrary.characterNameRequired'))
      return
    }
    const payload = {
      name: createDraft.name.trim(),
      gender: createDraft.gender,
      age: createDraft.age,
      personality: createDraft.personality.trim(),
      appearance: createDraft.appearance.trim(),
      background: createDraft.background.trim(),
      thumbnail: createDraft.thumbnail,
    }

    if (editingCharacterId) {
      onUpdateCharacter(editingCharacterId, payload)
    } else {
      onAddCharacter(payload)
    }
    setCreateOpen(false)
  }

  return (
    <section className="h-full rounded-2xl border border-base-300 bg-linear-to-br from-base-200/30 via-base-100 to-base-200/20 text-base-content p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide">{t('projectLibrary.characterPanelTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-1">{t('projectLibrary.characterPanelSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onExtractFromScript}
            disabled={extractingFromDraft || extractingRegenerate}
          >
            <FolderOpen size={12} />
            {extractingFromDraft ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterFromDraft')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onRegenerateFromScript}
            disabled={extractingFromDraft || extractingRegenerate}
          >
            <RefreshCw size={12} />
            {extractingRegenerate ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterRegenerate')}
          </button>
          <label className="input input-sm input-bordered flex items-center gap-2 w-56">
            <Sparkles size={12} className="text-base-content/60" />
            <select
              className="w-full bg-transparent outline-none"
              value={selectedImageModelKey}
              onChange={(event) => onImageModelChange(event.target.value)}
            >
              {imageModelOptions.length === 0 ? (
                <option value="">{t('projectLibrary.characterModelEmpty')}</option>
              ) : (
                imageModelOptions.map((model) => (
                  <option key={model.key} value={model.key}>
                    {model.label}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap items-start gap-3 pr-2">
          <article
            className="w-56 h-105 shrink-0 rounded-xl border border-dashed border-base-300 bg-base-100/70 flex flex-col items-center justify-center gap-3 text-base-content/75 cursor-pointer hover:border-primary/40 hover:bg-base-100 transition-colors"
            onClick={handleOpenCreate}
          >
            <PlusCircle size={24} className="text-base-content/55" />
            <p className="text-sm font-medium">{t('projectLibrary.characterSetup')}</p>
            <p className="text-xs text-base-content/55">{t('projectLibrary.characterEmptyHint')}</p>
          </article>

          {characters.map((card) => (
            <article
              key={card.id}
              className="w-56 h-105 shrink-0 rounded-xl border border-base-300 bg-base-100 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleOpenEdit(card)}
            >
              <div className="h-44 border-b border-base-300 bg-linear-to-b from-base-200 via-base-100 to-base-200/70 flex items-end justify-center">
                {getThumbnailSrc(card.thumbnail) ? (
                  <img src={getThumbnailSrc(card.thumbnail)!} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="mb-4 size-20 rounded-full bg-linear-to-br from-primary/70 to-primary text-primary-content flex items-center justify-center text-xl font-bold shadow-lg">
                    {card.name.slice(0, 1) || '?'}
                  </div>
                )}
              </div>

              <div className="p-3 flex-1 min-h-0 flex flex-col">
                <p className="text-base font-semibold">{card.name}</p>
                <p className="mt-2 text-xs text-base-content/65 inline-flex items-center gap-1"><User size={12} />{[getGenderLabel(card.gender), getAgeLabel(card.age)].filter((item) => item && item !== '-').join('，') || '-'}</p>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <Sparkles size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-2 overflow-hidden text-ellipsis wrap-break-word">{card.personality || '-'}</span>
                </div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <Upload size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-2 overflow-hidden text-ellipsis wrap-break-word">{card.appearance || '-'}</span>
                </div>
                <div className="mt-2 flex gap-1 text-xs text-base-content/65">
                  <ScrollText size={12} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-2 overflow-hidden text-ellipsis wrap-break-word">{card.background || '-'}</span>
                </div>

                <div className="mt-auto pt-3 border-t border-base-300 flex items-center justify-center gap-1">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onEnhanceCharacter(card.id)
                    }}
                    disabled={characterBusyId === card.id || extractingFromDraft || extractingRegenerate}
                    title={t('projectLibrary.characterEnhanceSingle')}
                  ><Sparkles size={12} /></button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onRefreshCharacter(card.id)
                    }}
                    disabled={characterBusyId === card.id || extractingFromDraft || extractingRegenerate}
                    title={t('projectLibrary.characterRefreshSingle')}
                  ><RefreshCw size={12} /></button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onUploadCharacter(card.id)
                    }}
                    disabled={characterBusyId === card.id}
                    title={t('projectLibrary.characterUploadImage')}
                  ><Upload size={12} /></button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onGenerateTurnaround(card.id)
                    }}
                    disabled={characterBusyId === card.id || extractingFromDraft || extractingRegenerate}
                    title={t('projectLibrary.characterGenerateTurnaround')}
                  ><Image size={12} /></button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline text-error border-error/40 hover:bg-error/10"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteCharacter(card.id, card.name)
                    }}
                    disabled={characterBusyId === card.id}
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
          <article className="relative z-10 w-full max-w-6xl rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
            <div className="border-b border-base-300 bg-linear-to-r from-base-200/60 via-base-100 to-base-200/30 px-5 py-4 md:px-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold">{editingCharacter ? t('projectLibrary.characterEditTitle') : t('projectLibrary.characterCreateTitle')}</h3>
              <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={() => setCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-5 md:p-6 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
                <aside className="rounded-xl border border-base-300 bg-linear-to-br from-base-200/90 via-base-100 to-base-200/70 p-4 min-h-[620px] flex flex-col items-center justify-center gap-4">
                  {getThumbnailSrc(createDraft.thumbnail) ? (
                    <img src={getThumbnailSrc(createDraft.thumbnail)!} alt={createDraft.name || 'character'} className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <>
                      <div className="size-16 rounded-full bg-linear-to-br from-primary/70 to-primary text-primary-content flex items-center justify-center text-2xl font-bold">
                        {(createDraft.name.trim().slice(0, 1) || '?').toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-center wrap-break-word">{createDraft.name.trim() || t('projectLibrary.characterNameLabel')}</p>
                    </>
                  )}

                  <div className="flex flex-col gap-2 w-full max-w-52">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => createUploadInputRef.current?.click()}
                      disabled={createUploading || createGenerating}
                    >
                      <Upload size={14} />
                      {createUploading ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterManualUpload')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => void handleSmartGenerate()}
                      disabled={createUploading || createGenerating}
                    >
                      <Sparkles size={14} />
                      {createGenerating ? t('projectLibrary.aiStreaming') : t('projectLibrary.characterSmartGenerate')}
                    </button>
                    <input ref={createUploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleCreateUploadChange} />
                  </div>
                </aside>

                <div className="grid grid-cols-1 gap-3 content-start">
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterNameLabel')}</span>
                    <input
                      className="input input-bordered input-md"
                      placeholder={t('projectLibrary.characterNamePlaceholder')}
                      value={createDraft.name}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterAgeLabel')}</span>
                    <select
                      className="select select-bordered select-md"
                      value={createDraft.age}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          age: event.target.value as CreateCharacterDraft['age'],
                        }))
                      }
                    >
                      <option value="">{t('projectLibrary.characterAgePlaceholder')}</option>
                      <option value="child">{t('projectLibrary.characterAgeChild')}</option>
                      <option value="youth">{t('projectLibrary.characterAgeYouth')}</option>
                      <option value="young_adult">{t('projectLibrary.characterAgeYoungAdult')}</option>
                      <option value="adult">{t('projectLibrary.characterAgeAdult')}</option>
                      <option value="middle_aged">{t('projectLibrary.characterAgeMiddleAged')}</option>
                      <option value="elder">{t('projectLibrary.characterAgeElder')}</option>
                    </select>
                  </label>
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterGenderLabel')}</span>
                    <select
                      className="select select-bordered select-md"
                      value={createDraft.gender}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          gender: event.target.value as CreateCharacterDraft['gender'],
                        }))
                      }
                    >
                      <option value="">{t('projectLibrary.characterGenderPlaceholder')}</option>
                      <option value="male">{t('projectLibrary.characterGenderMale')}</option>
                      <option value="female">{t('projectLibrary.characterGenderFemale')}</option>
                      <option value="other">{t('projectLibrary.characterGenderOther')}</option>
                    </select>
                  </label>
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterPersonalityLabel')}</span>
                    <textarea
                      className="textarea textarea-bordered min-h-24"
                      placeholder={t('projectLibrary.characterPersonalityPlaceholder')}
                      value={createDraft.personality}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, personality: event.target.value }))}
                    />
                  </label>
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterAppearanceLabel')}</span>
                    <textarea
                      className="textarea textarea-bordered min-h-24"
                      placeholder={t('projectLibrary.characterAppearancePlaceholder')}
                      value={createDraft.appearance}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, appearance: event.target.value }))}
                    />
                  </label>
                  <label className="form-control flex flex-col items-start gap-1">
                    <span className="text-sm font-medium text-base-content/75">{t('projectLibrary.characterBackgroundLabel')}</span>
                    <textarea
                      className="textarea textarea-bordered min-h-24"
                      placeholder={t('projectLibrary.characterBackgroundPlaceholder')}
                      value={createDraft.background}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, background: event.target.value }))}
                    />
                  </label>
                </div>
              </div>

              {createError ? <p className="text-error text-xs mt-3">{createError}</p> : null}
            </div>

            <div className="border-t border-base-300 bg-base-100 px-5 py-3 md:px-6 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreateOpen(false)}>
                {t('projectLibrary.characterCreateCancel')}
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateSubmit}>
                {editingCharacter ? t('projectLibrary.characterUpdateConfirm') : t('projectLibrary.characterCreateConfirm')}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
