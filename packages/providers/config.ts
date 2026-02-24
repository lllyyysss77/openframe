import type { ModelDef, ModelType } from './providers'

export interface AIProviderConfig {
  apiKey: string
  baseUrl: string
  enabled: boolean
}

export interface AIConfig {
  /** Provider-level settings (API key, base URL, enabled) */
  providers: Record<string, AIProviderConfig>
  /** App-wide default model selection per type */
  models: {
    text: string   // "providerId:modelId" or ""
    image: string
    video: string
    embedding: string
  }
  /** User-added custom models per provider */
  customModels: Record<string, ModelDef[]>
  /** Explicitly enabled models, keyed as "providerId:modelId" — models are OFF by default */
  enabledModels: Record<string, boolean>
  /** Hidden built-in models, keyed as "providerId:modelId" */
  hiddenModels: Record<string, boolean>
  /** Concurrency limits for media generation */
  concurrency: {
    image: number
    video: number
  }
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  providers: {},
  models: { text: '', image: '', video: '', embedding: '' },
  customModels: {},
  enabledModels: {},
  hiddenModels: {},
  concurrency: { image: 5, video: 5 },
}

function normalizeConcurrency(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(1, Math.min(20, Math.trunc(num)))
}

export function parseAIConfig(raw: string | undefined): AIConfig {
  if (!raw) return DEFAULT_AI_CONFIG
  try {
    const parsed = JSON.parse(raw) as Partial<AIConfig>
    return {
      providers: parsed.providers ?? {},
      models: { ...DEFAULT_AI_CONFIG.models, ...parsed.models },
      customModels: parsed.customModels ?? {},
      enabledModels: parsed.enabledModels ?? {},
      hiddenModels: parsed.hiddenModels ?? {},
      concurrency: {
        image: normalizeConcurrency(parsed.concurrency?.image, DEFAULT_AI_CONFIG.concurrency.image),
        video: normalizeConcurrency(parsed.concurrency?.video, DEFAULT_AI_CONFIG.concurrency.video),
      },
    }
  } catch {
    return DEFAULT_AI_CONFIG
  }
}

export type { ModelDef, ModelType }
