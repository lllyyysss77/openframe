import { createObjectStorageFactory } from '@openframe/shared/object-storage-factory'
import type { ObjectStorageConfig } from '@openframe/shared/object-storage-config'

type UploadBody = {
  config?: Partial<ObjectStorageConfig>
  ext?: string
  folder?: 'thumbnails' | 'videos'
  dataBase64?: string
}

type UploadResponse =
  | { ok: true; url: string }
  | { ok: false; error: string }

function setCorsHeaders(res: { setHeader: (name: string, value: string) => void }) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function json(
  res: { status: (code: number) => { json: (payload: UploadResponse) => void } },
  status: number,
  payload: UploadResponse,
) {
  res.status(status).json(payload)
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

export default async function handler(
  req: { method?: string; body?: unknown },
  res: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (payload: UploadResponse) => void }
  },
) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true, url: '' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method Not Allowed' })
    return
  }

  const body = (() => {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body) as UploadBody
      } catch {
        return {} as UploadBody
      }
    }
    return (req.body ?? {}) as UploadBody
  })()
  const ext = typeof body.ext === 'string' ? body.ext : ''
  const folder = body.folder === 'videos' ? 'videos' : 'thumbnails'
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  if (!dataBase64) {
    json(res, 400, { ok: false, error: 'Missing media data' })
    return
  }

  try {
    const storage = createObjectStorageFactory(body.config ?? null)
    if (!storage.enabled) {
      json(res, 400, { ok: false, error: 'Object storage is not configured' })
      return
    }
    const url = await storage.saveMedia({
      data: decodeBase64(dataBase64),
      ext,
      folder,
    })
    if (!url) {
      json(res, 400, { ok: false, error: 'Object storage is not configured' })
      return
    }

    json(res, 200, { ok: true, url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    json(res, 500, { ok: false, error: message || 'Upload failed' })
  }
}
