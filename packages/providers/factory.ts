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
import { generateImage } from 'ai'
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

export type ImagePrompt = string | { text?: string; images: Array<string | number[]> }


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

export function parseModelKey(key: string | undefined): { providerId: string; modelId: string } | null {
  if (!key) return null
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return {
    providerId: key.slice(0, idx),
    modelId: key.slice(idx + 1),
  }
}

function hasReferenceImages(prompt: ImagePrompt): prompt is { text?: string; images: Array<string | number[]> } {
  return typeof prompt !== 'string' && Array.isArray(prompt.images) && prompt.images.length > 0
}

function toTextOnlyPrompt(prompt: ImagePrompt): string {
  if (typeof prompt === 'string') return prompt
  return prompt.text || ''
}

function imageRefToString(image: string | number[]): string {
  if (typeof image === 'string') return image
  return `data:image/png;base64,${Buffer.from(image).toString('base64')}`
}

async function generateVolcengineImage(
  args: {
    apiKey: string
    baseUrl?: string
    modelId: string
    prompt: string
    images: Array<string | number[]>
  },
): Promise<{ data: number[]; mediaType: string }> {
  const baseUrl = (args.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const url = `${baseUrl}/images/generations`
  const body = {
    model: args.modelId,
    prompt: args.prompt,
    image: args.images.map(imageRefToString),
    n: 1,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `Volcengine image generation failed: ${res.status}`)
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>
  }
  const item = json.data?.[0]
  if (!item) {
    throw new Error('Volcengine image generation returned empty data.')
  }

  if (item.b64_json) {
    const bytes = Buffer.from(item.b64_json, 'base64')
    return { data: Array.from(bytes), mediaType: 'image/png' }
  }

  if (item.url) {
    const imageRes = await fetch(item.url)
    if (!imageRes.ok) {
      throw new Error(`Failed to download generated image: ${imageRes.status}`)
    }
    const mediaType = imageRes.headers.get('content-type') || 'image/png'
    const bytes = new Uint8Array(await imageRes.arrayBuffer())
    return { data: Array.from(bytes), mediaType }
  }

  throw new Error('Volcengine image generation response missing image payload.')
}

export async function generateImageWithProviderSupport(
  args: {
    model: ImageModel | CustomRestModel
    prompt: ImagePrompt
  },
): Promise<{ data: number[]; mediaType: string }> {
  if (isCustomRestModel(args.model)) {
    if (args.model.providerId !== 'volcengine') {
      throw new Error('Selected image model is not supported yet.')
    }

    const apiKey = args.model.apiKey || ''
    if (!apiKey) throw new Error('Volcengine API key is missing.')
    return generateVolcengineImage({
      apiKey,
      baseUrl: args.model.baseUrl || undefined,
      modelId: args.model.modelId,
      prompt: toTextOnlyPrompt(args.prompt),
      images: hasReferenceImages(args.prompt) ? args.prompt.images : [],
    })
  }

  const normalizedPrompt =
    typeof args.prompt === 'string'
      ? args.prompt
      : {
          text: args.prompt.text,
          images: args.prompt.images.map((img) => (Array.isArray(img) ? new Uint8Array(img) : img)),
        }

  try {
    const result = await generateImage({ model: args.model, prompt: normalizedPrompt, n: 1 })
    return {
      data: Array.from(result.image.uint8Array),
      mediaType: result.image.mediaType,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const shouldRetryTextOnly = /\bnot\s*found\b/i.test(msg) && hasReferenceImages(args.prompt)
    if (!shouldRetryTextOnly) throw err

    const result = await generateImage({ model: args.model, prompt: toTextOnlyPrompt(args.prompt), n: 1 })
    return {
      data: Array.from(result.image.uint8Array),
      mediaType: result.image.mediaType,
    }
  }
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

function buildTextModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
): AnyModel | null {
  const apiKey = cfg.apiKey || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(modelId)

    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(modelId)

    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL })(modelId)

    case 'xai':
      return createXai({ apiKey, baseURL })(modelId)

    case 'azure':
      return createAzure({ apiKey, baseURL })(modelId)

    case 'mistral':
      return createMistral({ apiKey, baseURL })(modelId)

    case 'groq':
      return createGroq({ apiKey, baseURL })(modelId)

    case 'deepseek':
      return createDeepSeek({ apiKey, baseURL })(modelId)

    case 'togetherai':
      return createTogetherAI({ apiKey, baseURL })(modelId)

    case 'perplexity':
      return createPerplexity({ apiKey, baseURL })(modelId)

    case 'volcengine': {
      const p = createOpenAICompatible({
        name: 'volcengine',
        baseURL: baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey,
      })
      return p(modelId)
    }

    case 'qwen': {
      const p = createAlibaba({ apiKey, baseURL })
      return p(modelId)
    }

    case 'zhipu': {
      const p = createOpenAICompatible({
        name: 'zhipu',
        baseURL: baseURL ?? 'https://open.bigmodel.cn/api/paas/v4',
        apiKey,
      })
      return p(modelId)
    }

    case 'ollama':
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: normalizeOllamaBaseURL(baseURL),
        apiKey: 'ollama',
      })(modelId)

    default:
      return null
  }
}

function buildImageModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
): AnyModel | null {
  const apiKey = cfg.apiKey || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL }).image(modelId)

    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL }).image(modelId)

    case 'xai':
      return createXai({ apiKey, baseURL }).image(modelId)

    case 'azure':
      return createAzure({ apiKey, baseURL }).image(modelId)

    case 'togetherai':
      return createTogetherAI({ apiKey, baseURL }).image(modelId)

    case 'zhipu':
      return createOpenAICompatible({
        name: 'zhipu',
        baseURL: baseURL ?? 'https://open.bigmodel.cn/api/paas/v4',
        apiKey,
      }).imageModel(modelId)

    case 'volcengine':
      return customRest(providerId, modelId, 'image', cfg)

    case 'qwen':
      return customRest(providerId, modelId, 'image', cfg)

    default:
      return null
  }
}

function buildVideoModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
): AnyModel | null {
  const apiKey = cfg.apiKey || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {
    case 'qwen':
      return createAlibaba({ apiKey, baseURL }).video(modelId)

    case 'volcengine':
      return customRest(providerId, modelId, 'video', cfg)

    default:
      return null
  }
}

function buildModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
  type: ModelType,
): AnyModel | null {
  if (type === 'text') return buildTextModel(providerId, modelId, cfg)
  if (type === 'image') return buildImageModel(providerId, modelId, cfg)
  if (type === 'video') return buildVideoModel(providerId, modelId, cfg)
  if (type === 'embedding') return null
  return null
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
 * Create a model with an explicitly forced model type.
 * Useful when model IDs overlap across types (e.g. custom models).
 */
export function createProviderModelWithType(
  providerId: string,
  modelId: string,
  type: ModelType,
  config: AIConfig,
): AnyModel | null {
  const cfg = config.providers[providerId]
  if (!cfg) return null
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

    case 'volcengine':
      return createOpenAICompatible({
        name: 'avolcenginek',
        baseURL: baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey,
      }).textEmbeddingModel(modelId)

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
