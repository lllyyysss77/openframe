import { createAlibaba } from '@ai-sdk/alibaba'
import { stripTrailingSlash } from '@openframe/shared'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MEDIA_OPTIONS, PROVIDER_IMAGE_RATIO_SIZE_MAP } from '../../constants'

export function createQwenTextModel(modelId: string, apiKey?: string, baseURL?: string) {
  const provider = createAlibaba({ apiKey, baseURL })
  return provider(modelId)
}

export function createQwenVideoModel(modelId: string, apiKey?: string, baseURL?: string) {
  return createAlibaba({ apiKey, baseURL }).video(modelId)
}

function toBaseUrl(baseURL?: string): string {
  return stripTrailingSlash(baseURL || PROVIDER_BASE_URLS.qwen)
}

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const output = row.output && typeof row.output === 'object' ? row.output as Record<string, unknown> : null
  const choices = Array.isArray(output?.choices) ? output.choices : []
  const firstChoice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : null
  const message = firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : null
  const content = Array.isArray(message?.content) ? message.content : []
  const firstContent = content[0] && typeof content[0] === 'object' ? content[0] as Record<string, unknown> : null
  return typeof firstContent?.image === 'string' ? firstContent.image : null
}

export async function generateQwenImage(args: {
  apiKey: string
  modelId: string
  prompt: string
  baseURL?: string
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string; url?: string }> {
  const mappedSize =
    args.ratio === '16:9' || args.ratio === '9:16'
      ? PROVIDER_IMAGE_RATIO_SIZE_MAP.qwen[args.ratio]
      : undefined
  const url = `${toBaseUrl(args.baseURL)}/services/aigc/multimodal-generation/generation`
  const body = {
    model: args.modelId,
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: args.prompt }],
        },
      ],
    },
    parameters: {
      n: 1,
      prompt_extend: true,
      watermark: false,
      size: args.size || mappedSize || PROVIDER_DEFAULT_MEDIA_OPTIONS.qwen.imageSize,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(text || `Qwen image generation failed: ${res.status}`)
  }

  const payload = text ? JSON.parse(text) as unknown : {}
  const imageUrl = extractImageUrl(payload)
  if (!imageUrl) {
    throw new Error('Qwen image generation response missing output image URL.')
  }

  const fileRes = await fetch(imageUrl)
  if (!fileRes.ok) {
    throw new Error(`Failed to download generated image: ${fileRes.status}`)
  }

  const mediaType = fileRes.headers.get('content-type') || 'image/png'
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  return {
    data: Array.from(bytes),
    mediaType,
    url: imageUrl,
  }
}
