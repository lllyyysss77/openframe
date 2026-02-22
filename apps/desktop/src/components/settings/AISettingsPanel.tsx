import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, X, Plus, Upload, Download } from 'lucide-react'
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

function ProviderAvatar({ id, name, size = 6 }: { id: string; name: string; size?: number }) {
  const logoUrl = getLogoUrl(id)
  const dim = `w-${size} h-${size}`

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center shrink-0`}
      style={{ background: providerColor(id) }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="w-3/5 h-3/5 object-contain"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      ) : (
        <span className="text-white text-[10px] font-bold">{name[0].toUpperCase()}</span>
      )}
    </div>
  )
}

const MODEL_TYPES: { type: ModelType; labelKey: string }[] = [
  { type: 'text',  labelKey: 'settings.aiTextModel'  },
  { type: 'image', labelKey: 'settings.aiImageModel' },
  { type: 'video', labelKey: 'settings.aiVideoModel' },
]

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
                <ProviderAvatar id={provider.id} name={provider.name} size={6} />
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

// ── Provider Detail Panel ──────────────────────────────────────────────────────

function typeBadgeClass(type: ModelType): string {
  if (type === 'text')  return 'badge-info'
  if (type === 'image') return 'badge-warning'
  return 'badge-secondary'
}

interface ProviderDetailProps {
  provider: (typeof AI_PROVIDERS)[number]
  config: AIConfig
  onChange: (c: AIConfig) => void
}

function ProviderDetail({ provider, config, onChange }: ProviderDetailProps) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [newModel, setNewModel] = useState<{ id: string; name: string; type: ModelType }>({
    id: '', name: '', type: 'text',
  })

  const cfg = config.providers[provider.id] ?? { apiKey: '', baseUrl: '', enabled: false }
  const builtinModels = provider.models
  const customModels = config.customModels[provider.id] ?? []
  const allModels = [...builtinModels, ...customModels]

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
    }
    const prev = config.customModels[provider.id] ?? []
    onChange({
      ...config,
      customModels: { ...config.customModels, [provider.id]: [...prev, model] },
    })
    setNewModel({ id: '', name: '', type: 'text' })
    setAddingModel(false)
  }

  function removeCustomModel(modelId: string) {
    const prev = config.customModels[provider.id] ?? []
    onChange({
      ...config,
      customModels: {
        ...config.customModels,
        [provider.id]: prev.filter((m) => m.id !== modelId),
      },
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Provider header */}
      <div className="px-6 py-4 border-b border-base-300 flex items-center gap-3 shrink-0">
        <ProviderAvatar id={provider.id} name={provider.name} size={7} />
        <span className="font-semibold text-sm">{provider.name}</span>
        <span className={`badge ${cfg.enabled ? 'badge-success' : 'badge-ghost'}`}>
          {cfg.enabled ? t('settings.aiEnabled') : t('settings.aiDisabled')}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">

        {/* API Key */}
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
              onChange={(e) => updateCfg({ apiKey: e.target.value })}
            />
            <button
              className="btn btn-ghost btn-square shrink-0"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Base URL + Test Connection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
            {t('settings.aiBaseUrl')}
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              className="input input-bordered flex-1"
              placeholder={t('settings.aiBaseUrlPlaceholder')}
              value={cfg.baseUrl}
              onChange={(e) => updateCfg({ baseUrl: e.target.value })}
            />
            <button className="btn btn-outline shrink-0">
              {t('settings.aiTestConnection')}
            </button>
          </div>
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
                onChange={(e) => setNewModel((p) => ({ ...p, type: e.target.value as ModelType }))}
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
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
              const isCustom = customModels.some((m) => m.id === model.id)

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
                  {/* Type badge */}
                  <span className={`badge badge-xs ${typeBadgeClass(model.type)}`}>
                    {model.type}
                  </span>
                  {/* Delete (custom models only) */}
                  {isCustom && (
                    <button
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => removeCustomModel(model.id)}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
