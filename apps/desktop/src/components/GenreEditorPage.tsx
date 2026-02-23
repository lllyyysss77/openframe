import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft, Sparkles, SendHorizontal, Upload, X } from 'lucide-react'
import { AI_PROVIDERS, type AIConfig } from '@openframe/providers'
import { genresCollection } from '../db/genres_collection'

const EMPTY_GENRE = { name: '', code: '', description: '', prompt: '', thumbnail: '' }
type AgentMessage = { role: 'user' | 'assistant'; content: string }
type TextModelOption = { key: string; providerName: string; modelName: string }
type ImageModelOption = { key: string; providerName: string; modelName: string }

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

function getTextModelOptions(config: AIConfig): TextModelOption[] {
  const result: TextModelOption[] = []
  for (const provider of AI_PROVIDERS) {
    const providerCfg = config.providers[provider.id]
    if (!providerCfg?.enabled) continue
    const builtin = provider.models.filter((m) => m.type === 'text')
    const custom = (config.customModels[provider.id] ?? []).filter((m) => m.type === 'text')
    for (const model of [...builtin, ...custom]) {
      const key = `${provider.id}:${model.id}`
      if (!config.enabledModels?.[key]) continue
      if (config.hiddenModels?.[key]) continue
      result.push({ key, providerName: provider.name, modelName: model.name || model.id })
    }
  }
  return result
}

function getImageModelOptions(config: AIConfig): ImageModelOption[] {
  const result: ImageModelOption[] = []
  for (const provider of AI_PROVIDERS) {
    const providerCfg = config.providers[provider.id]
    if (!providerCfg?.enabled) continue
    const builtin = provider.models.filter((m) => m.type === 'image')
    const custom = (config.customModels[provider.id] ?? []).filter((m) => m.type === 'image')
    for (const model of [...builtin, ...custom]) {
      const key = `${provider.id}:${model.id}`
      if (!config.enabledModels?.[key]) continue
      if (config.hiddenModels?.[key]) continue
      result.push({ key, providerName: provider.name, modelName: model.name || model.id })
    }
  }
  return result
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('openframe-thumb://')) return value
  const normalized = value.startsWith('file://') ? value.slice(7) : value
  return `openframe-thumb://local?path=${encodeURIComponent(normalized)}`
}

interface ThumbnailUploaderProps {
  savedPath: string
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
          <img src={displaySrc} alt="thumbnail" className="w-full h-full object-contain" />
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
          <span className="text-xs">{t('styleLibrary.thumbnailPlaceholder')}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  )
}

export function GenreEditorPage({ genreId }: { genreId?: string }) {
  const isEdit = !!genreId
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: genresList } = useLiveQuery(genresCollection)
  const target = useMemo(() => (genresList ?? []).find((g) => g.id === genreId), [genresList, genreId])

  const [form, setForm] = useState(EMPTY_GENRE)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [originalThumbnail, setOriginalThumbnail] = useState('')
  const [thumbGenerating, setThumbGenerating] = useState(false)
  const [thumbError, setThumbError] = useState('')
  const [thumbModelOptions, setThumbModelOptions] = useState<ImageModelOption[]>([])
  const [thumbModelKey, setThumbModelKey] = useState('')

  const [agentOpen, setAgentOpen] = useState(false)
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentInput, setAgentInput] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [agentModelOptions, setAgentModelOptions] = useState<TextModelOption[]>([])
  const [agentModelKey, setAgentModelKey] = useState('')

  useEffect(() => {
    window.aiAPI.getConfig().then((cfg) => {
      const ai = (cfg as AIConfig) ?? {
        providers: {},
        models: { text: '', image: '', video: '', embedding: '' },
        customModels: {},
        enabledModels: {},
        hiddenModels: {},
      }
      const options = getTextModelOptions(ai)
      const imageOptions = getImageModelOptions(ai)
      setAgentModelOptions(options)
      setThumbModelOptions(imageOptions)
      const defaultKey = ai.models.text
      const defaultImageKey = ai.models.image
      if (defaultKey && options.some((o) => o.key === defaultKey)) {
        setAgentModelKey(defaultKey)
      } else {
        setAgentModelKey(options[0]?.key ?? '')
      }

      if (defaultImageKey && imageOptions.some((o) => o.key === defaultImageKey)) {
        setThumbModelKey(defaultImageKey)
      } else {
        setThumbModelKey(imageOptions[0]?.key ?? '')
      }
    }).catch(() => {
      setAgentModelOptions([])
      setAgentModelKey('')
      setThumbModelOptions([])
      setThumbModelKey('')
    })
  }, [])

  useEffect(() => {
    if (!isEdit || !target) return
    setForm({
      name: target.name,
      code: target.code,
      description: target.description,
      prompt: target.prompt,
      thumbnail: target.thumbnail ?? '',
    })
    setOriginalThumbnail(target.thumbnail ?? '')
  }, [isEdit, target])

  function toggleAgent() {
    if (!agentOpen && agentMessages.length === 0) {
      setAgentMessages([{ role: 'assistant', content: t('styleLibrary.agentWelcome') }])
    }
    setAgentOpen((v) => !v)
  }

  async function sendToAgent() {
    const text = agentInput.trim()
    if (!text || agentLoading) return
    const nextMessages = [...agentMessages, { role: 'user', content: text } as AgentMessage]
    setAgentMessages(nextMessages)
    setAgentInput('')
    setAgentError('')
    setAgentLoading(true)
    try {
      const result = await window.aiAPI.styleAgentChat({
        messages: nextMessages,
        modelKey: agentModelKey || undefined,
        draft: {
          name: form.name,
          code: form.code,
          description: form.description,
          prompt: form.prompt,
        },
      })
      if (!result.ok) {
        setAgentError(result.error)
        return
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
      setForm((prev) => ({
        ...prev,
        name: result.draft.name,
        code: result.draft.code,
        description: result.draft.description,
        prompt: result.draft.prompt,
      }))
    } catch {
      setAgentError(t('styleLibrary.agentError'))
    } finally {
      setAgentLoading(false)
    }
  }

  async function handleGenerateThumbnail() {
    const prompt = form.prompt.trim()
    if (!prompt) {
      setThumbError(t('styleLibrary.thumbnailPromptRequired'))
      return
    }
    setThumbGenerating(true)
    setThumbError('')
    try {
      const result = await window.aiAPI.generateImage({ prompt, modelKey: thumbModelKey || undefined })
      if (!result.ok) {
        setThumbError(result.error)
        return
      }
      const bytes = new Uint8Array(result.data)
      const mediaType = result.mediaType || 'image/png'
      const ext = extFromMediaType(mediaType)
      const file = new File([bytes], `thumbnail.${ext}`, { type: mediaType })
      setPendingFile(file)
      setForm((prev) => ({ ...prev, thumbnail: '' }))
    } catch {
      setThumbError(t('styleLibrary.thumbnailGenerateError'))
    } finally {
      setThumbGenerating(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      setError(t('styleLibrary.requiredError'))
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

      if (isEdit && genreId) {
        genresCollection.update(genreId, (draft) => {
          draft.name = form.name.trim()
          draft.code = form.code.trim()
          draft.description = form.description.trim()
          draft.prompt = form.prompt.trim()
          draft.thumbnail = thumbnailPath || null
        })
      } else {
        genresCollection.insert({
          id: crypto.randomUUID(),
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
          prompt: form.prompt.trim(),
          thumbnail: thumbnailPath || null,
          created_at: Date.now(),
        })
      }

      navigate({ to: '/genres' })
    } catch {
      setError(t('styleLibrary.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && !genresList) {
    return <main className="flex-1 p-6 overflow-auto"><div className="max-w-5xl">Loading...</div></main>
  }

  if (isEdit && genresList && !target) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl flex flex-col gap-3">
          <p className="text-sm text-base-content/60">{t('styleLibrary.notFound')}</p>
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ to: '/genres' })}>
              <ArrowLeft size={14} />
              {t('styleLibrary.backToList')}
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
            <h1 className="text-2xl font-bold mb-1">{isEdit ? t('styleLibrary.edit') : t('styleLibrary.create')}</h1>
            <p className="text-base-content/60 text-sm">{t('styleLibrary.subtitle')}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-xs mb-2" onClick={() => navigate({ to: '/genres' })}>
            <ArrowLeft size={14} />
            {t('styleLibrary.backToList')}
          </button>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('styleLibrary.name')}</label>
                <input type="text" className="input input-bordered input-sm w-full" placeholder={t('styleLibrary.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-control">
                <label className="label label-text text-xs pb-1">{t('styleLibrary.code')}</label>
                <input type="text" className="input input-bordered input-sm w-full" placeholder={t('styleLibrary.codePlaceholder')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
            </div>

            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t('styleLibrary.description')}</label>
              <input type="text" className="input input-bordered input-sm w-full" placeholder={t('styleLibrary.descriptionPlaceholder')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t('styleLibrary.prompt')}</label>
              <textarea className="textarea textarea-bordered textarea-sm w-full h-44 font-mono" placeholder={t('styleLibrary.promptPlaceholder')} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            </div>

            <div className="rounded-box border border-base-300 p-3 bg-base-200/30">
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex items-center gap-2 text-sm font-semibold"><Sparkles size={14} />{t('styleLibrary.agentTitle')}</div>
                <button type="button" className="btn btn-ghost btn-xs" onClick={toggleAgent}>{agentOpen ? t('styleLibrary.agentHide') : t('styleLibrary.agentShow')}</button>
              </div>
              <p className="text-xs text-base-content/60 mb-2">{t('styleLibrary.agentHint')}</p>
              {agentOpen && (
                <>
                  <div className="mb-2">
                    <label className="label label-text text-xs pb-1">{t('styleLibrary.agentModel')}</label>
                    <select className="select select-bordered select-sm w-full" value={agentModelKey} onChange={(e) => setAgentModelKey(e.target.value)}>
                      {agentModelOptions.length === 0 ? <option value="">{t('styleLibrary.agentNoModel')}</option> : agentModelOptions.map((opt) => <option key={opt.key} value={opt.key}>{`${opt.providerName} / ${opt.modelName}`}</option>)}
                    </select>
                  </div>
                  <div className="h-44 overflow-auto rounded-box border border-base-300 bg-base-100 p-2">
                    {agentMessages.map((m, idx) => <div key={`${m.role}-${idx}`} className={`chat ${m.role === 'user' ? 'chat-end' : 'chat-start'}`}><div className={`chat-bubble text-sm ${m.role === 'user' ? 'chat-bubble-primary' : ''}`}>{m.content}</div></div>)}
                  </div>
                  {agentError && <p className="text-error text-xs mt-2">{agentError}</p>}
                  <div className="mt-2 flex gap-2">
                    <textarea className="textarea textarea-bordered textarea-sm flex-1 h-20" placeholder={t('styleLibrary.agentInputPlaceholder')} value={agentInput} onChange={(e) => setAgentInput(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void sendToAgent() } }} />
                    <button type="button" className="btn btn-primary btn-sm self-end" onClick={() => void sendToAgent()} disabled={agentLoading || !agentModelKey}>{agentLoading ? <span className="loading loading-spinner loading-xs" /> : <SendHorizontal size={14} />}{t('styleLibrary.agentSend')}</button>
                  </div>
                </>
              )}
            </div>

            <div className="form-control">
              <label className="label label-text text-xs pb-1">{t('styleLibrary.thumbnail')}</label>
              <div className="mb-2">
                <select
                  className="select select-bordered select-sm w-full"
                  value={thumbModelKey}
                  onChange={(e) => setThumbModelKey(e.target.value)}
                >
                  {thumbModelOptions.length === 0 ? (
                    <option value="">{t('styleLibrary.thumbnailNoModel')}</option>
                  ) : (
                    thumbModelOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>{`${opt.providerName} / ${opt.modelName}`}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="flex justify-end mb-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void handleGenerateThumbnail()} disabled={thumbGenerating || !thumbModelKey}>{thumbGenerating && <span className="loading loading-spinner loading-xs" />}{t('styleLibrary.thumbnailGenerateByPrompt')}</button>
              </div>
              <ThumbnailUploader
                savedPath={form.thumbnail}
                pendingFile={pendingFile}
                onSelect={setPendingFile}
                onClear={() => {
                  setPendingFile(null)
                  setForm((prev) => ({ ...prev, thumbnail: '' }))
                }}
                t={t}
              />
              {thumbError && <p className="text-error text-xs mt-2">{thumbError}</p>}
            </div>

            {error && <p className="text-error text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate({ to: '/genres' })} disabled={saving}>{t('styleLibrary.cancel')}</button>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleSave()} disabled={saving}>{saving && <span className="loading loading-spinner loading-xs" />}{isEdit ? t('styleLibrary.update') : t('styleLibrary.create')}</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
