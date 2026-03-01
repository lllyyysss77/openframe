function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function readImageReferenceAsDataUrl(value: string | null): Promise<string | null> {
  if (!value) return null
  if (/^data:/i.test(value)) return value

  if (!/^(https?:|blob:|openframe-thumb:)/i.test(value)) {
    return window.thumbnailsAPI.readBase64(value)
  }

  if (/^openframe-thumb:/i.test(value)) {
    try {
      const parsed = new URL(value)
      const rawPath = parsed.searchParams.get('path')
      if (!rawPath) return null
      return window.thumbnailsAPI.readBase64(decodeURIComponent(rawPath))
    } catch {
      return null
    }
  }

  try {
    const response = await fetch(value)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0) return null
    const mediaType = response.headers.get('content-type') || 'image/png'
    const base64 = uint8ToBase64(bytes)
    return `data:${mediaType};base64,${base64}`
  } catch {
    return null
  }
}
