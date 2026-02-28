let originalFetch: typeof fetch | null = null
let proxyFetchInstalled = false

type ProxyResponse =
  | { ok: true; status: number; headers: Record<string, string>; body: string; bodyEncoding: 'base64' }
  | { ok: false; error: string }

function uint8ToBase64(data: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToUint8(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function shouldProxyUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.origin === window.location.origin) return false
  return true
}

async function proxyAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window)
  }
  const request = new Request(input, init)
  const url = new URL(request.url, window.location.href)

  if (!shouldProxyUrl(url)) {
    return originalFetch(request)
  }

  const headers = Object.fromEntries(request.headers.entries())
  let body: string | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const bytes = new Uint8Array(await request.arrayBuffer())
    body = bytes.length > 0 ? uint8ToBase64(bytes) : undefined
  }

  const proxyResponse = await originalFetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: request.url,
      method: request.method,
      headers,
      body,
      bodyEncoding: 'base64',
    }),
  })

  const payload = await proxyResponse.json() as ProxyResponse
  if (!proxyResponse.ok || !payload.ok) {
    const message = payload.ok ? `Proxy HTTP ${proxyResponse.status}` : payload.error
    throw new Error(message || 'Proxy request failed')
  }

  const bytes = payload.body ? base64ToUint8(payload.body) : new Uint8Array()
  const bodyBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(bodyBuffer).set(bytes)
  return new Response(bodyBuffer, {
    status: payload.status,
    headers: payload.headers,
  })
}

export function ensureProxyFetchInstalled(): void {
  if (proxyFetchInstalled) return
  originalFetch = window.fetch.bind(window)
  const wrappedFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    proxyAwareFetch(input, init)
  window.fetch = wrappedFetch
  globalThis.fetch = wrappedFetch
  proxyFetchInstalled = true
}
