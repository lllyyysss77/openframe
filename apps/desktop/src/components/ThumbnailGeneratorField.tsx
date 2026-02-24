import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AI_PROVIDERS, type AIConfig } from '@openframe/providers'
import { Upload, X } from 'lucide-react'

type ImageModelOption = { key: string; providerName: string; modelName: string }

type PromptResult = { prompt: string } | { error: string }

interface ThumbnailGeneratorFieldProps {
  savedPath: string
  pendingFile: File | null
  onPendingFileChange: (file: File | null) => void
  onSavedPathChange: (path: string) => void
  buildPrompt: () => PromptResult
  layout?: 'vertical' | 'horizontal'
  texts: {
    placeholder: string
    modelEmpty: string
    generateButton: string
    generateError: string
  }
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

export function ThumbnailGeneratorField({
  savedPath,
  pendingFile,
  onPendingFileChange,
  onSavedPathChange,
  buildPrompt,
  layout = 'vertical',
  texts,
}: ThumbnailGeneratorFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [modelOptions, setModelOptions] = useState<ImageModelOption[]>([])
  const [modelKey, setModelKey] = useState('')

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  useEffect(() => {
    window.aiAPI.getConfig().then((cfg) => {
      const ai = (cfg as AIConfig) ?? {
        providers: {},
        models: { text: '', image: '', video: '', embedding: '' },
        customModels: {},
        enabledModels: {},
        hiddenModels: {},
        concurrency: { image: 5, video: 5 },
      }
      const options = getImageModelOptions(ai)
      setModelOptions(options)
      const defaultImageKey = ai.models.image
      if (defaultImageKey && options.some((o) => o.key === defaultImageKey)) {
        setModelKey(defaultImageKey)
      } else {
        setModelKey(options[0]?.key ?? '')
      }
    }).catch(() => {
      setModelOptions([])
      setModelKey('')
    })
  }, [])

  function handleUploadChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onPendingFileChange(file)
    setError('')
  }

  async function handleGenerate() {
    const promptResult = buildPrompt()
    if ('error' in promptResult) {
      setError(promptResult.error)
      return
    }

    setGenerating(true)
    setError('')
    try {
      const result = await window.aiAPI.generateImage({ prompt: promptResult.prompt, modelKey: modelKey || undefined })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const bytes = new Uint8Array(result.data)
      const mediaType = result.mediaType || 'image/png'
      const ext = extFromMediaType(mediaType)
      const file = new File([bytes], `thumbnail.${ext}`, { type: mediaType })
      onPendingFileChange(file)
      onSavedPathChange('')
    } catch {
      setError(texts.generateError)
    } finally {
      setGenerating(false)
    }
  }

  const displaySrc = previewUrl ?? getThumbnailSrc(savedPath)

  const preview = (
    <div
      className="relative w-full h-40 rounded-lg border-2 border-dashed border-base-300 cursor-pointer overflow-hidden hover:border-primary transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      {displaySrc ? (
        <>
          <img src={displaySrc} alt="thumbnail" className="w-full h-full object-contain" />
          <button
            className="absolute top-2 right-2 btn btn-circle btn-xs btn-neutral opacity-80 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onPendingFileChange(null)
              onSavedPathChange('')
              setError('')
            }}
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-base-content/30 select-none">
          <Upload size={22} />
          <span className="text-xs">{texts.placeholder}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadChange} />
    </div>
  )

  const controls = (
    <div className={`${layout === 'vertical' ? 'flex gap-2' : ''}`}>
      <div className="mb-2 w-full">
        <select className="select select-bordered select-sm w-full" value={modelKey} onChange={(e) => setModelKey(e.target.value)}>
          {modelOptions.length === 0 ? (
            <option value="">{texts.modelEmpty}</option>
          ) : (
            modelOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{`${opt.providerName} / ${opt.modelName}`}</option>
            ))
          )}
        </select>
      </div>

      <div className="flex justify-end mb-2 w-full">
        <button type="button" className="btn btn-outline btn-sm w-full" onClick={() => void handleGenerate()} disabled={generating || !modelKey}>
          {generating && <span className="loading loading-spinner loading-xs" />}
          {texts.generateButton}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {layout === 'horizontal' ? (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-3 items-start">
          <div>{preview}</div>
          <div>{controls}</div>
        </div>
      ) : (
        <>
          {controls}
          {preview}
        </>
      )}

      {error && <p className="text-error text-xs mt-2">{error}</p>}
    </>
  )
}
