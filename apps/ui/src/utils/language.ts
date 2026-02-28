export type UILanguage = 'zh' | 'en'

export function normalizeLanguage(
  value: string | null | undefined,
  fallback: UILanguage = 'en',
): UILanguage {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return fallback

  if (
    raw === 'zh'
    || raw === 'cn'
    || raw.startsWith('zh-')
    || raw.startsWith('zh_')
    || raw.startsWith('cn-')
    || raw.startsWith('cn_')
  ) {
    return 'zh'
  }

  if (raw === 'en' || raw.startsWith('en-') || raw.startsWith('en_')) {
    return 'en'
  }

  return fallback
}
