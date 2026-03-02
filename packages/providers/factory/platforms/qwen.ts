import { createAlibaba } from '@ai-sdk/alibaba'
import { stripTrailingSlash } from '@openframe/shared'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MEDIA_OPTIONS, PROVIDER_IMAGE_RATIO_SIZE_MAP } from '../../constants'

export function createQwenTextModel(modelId: string, apiKey?: string, baseURL?: string) {
  const provider = createAlibaba({ apiKey, baseURL })
  return provider(modelId)
}

export function createQwenVideoModel(modelId: string, apiKey?: string, baseURL?: string) {
  return createAlibaba({ apiKey, baseURL: baseURL || PROVIDER_BASE_URLS.qwenMedia }).video(modelId)
}

function toBaseUrl(baseURL?: string): string {
  return stripTrailingSlash(baseURL || PROVIDER_BASE_URLS.qwenMedia)
}

/** wan2.6-image uses multimodal-generation; wanx-v1 uses text2image (async) */
function isWan26ImageModel(modelId: string): boolean {
  return modelId.trim().toLowerCase() === 'wan2.6-image'
}

function extractImageUrlFromMultimodal(payload: unknown): string | null {
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

function extractImageUrlFromText2Image(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const output = row.output && typeof row.output === 'object' ? row.output as Record<string, unknown> : null
  const results = Array.isArray(output?.results) ? output.results : []
  const first = results[0] && typeof results[0] === 'object' ? results[0] as Record<string, unknown> : null
  return typeof first?.url === 'string' ? first.url : null
}

/** wanx-v1: text2image async API. Supports 1024*1024, 720*1280, 768*1152, 1280*720 */
const WANX_V1_SIZE_MAP: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
}

async function generateQwenImageWanxV1(args: {
  apiKey: string
  modelId: string
  prompt: string
  baseURL?: string
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string; url?: string }> {
  const base = toBaseUrl(args.baseURL)
  const mappedSize = args.ratio ? WANX_V1_SIZE_MAP[args.ratio] : undefined
  const size = args.size || mappedSize || '1024*1024'

  const createRes = await fetch(`${base}/services/aigc/text2image/image-synthesis`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: args.modelId,
      input: { prompt: args.prompt },
      parameters: { style: '<auto>', size, n: 1 },
    }),
  })

  const createText = await createRes.text().catch(() => '')
  if (!createRes.ok) {
    throw new Error(createText || `Qwen image generation failed: ${createRes.status}`)
  }

  const createPayload = createText ? JSON.parse(createText) as Record<string, unknown> : {}
  const taskId = (createPayload?.output as Record<string, unknown> | undefined)?.task_id as string | undefined
  if (!taskId) {
    throw new Error('Qwen image task creation did not return task_id.')
  }

  const maxAttempts = 60
  const pollIntervalMs = 2000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs))

    const pollRes = await fetch(`${base}/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${args.apiKey}` },
    })
    const pollText = await pollRes.text().catch(() => '')
    if (!pollRes.ok) {
      throw new Error(pollText || `Qwen task poll failed: ${pollRes.status}`)
    }

    const pollPayload = pollText ? JSON.parse(pollText) as Record<string, unknown> : {}
    const output = pollPayload?.output as Record<string, unknown> | undefined
    const status = output?.task_status as string | undefined

    if (status === 'SUCCEEDED') {
      const imageUrl = extractImageUrlFromText2Image(pollPayload)
      if (!imageUrl) throw new Error('Qwen image task result missing image URL.')

      const fileRes = await fetch(imageUrl)
      if (!fileRes.ok) throw new Error(`Failed to download generated image: ${fileRes.status}`)

      const mediaType = fileRes.headers.get('content-type') || 'image/png'
      const bytes = new Uint8Array(await fileRes.arrayBuffer())
      return { data: Array.from(bytes), mediaType, url: imageUrl }
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      const msg = (output?.message as string) || status
      throw new Error(`Qwen image task ${status}: ${msg}`)
    }
  }

  throw new Error('Qwen image task timed out waiting for result.')
}

/**
 * wan2.6-image: multimodal-generation. For text-only (文生图), must use
 * enable_interleave=true + stream=true (SSE). Default enable_interleave=false
 * requires 1-4 reference images and causes "url error".
 */
async function generateQwenImageWan26(args: {
  apiKey: string
  modelId: string
  prompt: string
  baseURL?: string
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string; url?: string }> {
  const base = toBaseUrl(args.baseURL)
  const mappedSize =
    args.ratio === '16:9' || args.ratio === '9:16'
      ? PROVIDER_IMAGE_RATIO_SIZE_MAP.qwen[args.ratio]
      : undefined
  const size = args.size || mappedSize || PROVIDER_DEFAULT_MEDIA_OPTIONS.qwen.imageSize

  const url = `${base}/services/aigc/multimodal-generation/generation`
  const body = {
    model: args.modelId,
    input: {
      messages: [{ role: 'user', content: [{ text: args.prompt }] }],
    },
    parameters: {
      enable_interleave: true,
      stream: true,
      max_images: 1,
      size,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
      'X-DashScope-Sse': 'enable',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(text || `Qwen image generation failed: ${res.status}`)
  }

  const imageUrl = parseImageUrlFromSseStream(text)
  if (!imageUrl) {
    throw new Error('Qwen image generation response missing output image URL.')
  }

  const fileRes = await fetch(imageUrl)
  if (!fileRes.ok) {
    throw new Error(`Failed to download generated image: ${fileRes.status}`)
  }

  const mediaType = fileRes.headers.get('content-type') || 'image/png'
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  return { data: Array.from(bytes), mediaType, url: imageUrl }
}

function parseImageUrlFromSseStream(sseText: string): string | null {
  const lines = sseText.split('\n')
  let lastImageUrl: string | null = null
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>
        const url = extractImageUrlFromMultimodal(parsed)
        if (url) lastImageUrl = url
      } catch {
        // skip invalid JSON chunks
      }
    }
  }
  return lastImageUrl
}

export async function generateQwenImage(args: {
  apiKey: string
  modelId: string
  prompt: string
  baseURL?: string
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string; url?: string }> {
  if (isWan26ImageModel(args.modelId)) {
    return generateQwenImageWan26(args)
  }
  return generateQwenImageWanxV1(args)
}
