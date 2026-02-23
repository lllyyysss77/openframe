import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createAzure } from '@ai-sdk/azure'
import { createMistral } from '@ai-sdk/mistral'
import { createGroq } from '@ai-sdk/groq'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createTogetherAI } from '@ai-sdk/togetherai'
import { createPerplexity } from '@ai-sdk/perplexity'
import { createAlibaba } from '@ai-sdk/alibaba'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel, ImageModel, EmbeddingModel } from 'ai'
import type { Experimental_VideoModelV3 } from '@ai-sdk/provider'
import type { AIConfig, AIProviderConfig } from './config'
import { AI_PROVIDERS, type ModelType } from './providers'

// ── Types ──────────────────────────────────────────────────────────────────────

/** SDK-backed video model (Vercel AI SDK `Experimental_VideoModelV3`). */
export type VideoModel = Experimental_VideoModelV3

/**
 * Descriptor returned for providers without a Vercel AI SDK (custom REST required),
 * or for model types the SDK doesn't support for a given provider.
 * Callers check `isCustomRestModel(m)` and dispatch to provider-specific REST logic.
 */
export interface CustomRestModel {
  readonly _tag: 'custom-rest'
  readonly providerId: string
  readonly modelId: string
  readonly modelType: ModelType
  readonly apiKey: string | undefined
  readonly baseUrl: string | undefined
}

export type AnyModel = LanguageModel | ImageModel | VideoModel | CustomRestModel

export function isCustomRestModel(m: AnyModel): m is CustomRestModel {
  return (m as CustomRestModel)._tag === 'custom-rest'
}

export function isLanguageModel(m: AnyModel): m is LanguageModel {
  return !isCustomRestModel(m) && typeof (m as { doStream?: unknown }).doStream === 'function'
}

export function isImageModel(m: AnyModel): m is ImageModel {
  // Image models have doGenerate but no doStream
  return (
    !isCustomRestModel(m) &&
    !isLanguageModel(m) &&
    typeof (m as { doGenerate?: unknown }).doGenerate === 'function'
  )
}

export function isVideoModel(m: AnyModel): m is VideoModel {
  return !isCustomRestModel(m) && !isLanguageModel(m) && !isImageModel(m)
}


// ── Helpers ────────────────────────────────────────────────────────────────────

/** Ollama's OpenAI-compatible endpoint lives at /v1 — append it if missing. */
function normalizeOllamaBaseURL(baseURL: string | undefined): string {
  const raw = (baseURL ?? 'http://localhost:11434').replace(/\/$/, '')
  return raw.endsWith('/v1') ? raw : `${raw}/v1`
}

function resolveModelType(
  providerId: string,
  modelId: string,
  config: AIConfig,
): ModelType {
  const providerDef = AI_PROVIDERS.find(p => p.id === providerId)
  const allModels = [
    ...(providerDef?.models ?? []),
    ...(config.customModels[providerId] ?? []),
  ]
  return allModels.find(m => m.id === modelId)?.type ?? 'text'
}

function customRest(
  providerId: string,
  modelId: string,
  modelType: ModelType,
  cfg: AIProviderConfig,
): CustomRestModel {
  return {
    _tag: 'custom-rest',
    providerId,
    modelId,
    modelType,
    apiKey: cfg.apiKey || undefined,
    baseUrl: cfg.baseUrl || undefined,
  }
}

function buildModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
  type: ModelType,
): AnyModel | null {
  const apiKey = cfg.apiKey || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {

    case 'openai': {
      const p = createOpenAI({ apiKey, baseURL })
      if (type === 'embedding') return null  // use createEmbeddingModel instead
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(modelId)

    case 'google': {
      const p = createGoogleGenerativeAI({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'xai': {
      const p = createXai({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'azure': {
      const p = createAzure({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'mistral':
      return createMistral({ apiKey, baseURL })(modelId)

    case 'groq':
      return createGroq({ apiKey, baseURL })(modelId)

    case 'deepseek':
      return createDeepSeek({ apiKey, baseURL })(modelId)

    case 'togetherai': {
      const p = createTogetherAI({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'perplexity':
      return createPerplexity({ apiKey, baseURL })(modelId)

    case 'doubao': {
      // Doubao only has text models; video is future, route to custom REST if needed
      const p = createOpenAICompatible({
        name: 'doubao',
        baseURL: baseURL ?? 'https://ark.volcengine.com/api/v3',
        apiKey,
      })
      if (type === 'video' || type === 'image') return customRest(providerId, modelId, type, cfg)
      return p(modelId)
    }

    case 'qwen': {
      const p = createAlibaba({ apiKey, baseURL })
      if (type === 'video') return p.video(modelId)
      // Alibaba SDK has no image model support; fall back to custom REST
      if (type === 'image') return customRest(providerId, modelId, type, cfg)
      return p(modelId)
    }

    case 'zhipu': {
      const p = createOpenAICompatible({
        name: 'zhipu',
        baseURL: baseURL ?? 'https://open.bigmodel.cn/api/paas/v4',
        apiKey,
      })
      return type === 'image' ? p.imageModel(modelId) : p(modelId)
    }

    case 'ollama': {
      // Ollama is local-only; text models are supported via openai-compatible
      const p = createOpenAICompatible({
        name: 'ollama',
        baseURL: normalizeOllamaBaseURL(baseURL),
        apiKey: 'ollama',
      })
      if (type === 'embedding') return null  // use createEmbeddingModel instead
      return p(modelId)
    }

    default:
      return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a ready-to-use AI model instance for the given provider and model ID.
 *
 * ```ts
 * const model = createProviderModel('openai', 'gpt-4o', config)
 * if (isLanguageModel(model)) await generateText({ model, prompt: 'Hello' })
 * ```
 */
export function createProviderModel(
  providerId: string,
  modelId: string,
  config: AIConfig,
): AnyModel | null {
  const cfg = config.providers[providerId]
  if (!cfg) return null
  const type = resolveModelType(providerId, modelId, config)
  return buildModel(providerId, modelId, cfg, type)
}

/**
 * Parse a `"providerId:modelId"` key and create the model.
 * Handles model IDs that contain colons (e.g. `anthropic.claude...-v2:0`).
 *
 * ```ts
 * const model = createModelFromKey('openai:gpt-4o', config)
 * ```
 */
export function createModelFromKey(
  key: string,
  config: AIConfig,
): AnyModel | null {
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return createProviderModel(key.slice(0, idx), key.slice(idx + 1), config)
}

/**
 * Get the configured default model for the given type.
 *
 * ```ts
 * const model = getDefaultModel('text', config)
 * ```
 */
export function getDefaultModel(
  type: ModelType,
  config: AIConfig,
): AnyModel | null {
  const key = config.models[type]
  if (!key) return null
  return createModelFromKey(key, config)
}

/** Get the configured default text model (`LanguageModel`). */
export const getDefaultTextModel = (config: AIConfig): LanguageModel | null =>
  getDefaultModel('text', config) as LanguageModel | null

/** Get the configured default image model (`ImageModel | CustomRestModel`). */
export const getDefaultImageModel = (config: AIConfig): ImageModel | CustomRestModel | null =>
  getDefaultModel('image', config) as ImageModel | CustomRestModel | null

/** Get the configured default video model (`VideoModel | CustomRestModel`). */
export const getDefaultVideoModel = (config: AIConfig): VideoModel | CustomRestModel | null =>
  getDefaultModel('video', config) as VideoModel | CustomRestModel | null

// ── Embedding ──────────────────────────────────────────────────────────────────

/**
 * Create an embedding model for the given provider.
 * Supports: openai, ollama (openai-compatible).
 */
export function createEmbeddingModel(
  providerId: string,
  modelId: string,
  config: AIConfig,
): EmbeddingModel | null {
  const cfg = config.providers[providerId]
  if (!cfg) return null
  const apiKey = cfg.apiKey || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL }).textEmbeddingModel(modelId)

    case 'ollama':
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: normalizeOllamaBaseURL(baseURL),
        apiKey: apiKey ?? 'ollama',
      }).textEmbeddingModel(modelId)

    default:
      return null
  }
}

/** Get the configured default embedding model from `config.models.embedding`. */
export function getDefaultEmbeddingModel(config: AIConfig): EmbeddingModel | null {
  const key = config.models.embedding
  if (!key) return null
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return createEmbeddingModel(key.slice(0, idx), key.slice(idx + 1), config)
}
