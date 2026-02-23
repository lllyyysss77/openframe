import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, X, Plus, Upload, Download, CheckCircle, XCircle, Loader, PencilLine, Check } from 'lucide-react'
import {
  AI_PROVIDERS,
  providerColor,
  type AIConfig,
  type ModelDef,
  type ModelType,
} from '@openframe/providers'

// ── Provider avatar ────────────────────────────────────────────────────────────

const providerLogoUrls = import.meta.glob(
  '../../assets/providers/*.svg',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

function getLogoUrl(id: string): string | undefined {
  return providerLogoUrls[`../../assets/providers/${id}.svg`]
}

function ProviderAvatar({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  const logoUrl = getLogoUrl(id)
  const px = size
  const iconPx = Math.round(size * 0.6)

  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: px, height: px, background: providerColor(id) }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          style={{ width: iconPx, height: iconPx, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
        />
      ) : (
        <span className="text-white font-bold" style={{ fontSize: Math.round(size * 0.4) }}>
          {name[0].toUpperCase()}
        </span>
      )}
    </div>
  )
}

const MODEL_TYPES: { type: ModelType; labelKey: string }[] = [
  { type: 'text',  labelKey: 'settings.aiTextModel'  },
  { type: 'image', labelKey: 'settings.aiImageModel' },
  { type: 'video', labelKey: 'settings.aiVideoModel' },
]

export const EMBEDDING_PROVIDERS = AI_PROVIDERS.filter((p) =>
  p.models.some((m) => m.type === 'embedding'),
)

// ── Main panel ─────────────────────────────────────────────────────────────────

interface AISettingsPanelProps {
  config: AIConfig
  onChange: (c: AIConfig) => void
}

export function AISettingsPanel({ config, onChange }: AISettingsPanelProps) {
  const { t } = useTranslation()
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

  function updateProvider(
    providerId: string,
    patch: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) {
    const prev = config.providers[providerId] ?? { apiKey: '', baseUrl: '', enabled: false }
    onChange({
      ...config,
      providers: { ...config.providers, [providerId]: { ...prev, ...patch } },
    })
  }

  const selectedProvider = selectedProviderId
    ? AI_PROVIDERS.find((p) => p.id === selectedProviderId) ?? null
    : null

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: Provider List ── */}
      <div className="w-52 shrink-0 border-r border-base-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
            {t('settings.aiProviders')}
          </span>
          <div className="flex gap-0.5">
            <button className="btn btn-ghost btn-xs px-1.5" title={t('settings.aiImport')}>
              <Upload size={12} />
            </button>
            <button className="btn btn-ghost btn-xs px-1.5" title={t('settings.aiExport')}>
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* Provider items */}
        <div className="flex-1 overflow-auto py-1">
          {AI_PROVIDERS.map((provider) => {
            const cfg = config.providers[provider.id] ?? { apiKey: '', baseUrl: '', enabled: false }
            const isSelected = selectedProviderId === provider.id

            return (
              <button
                key={provider.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-base-200 transition-colors text-left ${
                  isSelected ? 'bg-base-200' : ''
                }`}
                onClick={() => setSelectedProviderId(provider.id)}
              >
                {/* Avatar */}
                <ProviderAvatar id={provider.id} name={provider.name} size={24} />
                {/* Name */}
                <span className="flex-1 text-sm truncate">{provider.name}</span>
                {/* Toggle */}
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={cfg.enabled}
                  onChange={(e) => {
                    e.stopPropagation()
                    updateProvider(provider.id, { enabled: e.target.checked })
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: Provider Detail or Default Models ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedProvider == null ? (
          <DefaultModelsPanel config={config} onChange={onChange} />
        ) : (
          <ProviderDetail
            key={selectedProvider.id}
            provider={selectedProvider}
            config={config}
            onChange={onChange}
          />
        )}
      </div>

    </div>
  )
}

// ── Default Models Panel ───────────────────────────────────────────────────────

function DefaultModelsPanel({ config, onChange }: { config: AIConfig; onChange: (c: AIConfig) => void }) {
  const { t } = useTranslation()

  function updateModel(type: ModelType, value: string) {
    onChange({ ...config, models: { ...config.models, [type]: value } })
  }

  return (
    <div className="flex-1 overflow-auto px-6 py-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{t('settings.aiModels')}</span>
        <span className="text-xs text-base-content/50">{t('settings.aiSelectProviderHint')}</span>
      </div>

      <div className="flex flex-col gap-3">
        {MODEL_TYPES.map(({ type, labelKey }) => (
          <div key={type} className="flex items-center justify-between gap-4">
            <span className="text-sm shrink-0">{t(labelKey)}</span>
            <select
              className="select select-bordered flex-1 max-w-64"
              value={config.models[type]}
              onChange={(e) => updateModel(type, e.target.value)}
            >
              <option value="">{t('settings.aiNoModel')}</option>
              {AI_PROVIDERS.map((provider) => {
                const providerCfg = config.providers[provider.id]
                if (!providerCfg?.enabled) return null
                const builtinModels = provider.models.filter((m) => m.type === type)
                const customModels = (config.customModels[provider.id] ?? []).filter((m) => m.type === type)
                const models = [...builtinModels, ...customModels]
                if (models.length === 0) return null
                return (
                  <optgroup key={provider.id} label={provider.name}>
                    {models.map((m) => {
                      const key = `${provider.id}:${m.id}`
                      return (
                        <option key={m.id} value={key} disabled={!!config.disabledModels?.[key]}>
                          {m.name}
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Embedding Panel ────────────────────────────────────────────────────────────

export function EmbeddingPanel({ config, onChange }: { config: AIConfig; onChange: (c: AIConfig) => void }) {
  const { t } = useTranslation()
  const [storedDim, setStoredDim] = useState<number>(0)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

  useEffect(() => {
    window.vectorsAPI.getDimension().then(setStoredDim)
  }, [])

  const selectedKey = config.models.embedding

  function getDimForKey(key: string): number | undefined {
    const [providerId, modelId] = key.split(':')
    const provider = AI_PROVIDERS.find((p) => p.id === providerId)
    const builtin = provider?.models.find((m) => m.id === modelId)
    if (builtin?.dimension) return builtin.dimension
    const custom = (config.customModels[providerId] ?? []).find((m) => m.id === modelId)
    return (custom as ModelDef)?.dimension
  }

  function handleSelectModel(key: string) {
    const newDim = getDimForKey(key)
    if (newDim && storedDim > 0 && newDim !== storedDim) {
      setConfirmKey(key)
    } else {
      onChange({ ...config, models: { ...config.models, embedding: key } })
      if (newDim) setStoredDim(newDim)
    }
  }

  function confirmSwitch() {
    if (!confirmKey) return
    const newDim = getDimForKey(confirmKey)
    onChange({ ...config, models: { ...config.models, embedding: confirmKey } })
    if (newDim) setStoredDim(newDim)
    setConfirmKey(null)
  }

  const confirmDim = confirmKey ? getDimForKey(confirmKey) : undefined

  // Only show providers that are enabled AND have embedding models
  const availableProviders = EMBEDDING_PROVIDERS.filter(
    (p) => config.providers[p.id]?.enabled,
  )

  return (
    <div className="h-full overflow-auto px-6 py-5 flex flex-col gap-3">

      {/* Current dimension badge */}
      {storedDim > 0 && (
        <div className="flex items-center gap-2 pb-1 border-b border-base-200">
          <span className="text-xs text-base-content/50">{t('settings.aiEmbeddingCurrentDim', { dim: storedDim })}</span>
        </div>
      )}

      {availableProviders.length === 0 ? (
        <div className="flex flex-col gap-1 py-4">
          <p className="text-sm text-base-content/60">{t('settings.aiEmbeddingNone')}</p>
          <p className="text-xs text-base-content/40">{t('settings.aiEmbeddingEnableHint')}</p>
        </div>
      ) : (
        availableProviders.map((provider) => {
          const embeddingModels = [
            ...provider.models.filter((m) => m.type === 'embedding'),
            ...(config.customModels[provider.id] ?? []).filter((m) => m.type === 'embedding'),
          ]
          return (
            <div key={provider.id} className="flex flex-col">
              {/* Provider label */}
              <div className="flex items-center gap-2 px-2 py-1.5 mb-0.5">
                <ProviderAvatar id={provider.id} name={provider.name} size={18} />
                <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
                  {provider.name}
                </span>
              </div>

              {/* Clickable model rows */}
              {embeddingModels.map((m) => {
                const key = `${provider.id}:${m.id}`
                const isSelected = selectedKey === key
                const dim = m.dimension
                const dimConflict = dim && storedDim > 0 && dim !== storedDim
                return (
                  <button
                    key={m.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
                    }`}
                    onClick={() => handleSelectModel(key)}
                  >
                    <span
                      className="shrink-0 w-2.5 h-2.5 rounded-full border-2 transition-colors"
                      style={{
                        borderColor: isSelected ? 'var(--color-primary)' : '#9ca3af',
                        background: isSelected ? 'var(--color-primary)' : 'transparent',
                      }}
                    />
                    <span className="flex-1 text-sm font-mono">{m.name}</span>
                    {dim && (
                      <span className={`text-xs shrink-0 ${dimConflict ? 'text-warning' : 'text-base-content/40'}`}>
                        {t('settings.aiEmbeddingDimension', { dim })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })
      )}

      {/* Dimension conflict confirm dialog */}
      {confirmKey && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-warning mb-3">{t('settings.aiEmbeddingDimConflict')}</h3>
            <p className="text-sm text-base-content/70">
              {t('settings.aiEmbeddingDimConflictMsg', { from: storedDim, to: confirmDim })}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmKey(null)}>
                {t('settings.cancel')}
              </button>
              <button className="btn btn-error btn-sm" onClick={confirmSwitch}>
                {t('settings.aiEmbeddingConfirmSwitch')}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setConfirmKey(null)} />
        </dialog>
      )}
    </div>
  )
}

// ── Provider Detail Panel ──────────────────────────────────────────────────────

function typeBadgeClass(type: ModelType): string {
  if (type === 'text')      return 'badge-info'
  if (type === 'image')     return 'badge-warning'
  if (type === 'embedding') return 'badge-accent'
  return 'badge-secondary'
}

interface ProviderDetailProps {
  provider: (typeof AI_PROVIDERS)[number]
  config: AIConfig
  onChange: (c: AIConfig) => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

function ProviderDetail({ provider, config, onChange }: ProviderDetailProps) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [newModel, setNewModel] = useState<{ id: string; name: string; type: ModelType; dimension?: number }>({
    id: '', name: '', type: 'text',
  })
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModel, setEditModel] = useState<{ id: string; name: string; type: ModelType; dimension?: number }>({
    id: '', name: '', type: 'text',
  })
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string>('')
  const [testModelId, setTestModelId] = useState<string>('')

  const cfg = config.providers[provider.id] ?? { apiKey: '', baseUrl: '', enabled: false }
  const builtinModels = provider.models
  const customModels = config.customModels[provider.id] ?? []
  const allModels = [...builtinModels, ...customModels].filter(
    (m) => !config.hiddenModels?.[`${provider.id}:${m.id}`],
  )

  function updateCfg(patch: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>) {
    onChange({
      ...config,
      providers: { ...config.providers, [provider.id]: { ...cfg, ...patch } },
    })
  }

  function toggleModel(modelId: string) {
    const key = `${provider.id}:${modelId}`
    const prev = config.disabledModels ?? {}
    if (prev[key]) {
      const next = { ...prev }
      delete next[key]
      onChange({ ...config, disabledModels: next })
    } else {
      onChange({ ...config, disabledModels: { ...prev, [key]: true } })
    }
  }

  function handleAddModel() {
    if (!newModel.id.trim()) return
    const model: ModelDef = {
      id: newModel.id.trim(),
      name: newModel.name.trim() || newModel.id.trim(),
      type: newModel.type,
      ...(newModel.type === 'embedding' && newModel.dimension ? { dimension: newModel.dimension } : {}),
    }
    const prev = config.customModels[provider.id] ?? []
    onChange({
      ...config,
      customModels: { ...config.customModels, [provider.id]: [...prev, model] },
    })
    setNewModel({ id: '', name: '', type: 'text' })
    setAddingModel(false)
  }

  async function handleTestConnection() {
    const modelId = testModelId || allModels.find((m) => m.type === 'text')?.id || allModels[0]?.id
    if (!modelId) {
      setTestState('error')
      setTestError(t('settings.aiTestNoTextModel'))
      return
    }
    setTestState('testing')
    setTestError('')
    const result = await window.aiAPI.testConnection({
      providerId: provider.id,
      modelId,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl || provider.defaultBaseUrl || undefined,
    })
    if (result.ok) {
      setTestState('ok')
    } else {
      setTestState('error')
      setTestError(result.error ?? '')
    }
  }

  function removeModel(model: ModelDef) {
    const key = `${provider.id}:${model.id}`
    const isCustom = customModels.some((m) => m.id === model.id)
    if (isCustom) {
      const prev = config.customModels[provider.id] ?? []
      onChange({
        ...config,
        customModels: { ...config.customModels, [provider.id]: prev.filter((m) => m.id !== model.id) },
      })
    } else {
      onChange({
        ...config,
        hiddenModels: { ...(config.hiddenModels ?? {}), [key]: true },
      })
    }
  }

  function startEditModel(model: ModelDef) {
    setEditingModelId(model.id)
    setEditModel({ id: model.id, name: model.name, type: model.type, dimension: model.dimension })
  }

  function handleSaveEdit() {
    if (!editModel.id.trim() || !editingModelId) return
    const isCustom = customModels.some((m) => m.id === editingModelId)
    const updated: ModelDef = {
      id: editModel.id.trim(),
      name: editModel.name.trim() || editModel.id.trim(),
      type: editModel.type,
      ...(editModel.type === 'embedding' && editModel.dimension ? { dimension: editModel.dimension } : {}),
    }
    if (isCustom) {
      const prev = config.customModels[provider.id] ?? []
      onChange({
        ...config,
        customModels: {
          ...config.customModels,
          [provider.id]: prev.map((m) => m.id === editingModelId ? updated : m),
        },
      })
    } else {
      // Hide the original built-in, add edited version as custom
      const originalKey = `${provider.id}:${editingModelId}`
      const prev = config.customModels[provider.id] ?? []
      onChange({
        ...config,
        customModels: { ...config.customModels, [provider.id]: [...prev, updated] },
        hiddenModels: { ...(config.hiddenModels ?? {}), [originalKey]: true },
      })
    }
    setEditingModelId(null)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Provider header */}
      <div className="px-6 py-4 border-b border-base-300 flex items-center gap-3 shrink-0">
        <ProviderAvatar id={provider.id} name={provider.name} size={28} />
        <span className="font-semibold text-sm">{provider.name}</span>
        <span className={`badge ${cfg.enabled ? 'badge-success' : 'badge-ghost'}`}>
          {cfg.enabled ? t('settings.aiEnabled') : t('settings.aiDisabled')}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">

        {/* API Key — hidden for providers that don't require one */}
        {!provider.noApiKey && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
              {t('settings.aiApiKey')}
            </label>
            <div className="flex gap-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                className="input input-bordered flex-1 font-mono"
                placeholder="sk-..."
                value={cfg.apiKey}
                onChange={(e) => { updateCfg({ apiKey: e.target.value }); setTestState('idle') }}
              />
              <button
                className="btn btn-ghost btn-square shrink-0"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
            {t('settings.aiBaseUrl')}
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            placeholder={provider.defaultBaseUrl ?? t('settings.aiBaseUrlPlaceholder')}
            value={cfg.baseUrl}
            onChange={(e) => {
              updateCfg({ baseUrl: e.target.value })
              setTestState('idle')
            }}
          />
        </div>

        {/* Test Connection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
            {t('settings.aiTestConnection')}
          </label>
          <div className="flex gap-1.5">
            <select
              className="select select-bordered flex-1"
              value={testModelId}
              onChange={(e) => { setTestModelId(e.target.value); setTestState('idle') }}
            >
              <option value="">{t('settings.aiTestAutoModel')}</option>
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button
              className="btn btn-outline shrink-0"
              disabled={testState === 'testing' || (!cfg.apiKey && !cfg.baseUrl && !provider.defaultBaseUrl)}
              onClick={handleTestConnection}
            >
              {testState === 'testing' ? (
                <Loader size={14} className="animate-spin" />
              ) : testState === 'ok' ? (
                <CheckCircle size={14} className="text-success" />
              ) : testState === 'error' ? (
                <XCircle size={14} className="text-error" />
              ) : null}
              {t('settings.aiTestConnection')}
            </button>
          </div>
          {testState === 'error' && testError && (
            <p className="text-xs text-error mt-1">{testError}</p>
          )}
          {testState === 'ok' && (
            <p className="text-xs text-success mt-1">{t('settings.aiTestSuccess')}</p>
          )}
        </div>

        {/* Available Models */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
              {t('settings.aiAvailableModels')}
            </label>
            <button
              className="btn btn-ghost btn-xs gap-1"
              onClick={() => {
                setAddingModel(true)
                setNewModel({ id: '', name: '', type: 'text' })
              }}
            >
              <Plus size={11} />
              {t('settings.aiAddModel')}
            </button>
          </div>

          {/* Add model inline form */}
          {addingModel && (
            <div className="flex gap-1.5 items-center p-2 bg-base-200 rounded-lg flex-wrap">
              <input
                className="input input-bordered input-xs flex-1 min-w-32 font-mono"
                placeholder="Model ID"
                value={newModel.id}
                onChange={(e) => setNewModel((p) => ({ ...p, id: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
                autoFocus
              />
              <input
                className="input input-bordered input-xs w-28"
                placeholder={t('settings.aiModelName')}
                value={newModel.name}
                onChange={(e) => setNewModel((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
              />
              <select
                className="select select-bordered select-xs"
                value={newModel.type}
                onChange={(e) => setNewModel((p) => ({ ...p, type: e.target.value as ModelType, dimension: undefined }))}
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="embedding">Embedding</option>
              </select>
              {newModel.type === 'embedding' && (
                <input
                  type="number"
                  className="input input-bordered input-xs w-20"
                  placeholder={t('settings.aiModelDimension')}
                  value={newModel.dimension ?? ''}
                  min={1}
                  onChange={(e) => setNewModel((p) => ({ ...p, dimension: parseInt(e.target.value) || undefined }))}
                />
              )}
              <button className="btn btn-primary btn-xs btn-square" onClick={handleAddModel}>
                <Plus size={12} />
              </button>
              <button className="btn btn-ghost btn-xs btn-square" onClick={() => setAddingModel(false)}>
                <X size={12} />
              </button>
            </div>
          )}

          {/* Model list */}
          <div className="flex flex-col">
            {allModels.map((model) => {
              const key = `${provider.id}:${model.id}`
              const isEnabled = !(config.disabledModels?.[key])
              const isEditing = editingModelId === model.id

              if (isEditing) {
                return (
                  <div key={model.id} className="flex gap-1.5 items-center p-2 bg-base-200 rounded-lg flex-wrap">
                    <input
                      className="input input-bordered input-xs flex-1 min-w-32 font-mono"
                      placeholder="Model ID"
                      value={editModel.id}
                      onChange={(e) => setEditModel((p) => ({ ...p, id: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingModelId(null) }}
                      autoFocus
                    />
                    <input
                      className="input input-bordered input-xs w-28"
                      placeholder={t('settings.aiModelName')}
                      value={editModel.name}
                      onChange={(e) => setEditModel((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingModelId(null) }}
                    />
                    <select
                      className="select select-bordered select-xs"
                      value={editModel.type}
                      onChange={(e) => setEditModel((p) => ({ ...p, type: e.target.value as ModelType, dimension: undefined }))}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="embedding">Embedding</option>
                    </select>
                    {editModel.type === 'embedding' && (
                      <input
                        type="number"
                        className="input input-bordered input-xs w-20"
                        placeholder={t('settings.aiModelDimension')}
                        value={editModel.dimension ?? ''}
                        min={1}
                        onChange={(e) => setEditModel((p) => ({ ...p, dimension: parseInt(e.target.value) || undefined }))}
                      />
                    )}
                    <button className="btn btn-primary btn-xs btn-square" onClick={handleSaveEdit}>
                      <Check size={12} />
                    </button>
                    <button className="btn btn-ghost btn-xs btn-square" onClick={() => setEditingModelId(null)}>
                      <X size={12} />
                    </button>
                  </div>
                )
              }

              return (
                <div
                  key={model.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200 group"
                >
                  {/* Enable/disable dot */}
                  <button
                    className="shrink-0 w-2.5 h-2.5 rounded-full transition-colors"
                    style={{ background: isEnabled ? '#22c55e' : '#9ca3af' }}
                    title={isEnabled ? t('settings.aiDisableModel') : t('settings.aiEnableModel')}
                    onClick={() => toggleModel(model.id)}
                  />
                  {/* Model name */}
                  <span className="flex-1 text-sm truncate">{model.name}</span>
                  {/* Model ID */}
                  <code className="text-[10px] text-base-content/40 font-mono hidden md:block truncate max-w-36">
                    {model.id}
                  </code>
                  {/* Dimension (embedding models) */}
                  {model.type === 'embedding' && model.dimension && (
                    <span className="text-[10px] text-base-content/40 font-mono shrink-0">
                      {model.dimension}d
                    </span>
                  )}
                  {/* Type badge */}
                  <span className={`badge badge-xs ${typeBadgeClass(model.type)}`}>
                    {model.type}
                  </span>
                  {/* Edit / Delete */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      onClick={() => startEditModel(model)}
                    >
                      <PencilLine size={11} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs btn-square text-error"
                      onClick={() => removeModel(model)}
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
