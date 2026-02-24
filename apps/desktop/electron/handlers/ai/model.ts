import {
  createProviderModelWithType,
  getDefaultTextModel,
  getDefaultImageModel,
  getDefaultVideoModel,
  isLanguageModel,
  isImageModel,
  isVideoModel,
  isCustomRestModel,
} from '@openframe/providers/factory'
import type { AIConfig } from '@openframe/providers'
import type { CustomRestModel, VideoModel } from '@openframe/providers/factory'
import type { ImageModel } from 'ai'

function parseModelKey(modelKey?: string): { providerId: string; modelId: string } | null {
  if (!modelKey) return null
  const idx = modelKey.indexOf(':')
  if (idx === -1) return null
  return {
    providerId: modelKey.slice(0, idx),
    modelId: modelKey.slice(idx + 1),
  }
}

export function resolveTextModel(config: AIConfig, modelKey?: string) {
  const parsed = parseModelKey(modelKey)
  const selected = parsed
    ? createProviderModelWithType(parsed.providerId, parsed.modelId, 'text', config)
    : null
  const model = selected && isLanguageModel(selected) ? selected : getDefaultTextModel(config)
  if (!model || !isLanguageModel(model)) return null
  return model
}

export function resolveImageModel(
  config: AIConfig,
  modelKey?: string,
): { model: ImageModel | CustomRestModel } | { error: string } {
  const parsed = parseModelKey(modelKey)
  const selected = parsed
    ? createProviderModelWithType(parsed.providerId, parsed.modelId, 'image', config)
    : null
  const model = selected ?? getDefaultImageModel(config)
  if (!model) return { error: 'No default image model configured.' as const }
  if (!isCustomRestModel(model) && !isImageModel(model)) {
    return { error: 'Selected model is not an image model.' as const }
  }
  return { model }
}

export function resolveVideoModel(
  config: AIConfig,
  modelKey?: string,
): { model: VideoModel | CustomRestModel } | { error: string } {
  const parsed = parseModelKey(modelKey)
  const selected = parsed
    ? createProviderModelWithType(parsed.providerId, parsed.modelId, 'video', config)
    : null
  const model = selected ?? getDefaultVideoModel(config)
  if (!model) return { error: 'No default video model configured.' as const }
  if (!isCustomRestModel(model) && !isVideoModel(model)) {
    return { error: 'Selected model is not a video model.' as const }
  }
  return { model }
}
