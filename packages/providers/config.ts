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
  /** Disabled models, keyed as "providerId:modelId" */
  disabledModels: Record<string, boolean>
  /** Hidden built-in models, keyed as "providerId:modelId" */
  hiddenModels: Record<string, boolean>
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  providers: {},
  models: { text: '', image: '', video: '', embedding: '' },
  customModels: {},
  disabledModels: {},
  hiddenModels: {},
}

export function parseAIConfig(raw: string | undefined): AIConfig {
  if (!raw) return DEFAULT_AI_CONFIG
  try {
    const parsed = JSON.parse(raw) as Partial<AIConfig>
    return {
      providers: parsed.providers ?? {},
      models: { ...DEFAULT_AI_CONFIG.models, ...parsed.models },
      customModels: parsed.customModels ?? {},
      disabledModels: parsed.disabledModels ?? {},
      hiddenModels: parsed.hiddenModels ?? {},
    }
  } catch {
    return DEFAULT_AI_CONFIG
  }
}

export type { ModelDef, ModelType }
