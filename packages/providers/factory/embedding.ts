import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EmbeddingModel } from 'ai'
import { getProviderBaseUrl, type AIConfig } from '../config'
import { getProviderById } from '../providers'
import { createVolcengineEmbeddingModel } from './platforms/volcengine'
import { createOllamaEmbeddingModel } from './platforms/ollama'

export function createEmbeddingModel(
  providerId: string,
  modelId: string,
  config: AIConfig,
): EmbeddingModel | null {
  const provider = getProviderById(providerId, config.customProviders)
  const cfg = config.providers[providerId]
  if (!cfg) return null
  const apiKey = cfg.apiKey || undefined
  const baseURL = getProviderBaseUrl(cfg, 'embedding', providerId) || provider?.defaultBaseUrl || undefined

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL }).embeddingModel(modelId)
    case 'volcengine':
      return createVolcengineEmbeddingModel(modelId, apiKey, baseURL)
    case 'ollama':
      return createOllamaEmbeddingModel(modelId, apiKey, baseURL)
    default:
      if (!baseURL) return null
      return createOpenAICompatible({
        name: providerId,
        baseURL,
        apiKey: apiKey ?? 'openframe',
      }).embeddingModel(modelId)
  }
}

export function getDefaultEmbeddingModel(config: AIConfig): EmbeddingModel | null {
  const key = config.models.embedding
  if (!key) return null
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return createEmbeddingModel(key.slice(0, idx), key.slice(idx + 1), config)
}
