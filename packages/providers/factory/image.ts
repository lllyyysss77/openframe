import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createAzure } from '@ai-sdk/azure'
import { createTogetherAI } from '@ai-sdk/togetherai'
import { generateImage } from 'ai'
import type { ImageModel } from 'ai'
import type { AIProviderConfig } from '../config'
import { customRest } from './custom-rest'
import type {
  AnyModel,
  CustomRestModel,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePrompt,
  MediaReference,
} from './types'
import { isCustomRestModel } from './types'
import { createZhipuImageModel } from './platforms/zhipu'
import { generateVolcengineImage } from './platforms/volcengine'
import { generateQwenImage } from './platforms/qwen'

function hasReferenceImages(prompt: ImagePrompt): prompt is { text?: string; images: MediaReference[] } {
  return typeof prompt !== 'string' && Array.isArray(prompt.images) && prompt.images.length > 0
}

function toTextOnlyPrompt(prompt: ImagePrompt): string {
  if (typeof prompt === 'string') return prompt
  return prompt.text || ''
}


export function buildImageModel(providerId: string, modelId: string, cfg: AIProviderConfig): AnyModel | null {
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
      return createZhipuImageModel(modelId, apiKey, baseURL)
    case 'volcengine':
      return customRest(providerId, modelId, 'image', cfg)
    case 'qwen':
      return customRest(providerId, modelId, 'image', cfg)
    default:
      return null
  }
}

export async function generateImageWithProviderSupport(
  args: {
    model: ImageModel | CustomRestModel
    prompt: ImagePrompt
    options?: ImageGenerationOptions
  },
): Promise<ImageGenerationResult> {
  if (isCustomRestModel(args.model)) {
    if (args.model.providerId === 'qwen') {
      if (hasReferenceImages(args.prompt)) {
        throw new Error('Qwen image API currently supports text prompt only in this adapter.')
      }
      const apiKey = args.model.apiKey || ''
      if (!apiKey) throw new Error('Qwen API key is missing.')
      return generateQwenImage({
        apiKey,
        baseURL: args.model.baseUrl || undefined,
        modelId: args.model.modelId,
        prompt: toTextOnlyPrompt(args.prompt),
        size: args.options?.size,
        ratio: args.options?.ratio,
      })
    }

    if (args.model.providerId !== 'volcengine') {
      throw new Error('Selected image model is not supported yet.')
    }

    const apiKey = args.model.apiKey || ''
    if (!apiKey) throw new Error('Volcengine API key is missing.')
    return generateVolcengineImage({
      apiKey,
      baseURL: args.model.baseUrl || undefined,
      modelId: args.model.modelId,
      prompt: toTextOnlyPrompt(args.prompt),
      images: hasReferenceImages(args.prompt) ? args.prompt.images : [],
      size: args.options?.size,
      ratio: args.options?.ratio,
    })
  }

  const normalizedPrompt =
    typeof args.prompt === 'string'
      ? args.prompt
      : {
          text: args.prompt.text,
          images: (args.prompt.images ?? []).map((img) => (Array.isArray(img) ? new Uint8Array(img) : img)),
        }

  try {
    const result = await generateImage({ model: args.model, prompt: normalizedPrompt, n: 1 })
    return { data: Array.from(result.image.uint8Array), mediaType: result.image.mediaType }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const shouldRetryTextOnly = /\bnot\s*found\b/i.test(msg) && hasReferenceImages(args.prompt)
    if (!shouldRetryTextOnly) throw err

    const result = await generateImage({ model: args.model, prompt: toTextOnlyPrompt(args.prompt), n: 1 })
    return { data: Array.from(result.image.uint8Array), mediaType: result.image.mediaType }
  }
}
