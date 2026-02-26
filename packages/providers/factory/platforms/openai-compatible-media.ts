import { bytesToDataUrl, decodeBase64, sleep, stripTrailingSlash } from '../../../shared/utils/common'
import type { MediaReference } from '../types'

const IMAGE_CREATE_PATHS = [
  '/images/generations',
  '/v1/images/generations',
] as const

const VIDEO_CREATE_PATHS = [
  '/videos/generations',
  '/v1/videos/generations',
  '/video/generations',
  '/v1/video/generations',
  '/contents/generations/tasks',
  '/v1/contents/generations/tasks',
] as const

function toBaseUrl(baseURL?: string): string {
  const normalized = (baseURL || '').trim()
  if (!normalized) {
    throw new Error('Provider base URL is missing.')
  }
  return stripTrailingSlash(normalized)
}

function toImageRef(image: MediaReference): string {
  if (typeof image === 'string') return image
  return bytesToDataUrl(image, 'image/png')
}

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (apiKey?.trim()) {
    headers.authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function toCandidateUrls(baseUrl: string, paths: readonly string[]): string[] {
  const normalizedBase = stripTrailingSlash(baseUrl)
  const out: string[] = []
  for (const path of paths) {
    const normalizedPath = normalizePath(path)
    if (normalizedBase.endsWith(normalizedPath)) {
      out.push(normalizedBase)
      continue
    }
    out.push(`${normalizedBase}${normalizedPath}`)
  }
  return Array.from(new Set(out))
}

function isJsonLike(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractBase64Payload(value: string): string {
  const trimmed = value.trim()
  const marker = 'base64,'
  const idx = trimmed.indexOf(marker)
  if (idx === -1) return trimmed
  return trimmed.slice(idx + marker.length)
}

function decodeDataUrl(url: string): { data: number[]; mediaType: string } | null {
  const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(url.trim())
  if (!match) return null
  const mediaType = (match[1] || 'application/octet-stream').trim()
  const b64 = match[2] || ''
  try {
    const bytes = decodeBase64(b64)
    return {
      data: Array.from(bytes),
      mediaType,
    }
  } catch {
    return null
  }
}

async function downloadMedia(url: string, fallbackMediaType: string): Promise<{ data: number[]; mediaType: string }> {
  const dataUrl = decodeDataUrl(url)
  if (dataUrl) return dataUrl

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download generated media: ${res.status}`)
  }
  const mediaType = (res.headers.get('content-type') || fallbackMediaType).split(';')[0].trim()
  const bytes = new Uint8Array(await res.arrayBuffer())
  return {
    data: Array.from(bytes),
    mediaType: mediaType || fallbackMediaType,
  }
}

function findFirstStringByKeys(payload: unknown, keys: readonly string[]): string | null {
  const loweredKeys = new Set(keys.map((key) => key.toLowerCase()))

  function visit(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null

    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = visit(item)
        if (hit) return hit
      }
      return null
    }

    const row = value as Record<string, unknown>
    for (const [key, raw] of Object.entries(row)) {
      if (!loweredKeys.has(key.toLowerCase())) continue
      if (typeof raw === 'string' && raw.trim()) return raw
    }

    for (const nested of Object.values(row)) {
      const hit = visit(nested)
      if (hit) return hit
    }
    return null
  }

  return visit(payload)
}

function extractErrorMessage(payload: unknown): string | null {
  const direct = findFirstStringByKeys(payload, [
    'message',
    'msg',
    'error_message',
    'error_msg',
    'detail',
  ])
  if (direct) return direct

  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  if (typeof row.error === 'string' && row.error.trim()) return row.error
  if (row.error && typeof row.error === 'object') {
    const nested = row.error as Record<string, unknown>
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message
  }
  return null
}

function extractTaskId(payload: unknown): string | null {
  return findFirstStringByKeys(payload, [
    'task_id',
    'taskId',
    'id',
    'generation_id',
    'generationId',
    'job_id',
    'jobId',
  ])
}

function extractStatus(payload: unknown): string {
  const raw = findFirstStringByKeys(payload, [
    'status',
    'state',
    'task_status',
    'taskState',
  ])
  return (raw || '').toLowerCase().trim()
}

function isSuccessStatus(status: string): boolean {
  return ['succeeded', 'success', 'completed', 'complete', 'done', 'finished', 'ready'].includes(status)
}

function isFailureStatus(status: string): boolean {
  return ['failed', 'error', 'expired', 'cancelled', 'canceled', 'rejected'].includes(status)
}

function extractImagePayload(payload: unknown): { kind: 'base64'; value: string } | { kind: 'url'; value: string } | null {
  const b64 = findFirstStringByKeys(payload, ['b64_json', 'image_base64', 'base64', 'b64'])
  if (b64) return { kind: 'base64', value: b64 }

  const url = findFirstStringByKeys(payload, ['image_url', 'url'])
  if (url) return { kind: 'url', value: url }

  return null
}

function extractVideoPayload(payload: unknown): { kind: 'base64'; value: string } | { kind: 'url'; value: string } | null {
  const b64 = findFirstStringByKeys(payload, ['video_b64', 'b64_json', 'base64', 'b64'])
  if (b64) return { kind: 'base64', value: b64 }

  const url = findFirstStringByKeys(payload, ['video_url', 'url', 'download_url'])
  if (url) return { kind: 'url', value: url }

  return null
}

function inferVideoMediaType(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('.webm')) return 'video/webm'
  if (lower.includes('.mov')) return 'video/quicktime'
  return 'video/mp4'
}

async function postJsonWithFallback(args: {
  urls: string[]
  body: Record<string, unknown>
  apiKey?: string
  requestLabel: string
}): Promise<{ payload: unknown }> {
  let candidateError = ''

  for (const url of args.urls) {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(args.apiKey),
      body: JSON.stringify(args.body),
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) {
      const errMsg = text || `${args.requestLabel} failed: ${res.status}`
      if ([404, 405].includes(res.status)) {
        candidateError = errMsg
        continue
      }
      throw new Error(errMsg)
    }

    if (!text.trim()) {
      return { payload: {} }
    }
    if (!isJsonLike(text)) {
      return { payload: { raw: text } }
    }

    const payload = safeParseJson(text)
    if (payload == null) {
      throw new Error(`${args.requestLabel} returned invalid JSON.`)
    }
    return { payload }
  }

  throw new Error(candidateError || `${args.requestLabel} failed: no compatible endpoint found.`)
}

async function getJsonWithFallback(args: {
  urls: string[]
  apiKey?: string
}): Promise<{ payload: unknown } | null> {
  let hasNon404Failure = false

  for (const url of args.urls) {
    const headers: Record<string, string> = {}
    if (args.apiKey?.trim()) {
      headers.authorization = `Bearer ${args.apiKey.trim()}`
    }
    const res = await fetch(url, { method: 'GET', headers })
    if (!res.ok) {
      if (![404, 405].includes(res.status)) hasNon404Failure = true
      continue
    }

    const text = await res.text().catch(() => '')
    if (!text.trim()) return { payload: {} }
    if (!isJsonLike(text)) return { payload: { raw: text } }

    const payload = safeParseJson(text)
    if (payload == null) return { payload: { raw: text } }
    return { payload }
  }

  if (hasNon404Failure) {
    return { payload: {} }
  }
  return null
}

export async function generateOpenAICompatibleImage(args: {
  apiKey?: string
  baseURL?: string
  modelId: string
  prompt: string
  images?: MediaReference[]
  size?: string
  ratio?: string
}): Promise<{ data: number[]; mediaType: string }> {
  const prompt = args.prompt.trim()
  if (!prompt) throw new Error('Image prompt is empty.')

  const baseUrl = toBaseUrl(args.baseURL)
  const imageRefs = Array.isArray(args.images) ? args.images.map(toImageRef) : []
  const body: Record<string, unknown> = {
    model: args.modelId,
    prompt,
    n: 1,
  }

  if (args.size?.trim()) body.size = args.size.trim()
  if (args.ratio?.trim()) body.aspect_ratio = args.ratio.trim()
  if (imageRefs.length === 1) body.image = imageRefs[0]
  if (imageRefs.length > 1) body.image = imageRefs

  const createUrls = toCandidateUrls(baseUrl, IMAGE_CREATE_PATHS)
  const createResult = await postJsonWithFallback({
    urls: createUrls,
    body,
    apiKey: args.apiKey,
    requestLabel: 'Image generation request',
  })

  const imagePayload = extractImagePayload(createResult.payload)
  if (!imagePayload) {
    const err = extractErrorMessage(createResult.payload)
    if (err) throw new Error(err)
    throw new Error('Image generation response missing image payload.')
  }

  if (imagePayload.kind === 'base64') {
    const normalizedB64 = extractBase64Payload(imagePayload.value)
    const bytes = decodeBase64(normalizedB64)
    return {
      data: Array.from(bytes),
      mediaType: 'image/png',
    }
  }

  return downloadMedia(imagePayload.value, 'image/png')
}

function buildVideoStatusUrls(baseUrl: string, taskId: string): string[] {
  const paths = [
    `/videos/generations/${taskId}`,
    `/v1/videos/generations/${taskId}`,
    `/video/generations/${taskId}`,
    `/v1/video/generations/${taskId}`,
    `/contents/generations/tasks/${taskId}`,
    `/v1/contents/generations/tasks/${taskId}`,
    `/tasks/${taskId}`,
    `/v1/tasks/${taskId}`,
  ]
  return toCandidateUrls(baseUrl, paths)
}

export async function generateOpenAICompatibleVideo(args: {
  apiKey?: string
  baseURL?: string
  modelId: string
  prompt: string
  images?: MediaReference[]
  ratio?: string
  durationSec?: number
}): Promise<{ data: number[]; mediaType: string }> {
  const prompt = args.prompt.trim()
  if (!prompt) throw new Error('Video prompt is empty.')

  const baseUrl = toBaseUrl(args.baseURL)
  const imageRefs = Array.isArray(args.images) ? args.images.map(toImageRef) : []
  const duration = typeof args.durationSec === 'number' && Number.isFinite(args.durationSec)
    ? Math.max(1, Math.round(args.durationSec))
    : undefined

  const body: Record<string, unknown> = {
    model: args.modelId,
    prompt,
  }
  if (imageRefs.length === 1) body.image = imageRefs[0]
  if (imageRefs.length > 1) body.images = imageRefs
  if (args.ratio?.trim()) body.aspect_ratio = args.ratio.trim()
  if (duration) body.duration = duration

  const createUrls = toCandidateUrls(baseUrl, VIDEO_CREATE_PATHS)
  const createResult = await postJsonWithFallback({
    urls: createUrls,
    body,
    apiKey: args.apiKey,
    requestLabel: 'Video generation request',
  })

  const immediateVideo = extractVideoPayload(createResult.payload)
  if (immediateVideo) {
    if (immediateVideo.kind === 'base64') {
      const bytes = decodeBase64(extractBase64Payload(immediateVideo.value))
      return { data: Array.from(bytes), mediaType: 'video/mp4' }
    }
    return downloadMedia(immediateVideo.value, inferVideoMediaType(immediateVideo.value))
  }

  const taskId = extractTaskId(createResult.payload)
  if (!taskId) {
    const err = extractErrorMessage(createResult.payload)
    if (err) throw new Error(err)
    throw new Error('Video generation response missing task id.')
  }

  const statusUrls = buildVideoStatusUrls(baseUrl, taskId)
  let lastPayload: unknown = null

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const polled = await getJsonWithFallback({
      urls: statusUrls,
      apiKey: args.apiKey,
    })
    if (!polled) {
      await sleep(3000)
      continue
    }

    lastPayload = polled.payload
    const videoPayload = extractVideoPayload(polled.payload)
    if (videoPayload) {
      if (videoPayload.kind === 'base64') {
        const bytes = decodeBase64(extractBase64Payload(videoPayload.value))
        return { data: Array.from(bytes), mediaType: 'video/mp4' }
      }
      return downloadMedia(videoPayload.value, inferVideoMediaType(videoPayload.value))
    }

    const status = extractStatus(polled.payload)
    if (isFailureStatus(status)) {
      const err = extractErrorMessage(polled.payload)
      throw new Error(err || `Video generation failed: ${status}`)
    }
    if (status && isSuccessStatus(status)) {
      break
    }

    await sleep(3000)
  }

  const finalErr = extractErrorMessage(lastPayload)
  throw new Error(finalErr || 'Video generation timed out while waiting for completion.')
}
