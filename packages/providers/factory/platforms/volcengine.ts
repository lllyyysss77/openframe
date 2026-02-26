import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { bytesToDataUrl, decodeBase64, pickFirstString, sleep, stripTrailingSlash } from '@openframe/shared'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MEDIA_OPTIONS, PROVIDER_IMAGE_RATIO_SIZE_MAP } from '../../constants'

function toBaseUrl(baseURL?: string): string {
  return stripTrailingSlash(baseURL ?? PROVIDER_BASE_URLS.volcengine)
}

function toImageRef(image: string | number[]): string {
  if (typeof image === 'string') return image
  return bytesToDataUrl(image, 'image/png')
}

export function createVolcengineTextModel(modelId: string, apiKey?: string, baseURL?: string) {
  const provider = createOpenAICompatible({
    name: 'volcengine',
    baseURL: baseURL ?? PROVIDER_BASE_URLS.volcengine,
    apiKey,
  })
  return provider(modelId)
}

export function createVolcengineEmbeddingModel(modelId: string, apiKey?: string, baseURL?: string) {
  return createOpenAICompatible({
    name: 'volcengine',
    baseURL: baseURL ?? PROVIDER_BASE_URLS.volcengine,
    apiKey,
  }).embeddingModel(modelId)
}

export async function generateVolcengineImage(args: {
  apiKey: string
  baseURL?: string
  modelId: string
  prompt: string
  images: Array<string | number[]>
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string }> {
  const mappedSize =
    args.ratio === '16:9' || args.ratio === '9:16'
      ? PROVIDER_IMAGE_RATIO_SIZE_MAP.volcengine[args.ratio]
      : undefined
  const url = `${toBaseUrl(args.baseURL)}/images/generations`
  const body = {
    model: args.modelId,
    prompt: args.prompt,
    image: args.images.map(toImageRef),
    n: 1,
    size: args.size || mappedSize || PROVIDER_DEFAULT_MEDIA_OPTIONS.volcengine.imageSize,
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

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = json.data?.[0]
  if (!item) throw new Error('Volcengine image generation returned empty data.')

  if (item.b64_json) {
    const bytes = decodeBase64(item.b64_json)
    return { data: Array.from(bytes), mediaType: 'image/png' }
  }

  if (!item.url) {
    throw new Error('Volcengine image generation response missing image payload.')
  }

  const imageRes = await fetch(item.url)
  if (!imageRes.ok) throw new Error(`Failed to download generated image: ${imageRes.status}`)
  const mediaType = imageRes.headers.get('content-type') || 'image/png'
  const bytes = new Uint8Array(await imageRes.arrayBuffer())
  return { data: Array.from(bytes), mediaType }
}

function extractVideoTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : null
  const task = data?.task && typeof data.task === 'object' ? data.task as Record<string, unknown> : null
  return pickFirstString([
    row.id,
    row.task_id,
    row.taskId,
    data?.id,
    data?.task_id,
    data?.taskId,
    data?.generation_id,
    data?.generationId,
    task?.id,
    task?.task_id,
    task?.taskId,
  ])
}

function extractStatus(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const row = payload as Record<string, unknown>
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : null
  const task = data?.task && typeof data.task === 'object' ? data.task as Record<string, unknown> : null
  const status = pickFirstString([
    row.status,
    row.state,
    row.task_status,
    data?.status,
    data?.state,
    data?.task_status,
    task?.status,
    task?.state,
    task?.task_status,
  ])
  return (status || '').toLowerCase()
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const content = row.content && typeof row.content === 'object' && !Array.isArray(row.content)
    ? row.content as Record<string, unknown>
    : null
  return pickFirstString([content?.video_url])
}

function inferVideoMediaType(mediaType: string | null, videoUrl: string): string {
  const normalized = (mediaType || '').toLowerCase().split(';')[0].trim()
  if (normalized && normalized !== 'application/octet-stream') return normalized

  const lowerUrl = videoUrl.toLowerCase()
  if (lowerUrl.includes('.webm')) return 'video/webm'
  if (lowerUrl.includes('.mov')) return 'video/quicktime'
  return 'video/mp4'
}

function isFinished(status: string): boolean {
  return status === 'succeeded'
}

function isFailed(status: string): boolean {
  return ['failed', 'expired', 'cancelled', 'canceled'].includes(status)
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(text || `Video create failed: ${res.status}`)
  return text ? JSON.parse(text) as unknown : {}
}

async function getJson(url: string, apiKey: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) return { ok: false, status: res.status, data: text }
  return { ok: true, status: res.status, data: text ? JSON.parse(text) as unknown : {} }
}

async function pollVolcengineVideoTask(baseUrl: string, apiKey: string, taskId: string): Promise<unknown> {
  const taskUrl = `${baseUrl}/contents/generations/tasks/${taskId}`

  for (let i = 0; i < 90; i += 1) {
    const result = await getJson(taskUrl, apiKey)
    if (!result.ok) {
      throw new Error(typeof result.data === 'string' ? result.data : `Video task query failed: ${result.status}`)
    }

    const status = extractStatus(result.data)
    if (isFinished(status)) return result.data
    if (isFailed(status)) {
      const errMsg = pickFirstString([
        (result.data as Record<string, unknown>)?.error,
        (result.data as Record<string, unknown>)?.message,
      ])
      throw new Error(errMsg || `Video generation failed: ${status}`)
    }
    await sleep(3000)
  }

  throw new Error('Video generation timed out while waiting for completion.')
}

export async function generateVolcengineVideo(args: {
  modelId: string
  apiKey: string
  baseURL?: string
  prompt: string
  images?: Array<string | number[]>
  ratio?: string
  durationSec?: number
}): Promise<{ data: number[]; mediaType: string }> {
  if (!args.prompt.trim()) throw new Error('Video prompt is empty.')

  const baseUrl = toBaseUrl(args.baseURL)
  const imageRefs = Array.isArray(args.images) && args.images.length > 0
    ? args.images.map(toImageRef)
    : []
  const duration = typeof args.durationSec === 'number' && Number.isFinite(args.durationSec)
    ? Math.max(1, Math.round(args.durationSec))
    : undefined

  const contentItems: Array<Record<string, unknown>> = [{
    type: 'text',
    text: args.prompt,
  }]
  if (imageRefs.length > 0) {
    contentItems.push({
      type: 'image_url',
      image_url: { url: imageRefs[0] },
      role: 'first_frame',
    })
  }
  if (imageRefs.length > 1) {
    contentItems.push({
      type: 'image_url',
      image_url: { url: imageRefs[1] },
      role: 'last_frame',
    })
  }

  const contentBody: Record<string, unknown> = {
    model: args.modelId,
    content: contentItems,
    ratio: args.ratio || 'adaptive',
    duration,
    watermark: false,
  }

  const createPayload = await postJson(`${baseUrl}/contents/generations/tasks`, args.apiKey, contentBody)
  const taskId = extractVideoTaskId(createPayload)
  if (!taskId) throw new Error('Video generation create response missing task id.')

  const finalPayload = await pollVolcengineVideoTask(baseUrl, args.apiKey, taskId)
  const videoUrl = extractVideoUrl(finalPayload)
  if (!videoUrl) throw new Error('Video generation result missing video url.')

  const fileRes = await fetch(videoUrl)
  if (!fileRes.ok) throw new Error(`Failed to download generated video: ${fileRes.status}`)
  const mediaType = inferVideoMediaType(fileRes.headers.get('content-type'), videoUrl)
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  return { data: Array.from(bytes), mediaType }
}
