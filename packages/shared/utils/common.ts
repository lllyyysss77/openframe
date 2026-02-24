export function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '')
}

type GlobalBufferLike = {
  from: (data: number[] | Uint8Array | string, encoding?: string) => { toString: (encoding?: string) => string }
}

function getGlobalBuffer(): GlobalBufferLike | null {
  const maybe = globalThis as unknown as { Buffer?: GlobalBufferLike }
  return maybe.Buffer ?? null
}

export function encodeBase64(bytes: number[] | Uint8Array): string {
  const buffer = getGlobalBuffer()
  if (buffer) return buffer.from(bytes).toString('base64')

  let binary = ''
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i])
  }
  return btoa(binary)
}

export function decodeBase64(base64: string): Uint8Array {
  const buffer = getGlobalBuffer()
  if (buffer) {
    const binary = buffer.from(base64, 'base64').toString('binary')
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
    return out
  }

  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export function pickFirstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function bytesToDataUrl(bytes: number[], mediaType = 'image/png'): string {
  return `data:${mediaType};base64,${encodeBase64(bytes)}`
}
