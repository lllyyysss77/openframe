import type { LanguageModel, ImageModel } from 'ai'
import { getProviderBaseUrl, type AIConfig } from '../config'
import { getProviderById, type ModelType } from '../providers'
import { buildTextModel } from './text'
import { buildImageModel } from './image'
import { buildVideoModel } from './video'
import type { AnyModel, CustomRestModel, VideoModel } from './types'

function resolveModelType(
  providerId: string,
  modelId: string,
  config: AIConfig,
): ModelType {
  const providerDef = getProviderById(providerId, config.customProviders)
  const allModels = [
    ...(providerDef?.models ?? []),
    ...(config.customModels[providerId] ?? []),
  ]
  return allModels.find((m) => m.id === modelId)?.type ?? 'text'
}

function buildModel(
  providerId: string,
  modelId: string,
  config: AIConfig,
  type: ModelType,
): AnyModel | null {
  const providerDef = getProviderById(providerId, config.customProviders)
  const cfg = config.providers[providerId]
  if (!cfg) return null
  const resolvedBaseUrl = getProviderBaseUrl(cfg, type, providerId) || providerDef?.defaultBaseUrl || ''
  const normalizedCfg = {
    apiKey: cfg.apiKey,
    baseUrl: resolvedBaseUrl,
    enabled: cfg.enabled,
    baseUrlText: cfg.baseUrlText,
    baseUrlImage: cfg.baseUrlImage,
    baseUrlVideo: cfg.baseUrlVideo,
  }

  if (type === 'text') return buildTextModel(providerId, modelId, normalizedCfg)
  if (type === 'image') return buildImageModel(providerId, modelId, normalizedCfg)
  if (type === 'video') return buildVideoModel(providerId, modelId, normalizedCfg)
  if (type === 'embedding') return null
  return null
}

export function createProviderModel(providerId: string, modelId: string, config: AIConfig): AnyModel | null {
  const type = resolveModelType(providerId, modelId, config)
  return buildModel(providerId, modelId, config, type)
}

export function createProviderModelWithType(
  providerId: string,
  modelId: string,
  type: ModelType,
  config: AIConfig,
): AnyModel | null {
  return buildModel(providerId, modelId, config, type)
}

export function createModelFromKey(key: string, config: AIConfig): AnyModel | null {
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return createProviderModel(key.slice(0, idx), key.slice(idx + 1), config)
}

export function getDefaultModel(type: ModelType, config: AIConfig): AnyModel | null {
  const key = config.models[type]
  if (!key) return null
  return createModelFromKey(key, config)
}

export const getDefaultTextModel = (config: AIConfig): LanguageModel | null =>
  getDefaultModel('text', config) as LanguageModel | null

export const getDefaultImageModel = (config: AIConfig): ImageModel | CustomRestModel | null =>
  getDefaultModel('image', config) as ImageModel | CustomRestModel | null

export const getDefaultVideoModel = (config: AIConfig): VideoModel | CustomRestModel | null =>
  getDefaultModel('video', config) as VideoModel | CustomRestModel | null
