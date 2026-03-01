import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  isObjectStorageEnabled,
  normalizeObjectStorageConfig,
  parseObjectStorageConfig,
  type ObjectStorageConfig,
} from './object_storage_config.js'

export type ObjectStorageFolder = 'thumbnails' | 'videos'

type CreateObjectStorageFactoryArgs = string | null | undefined | Partial<ObjectStorageConfig> | ObjectStorageConfig

type SaveMediaArgs = {
  data: Uint8Array
  ext: string
  folder?: ObjectStorageFolder
}

function randomUuid(): string {
  const cryptoApi = (globalThis as {
    crypto?: {
      randomUUID?: () => string
      getRandomValues?: (array: Uint8Array) => Uint8Array
    }
  }).crypto

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeEndpoint(endpoint: string): URL {
  const value = endpoint.trim()
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  return new URL(withProtocol)
}

function sanitizePrefix(prefix: string): string {
  return prefix
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

function normalizeExt(ext: string, folder?: ObjectStorageFolder): string {
  const normalized = ext.replace(/^\./, '').trim().toLowerCase()
  if (!normalized) return folder === 'videos' ? 'mp4' : 'png'
  return normalized
}

function contentTypeFromExt(ext: string, folder?: ObjectStorageFolder): string {
  const value = normalizeExt(ext, folder)
  if (value === 'jpg' || value === 'jpeg') return 'image/jpeg'
  if (value === 'png') return 'image/png'
  if (value === 'webp') return 'image/webp'
  if (value === 'gif') return 'image/gif'
  if (value === 'bmp') return 'image/bmp'
  if (value === 'svg') return 'image/svg+xml'
  if (value === 'avif') return 'image/avif'
  if (value === 'mp4') return 'video/mp4'
  if (value === 'webm') return 'video/webm'
  if (value === 'mov') return 'video/quicktime'
  return folder === 'videos' ? 'video/mp4' : 'image/png'
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function joinUrlPath(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeObjectKey(key)}`
}

function buildObjectKey(config: ObjectStorageConfig, ext: string, folder?: ObjectStorageFolder): string {
  const mediaFolder = folder === 'videos' ? 'videos' : 'thumbnails'
  const now = new Date()
  const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const filename = `${randomUuid()}.${normalizeExt(ext, folder)}`
  const prefix = sanitizePrefix(config.pathPrefix)
  return [prefix, mediaFolder, datePath, filename].filter(Boolean).join('/')
}

function buildObjectUrl(config: ObjectStorageConfig, key: string): string {
  if (config.publicBaseUrl.trim()) {
    return joinUrlPath(config.publicBaseUrl.trim(), key)
  }

  const endpoint = normalizeEndpoint(config.endpoint)
  const bucket = config.bucket.trim()
  const encodedKey = encodeObjectKey(key)
  const endpointPath = endpoint.pathname.replace(/\/+$/, '')
  const originWithPath = `${endpoint.origin}${endpointPath}`

  if (config.forcePathStyle) {
    return `${originWithPath}/${encodeURIComponent(bucket)}/${encodedKey}`
  }

  const host = endpoint.port
    ? `${endpoint.hostname}:${endpoint.port}`
    : endpoint.hostname
  return `${endpoint.protocol}//${bucket}.${host}${endpointPath}/${encodedKey}`
}

export type ObjectStorageFactory = {
  readonly config: ObjectStorageConfig
  readonly enabled: boolean
  saveMedia: (args: SaveMediaArgs) => Promise<string | null>
}

export function createObjectStorageFactory(input: CreateObjectStorageFactoryArgs): ObjectStorageFactory {
  const config = typeof input === 'string' || input == null
    ? parseObjectStorageConfig(input)
    : normalizeObjectStorageConfig(input)

  const enabled = isObjectStorageEnabled(config)
  const client = enabled
    ? new S3Client({
      region: config.region.trim() || 'auto',
      endpoint: normalizeEndpoint(config.endpoint).toString(),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
      },
    })
    : null

  return {
    config,
    enabled,
    async saveMedia(args: SaveMediaArgs): Promise<string | null> {
      if (!enabled || !client) return null
      const bucket = config.bucket.trim()
      const key = buildObjectKey(config, args.ext, args.folder)
      const contentType = contentTypeFromExt(args.ext, args.folder)
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: args.data,
        ContentType: contentType,
      }))
      return buildObjectUrl(config, key)
    },
  }
}
