import { createOpenAI }            from '@ai-sdk/openai'
import { createAnthropic }          from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai }                from '@ai-sdk/xai'
import { createAzure }              from '@ai-sdk/azure'
import { createAmazonBedrock }      from '@ai-sdk/amazon-bedrock'
import { createVertex }             from '@ai-sdk/google-vertex'
import { createMistral }            from '@ai-sdk/mistral'
import { createGroq }               from '@ai-sdk/groq'
import { createDeepSeek }           from '@ai-sdk/deepseek'
import { createTogetherAI }         from '@ai-sdk/togetherai'
import { createCohere }             from '@ai-sdk/cohere'
import { createPerplexity }         from '@ai-sdk/perplexity'
import { createCerebras }           from '@ai-sdk/cerebras'
import { createFireworks }          from '@ai-sdk/fireworks'
import { createDeepInfra }          from '@ai-sdk/deepinfra'
import { createBaseten }            from '@ai-sdk/baseten'
import type { LanguageModel, ImageModel } from 'ai'
import type { AIConfig, AIProviderConfig } from './config'
import { AI_PROVIDERS, type ModelType } from './providers'

// ── Types ──────────────────────────────────────────────────────────────────────

export type AnyModel = LanguageModel | ImageModel

/** Credentials stored as JSON in the apiKey field for Amazon Bedrock */
interface BedrockCredentials {
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  sessionToken?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resolve model type (text / image / video) from provider definitions or custom models */
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

/** Build the actual provider model instance */
function buildModel(
  providerId: string,
  modelId: string,
  cfg: AIProviderConfig,
  type: ModelType,
): AnyModel | null {
  const apiKey  = cfg.apiKey  || undefined
  const baseURL = cfg.baseUrl || undefined

  switch (providerId) {

    case 'openai': {
      const p = createOpenAI({ apiKey, baseURL })
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

    /**
     * Amazon Bedrock uses AWS credentials instead of a plain API key.
     * Store credentials in the apiKey field as JSON:
     *   { "accessKeyId": "...", "secretAccessKey": "...", "region": "us-east-1" }
     * Or rely on the standard AWS credential chain (env vars / ~/.aws).
     */
    case 'amazon-bedrock': {
      let creds: BedrockCredentials = {}
      try { creds = JSON.parse(cfg.apiKey) } catch { /* use env vars */ }
      const p = createAmazonBedrock({
        accessKeyId:     creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        region:          creds.region ?? (cfg.baseUrl || undefined),
        sessionToken:    creds.sessionToken,
      })
      return p(modelId)
    }

    /**
     * Google Vertex AI uses Application Default Credentials.
     * Store project and location in the apiKey field as JSON:
     *   { "project": "my-project", "location": "us-central1" }
     * Or set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION env vars.
     */
    case 'google-vertex': {
      let gcpOpts: { project?: string; location?: string } = {}
      try { gcpOpts = JSON.parse(cfg.apiKey) } catch { /* use env vars */ }
      const p = createVertex({
        project:  gcpOpts.project,
        location: gcpOpts.location,
      })
      return p(modelId)
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

    case 'cohere':
      return createCohere({ apiKey, baseURL })(modelId)

    case 'perplexity':
      return createPerplexity({ apiKey, baseURL })(modelId)

    case 'cerebras':
      return createCerebras({ apiKey, baseURL })(modelId)

    case 'fireworks': {
      const p = createFireworks({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'deepinfra': {
      const p = createDeepInfra({ apiKey, baseURL })
      return type === 'image' ? p.image(modelId) : p(modelId)
    }

    case 'baseten':
      return createBaseten({ apiKey, baseURL })(modelId)

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
 * const { text } = await generateText({ model, prompt: 'Hello' })
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
 * Handles model IDs that contain colons (e.g. Bedrock `anthropic.claude...-v2:0`).
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

/** Get the configured default image model (`ImageModel`). */
export const getDefaultImageModel = (config: AIConfig): ImageModel | null =>
  getDefaultModel('image', config) as ImageModel | null
