type ProxyRequestBody = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  bodyEncoding?: 'base64' | 'text'
}

type ProxyResponseBody = {
  ok: true
  status: number
  headers: Record<string, string>
  body: string
  bodyEncoding: 'base64'
} | {
  ok: false
  error: string
}

function setCorsHeaders(res: { setHeader: (name: string, value: string) => void }) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return false

  const parts = ipv4.slice(1).map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true

  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true

  return false
}

function parseTargetUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid target URL')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http/https proxy is allowed')
  }

  if (isPrivateHostname(url.hostname)) {
    throw new Error('Private network target is not allowed')
  }

  return url
}

function normalizeHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const input = raw as Record<string, unknown>
  const out: Record<string, string> = {}

  Object.entries(input).forEach(([key, value]) => {
    if (typeof value !== 'string') return
    const headerName = key.trim()
    if (!headerName) return

    const lower = headerName.toLowerCase()
    if (lower === 'host' || lower === 'content-length' || lower === 'connection') return

    out[headerName] = value
  })

  return out
}

function decodeBase64(value: string): Uint8Array {
  const nodeBuffer = (globalThis as unknown as {
    Buffer?: { from: (input: string, encoding: 'base64') => Uint8Array }
  }).Buffer

  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(value, 'base64'))
  }

  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

function encodeBase64(value: Uint8Array): string {
  const nodeBuffer = (globalThis as unknown as {
    Buffer?: {
      from: (input: Uint8Array) => { toString: (encoding: 'base64') => string }
    }
  }).Buffer

  if (nodeBuffer) {
    return nodeBuffer.from(value).toString('base64')
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < value.length; index += chunkSize) {
    const chunk = value.subarray(index, Math.min(index + chunkSize, value.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function decodeForwardBody(body: ProxyRequestBody): BodyInit | undefined {
  if (!body.body) return undefined
  if (body.bodyEncoding === 'text') return body.body

  try {
    const bytes = decodeBase64(body.body)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return copy.buffer
  } catch {
    throw new Error('Invalid base64 body')
  }
}

function toSerializableHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function json(
  res: { status: (code: number) => { json: (payload: ProxyResponseBody) => void } },
  status: number,
  payload: ProxyResponseBody,
) {
  res.status(status).json(payload)
}

export default async function handler(
  req: { method?: string; body?: unknown },
  res: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (payload: ProxyResponseBody) => void }
  },
) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true, status: 200, headers: {}, body: '', bodyEncoding: 'base64' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method Not Allowed' })
    return
  }

  const body = (req.body ?? {}) as Partial<ProxyRequestBody>
  const targetRaw = typeof body.url === 'string' ? body.url : ''
  if (!targetRaw) {
    json(res, 400, { ok: false, error: 'Missing target url' })
    return
  }

  try {
    const target = parseTargetUrl(targetRaw)
    const method = typeof body.method === 'string' && body.method ? body.method.toUpperCase() : 'GET'
    const headers = normalizeHeaders(body.headers)
    const forwardBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : decodeForwardBody(body as ProxyRequestBody)

    const upstream = await fetch(target.toString(), {
      method,
      headers,
      body: forwardBody,
      redirect: 'follow',
    })

    const bytes = new Uint8Array(await upstream.arrayBuffer())

    json(res, 200, {
      ok: true,
      status: upstream.status,
      headers: toSerializableHeaders(upstream.headers),
      body: encodeBase64(bytes),
      bodyEncoding: 'base64',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    json(res, 400, { ok: false, error: message })
  }
}
