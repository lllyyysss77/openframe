import { DEFAULT_PROMPT_OVERRIDES_EN } from './locales/en/prompt_overrides'
import { DEFAULT_PROMPT_OVERRIDES_ZH } from './locales/zh/prompt_overrides'

export const PROMPT_OVERRIDES_SETTING_KEY = 'prompt_overrides'

export type PromptModality = 'image' | 'text' | 'video'
export type PromptLanguage = 'en' | 'zh'

export const SUPPORTED_PROMPT_LANGUAGES: PromptLanguage[] = ['en', 'zh']

export const PROMPT_OVERRIDE_KEY_LIST = [
  'characterTurnaround',
  'propTurnaround',
  'sceneTurnaround',
  'shotImage',
  'productionFrame',
  'productionVideo',
  'extractCharactersFromScript',
  'enhanceCharacterFromScript',
  'extractScenesFromScript',
  'enhanceSceneFromScript',
  'extractPropsFromScript',
  'extractCharacterRelationsFromScript',
  'extractShotsFromScript',
] as const

export type PromptOverrideKey = (typeof PROMPT_OVERRIDE_KEY_LIST)[number]

export type PromptOverrides = Record<PromptOverrideKey, string>

export type PromptOverrideField = {
  key: PromptOverrideKey
  modality: PromptModality
  labelKey: string
  hintKey: string
  placeholders: string[]
}

export function normalizePromptLanguage(value?: string | null): PromptLanguage {
  const normalized = (value || '').trim().toLowerCase()
  if (normalized.startsWith('zh')) return 'zh'
  return 'en'
}

export const DEFAULT_PROMPT_OVERRIDES_BY_LANGUAGE: Record<PromptLanguage, PromptOverrides> = {
  en: DEFAULT_PROMPT_OVERRIDES_EN,
  zh: DEFAULT_PROMPT_OVERRIDES_ZH,
}

export const DEFAULT_PROMPT_OVERRIDES: PromptOverrides = DEFAULT_PROMPT_OVERRIDES_BY_LANGUAGE.en

export function getDefaultPromptOverrides(language?: string | null): PromptOverrides {
  return { ...DEFAULT_PROMPT_OVERRIDES_BY_LANGUAGE[normalizePromptLanguage(language)] }
}

export const PROMPT_OVERRIDE_FIELDS: PromptOverrideField[] = [
  {
    key: 'characterTurnaround',
    modality: 'image',
    labelKey: 'settings.promptCharacterTurnaround',
    hintKey: 'settings.promptCharacterTurnaroundHint',
    placeholders: [
      'projectCategory',
      'projectStyle',
      'name',
      'gender',
      'age',
      'personality',
      'appearance',
      'background',
    ],
  },
  {
    key: 'propTurnaround',
    modality: 'image',
    labelKey: 'settings.promptPropTurnaround',
    hintKey: 'settings.promptPropTurnaroundHint',
    placeholders: [
      'projectCategory',
      'projectStyle',
      'propName',
      'category',
      'description',
    ],
  },
  {
    key: 'sceneTurnaround',
    modality: 'image',
    labelKey: 'settings.promptSceneTurnaround',
    hintKey: 'settings.promptSceneTurnaroundHint',
    placeholders: [
      'projectCategory',
      'projectStyle',
      'sceneTitle',
      'location',
      'time',
      'mood',
    ],
  },
  {
    key: 'shotImage',
    modality: 'image',
    labelKey: 'settings.promptShotImage',
    hintKey: 'settings.promptShotImageHint',
    placeholders: [
      'projectCategory',
      'projectStyle',
      'shotTitle',
      'shotSize',
      'cameraAngle',
      'cameraMove',
      'action',
      'sceneTitle',
      'location',
      'time',
      'mood',
      'characters',
      'props',
      'costumes',
      'previousShotContext',
      'nextShotContext',
    ],
  },
  {
    key: 'productionFrame',
    modality: 'image',
    labelKey: 'settings.promptProductionFrame',
    hintKey: 'settings.promptProductionFrameHint',
    placeholders: [
      'frameKind',
      'direction',
      'projectCategory',
      'projectStyle',
      'shotTitle',
      'shotSize',
      'cameraAngle',
      'cameraMove',
      'action',
      'sceneTitle',
      'location',
      'time',
      'mood',
      'characters',
      'props',
      'costumes',
    ],
  },
  {
    key: 'extractCharactersFromScript',
    modality: 'text',
    labelKey: 'settings.promptExtractCharactersFromScript',
    hintKey: 'settings.promptExtractCharactersFromScriptHint',
    placeholders: [
      'characterAgeCanonical',
      'script',
    ],
  },
  {
    key: 'enhanceCharacterFromScript',
    modality: 'text',
    labelKey: 'settings.promptEnhanceCharacterFromScript',
    hintKey: 'settings.promptEnhanceCharacterFromScriptHint',
    placeholders: [
      'characterAgeCanonical',
      'currentCharacter',
      'script',
    ],
  },
  {
    key: 'extractScenesFromScript',
    modality: 'text',
    labelKey: 'settings.promptExtractScenesFromScript',
    hintKey: 'settings.promptExtractScenesFromScriptHint',
    placeholders: [
      'script',
    ],
  },
  {
    key: 'enhanceSceneFromScript',
    modality: 'text',
    labelKey: 'settings.promptEnhanceSceneFromScript',
    hintKey: 'settings.promptEnhanceSceneFromScriptHint',
    placeholders: [
      'currentScene',
      'script',
    ],
  },
  {
    key: 'extractPropsFromScript',
    modality: 'text',
    labelKey: 'settings.promptExtractPropsFromScript',
    hintKey: 'settings.promptExtractPropsFromScriptHint',
    placeholders: [
      'script',
    ],
  },
  {
    key: 'extractCharacterRelationsFromScript',
    modality: 'text',
    labelKey: 'settings.promptExtractCharacterRelationsFromScript',
    hintKey: 'settings.promptExtractCharacterRelationsFromScriptHint',
    placeholders: [
      'characters',
      'existingRelations',
      'script',
    ],
  },
  {
    key: 'extractShotsFromScript',
    modality: 'text',
    labelKey: 'settings.promptExtractShotsFromScript',
    hintKey: 'settings.promptExtractShotsFromScriptHint',
    placeholders: [
      'targetCountSection',
      'scenes',
      'characters',
      'relations',
      'props',
      'costumes',
      'script',
    ],
  },
  {
    key: 'productionVideo',
    modality: 'video',
    labelKey: 'settings.promptProductionVideo',
    hintKey: 'settings.promptProductionVideoHint',
    placeholders: [
      'modeHint',
      'projectCategory',
      'projectStyle',
      'shotTitle',
      'shotSize',
      'cameraAngle',
      'cameraMove',
      'action',
      'sceneTitle',
      'location',
      'time',
      'mood',
      'characters',
      'props',
    ],
  },
]

function parsePromptOverrideObject(
  source: Record<string, unknown>,
  base: PromptOverrides,
): PromptOverrides {
  const next = { ...base }
  for (const key of PROMPT_OVERRIDE_KEY_LIST) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      next[key] = value
    }
  }
  return next
}

function selectLanguageSource(
  parsed: Record<string, unknown>,
  language: PromptLanguage,
): Record<string, unknown> {
  const zhValue = parsed.zh
  const enValue = parsed.en
  const hasLanguageNamespace =
    (typeof zhValue === 'object' && zhValue !== null && !Array.isArray(zhValue))
    || (typeof enValue === 'object' && enValue !== null && !Array.isArray(enValue))

  if (!hasLanguageNamespace) return parsed

  const scoped = parsed[language]
  if (typeof scoped === 'object' && scoped !== null && !Array.isArray(scoped)) {
    return scoped as Record<string, unknown>
  }
  return {}
}

export function parsePromptOverridesFromSetting(
  raw: string | null | undefined,
  language?: string | null,
): PromptOverrides {
  const targetLanguage = normalizePromptLanguage(language)
  const base = getDefaultPromptOverrides(targetLanguage)
  if (!raw) return base

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    const source = selectLanguageSource(parsed as Record<string, unknown>, targetLanguage)
    return parsePromptOverrideObject(source, base)
  } catch {
    return base
  }
}

export function stringifyPromptOverridesForSetting(args: {
  raw: string | null | undefined
  language?: string | null
  overrides: PromptOverrides
}): string {
  const targetLanguage = normalizePromptLanguage(args.language)
  const nextByLanguage: Record<PromptLanguage, PromptOverrides> = {
    en: parsePromptOverridesFromSetting(args.raw, 'en'),
    zh: parsePromptOverridesFromSetting(args.raw, 'zh'),
  }
  nextByLanguage[targetLanguage] = { ...args.overrides }
  return JSON.stringify(nextByLanguage)
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!template) return ''

  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token: string) => {
    const value = variables[token]
    if (value === null || value === undefined) return ''
    return String(value)
  })

  return rendered
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}
