import {
  getScriptToolkitPrompt as getScriptToolkitPromptFromLibrary,
  type ScriptToolkitAction,
} from '@openframe/prompts'
export type { ScriptToolkitAction } from '@openframe/prompts'

type CharacterExtractRow = {
  name: string
  gender: string
  age: string
  personality: string
  appearance: string
  background: string
}

type SceneExtractRow = {
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
}

type PropExtractRow = {
  name: string
  category: string
  description: string
}

type CharacterRelationExtractRow = {
  source_ref: string
  target_ref: string
  relation_type: string
  strength: number
  notes: string
  evidence: string
}

type ShotExtractRow = {
  title: string
  scene_ref: string
  character_refs: string[]
  prop_refs: string[]
  costume_refs: string[]
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
}

const CHARACTER_AGE_BUCKETS = ['child', 'youth', 'young_adult', 'adult', 'middle_aged', 'elder'] as const
const CHARACTER_AGE_BUCKETS_ZH = ['幼年', '少年', '青年', '成年', '中年', '老年'] as const
const CHARACTER_GENDER_BUCKETS = ['male', 'female', 'other'] as const

export const CHARACTER_AGE_CANONICAL_PROMPT = [
  'child(幼年)',
  'youth(少年)',
  'young_adult(青年)',
  'adult(成年)',
  'middle_aged(中年)',
  'elder(老年)',
] as const

export function normalizeCharacterAge(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if ((CHARACTER_AGE_BUCKETS as readonly string[]).includes(raw)) return raw

  const exactMap: Record<string, (typeof CHARACTER_AGE_BUCKETS)[number]> = {
    child: 'child',
    youth: 'youth',
    teen: 'youth',
    'young adult': 'young_adult',
    young_adult: 'young_adult',
    adult: 'adult',
    'middle-aged': 'middle_aged',
    middle_aged: 'middle_aged',
    elder: 'elder',
  }

  const lower = raw.toLowerCase()
  if ((CHARACTER_AGE_BUCKETS as readonly string[]).includes(lower)) {
    return exactMap[lower] ?? ''
  }
  if ((CHARACTER_AGE_BUCKETS_ZH as readonly string[]).includes(raw)) {
    return {
      幼年: 'child',
      少年: 'youth',
      青年: 'young_adult',
      成年: 'adult',
      中年: 'middle_aged',
      老年: 'elder',
    }[raw] as (typeof CHARACTER_AGE_BUCKETS)[number]
  }

  if (/(幼|儿童|小孩|child|kid)/i.test(raw) || /child|kid/.test(lower)) return 'child'
  if (/(少|teen|adolescent)/i.test(raw) || /teen|adolescent/.test(lower)) return 'youth'
  if (/(青|young adult|youth)/i.test(raw) || /young adult|youth/.test(lower)) return 'young_adult'
  if (/(成|adult)/i.test(raw) || /adult/.test(lower)) return 'adult'
  if (/(中年|middle)/i.test(raw) || /middle/.test(lower)) return 'middle_aged'
  if (/(老|elder|senior|aged)/i.test(raw) || /elder|senior|aged/.test(lower)) return 'elder'

  return ''
}

export function normalizeCharacterGender(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if ((CHARACTER_GENDER_BUCKETS as readonly string[]).includes(raw)) return raw

  const lower = raw.toLowerCase()
  if (lower === 'male' || /男/.test(raw)) return 'male'
  if (lower === 'female' || /女/.test(raw)) return 'female'
  if (lower === 'other' || /其|他/.test(raw)) return 'other'

  return ''
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // fall through
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const sliced = trimmed.slice(start, end + 1)
  try {
    return JSON.parse(sliced) as Record<string, unknown>
  } catch {
    return null
  }
}

export function toText(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function parseCharacters(raw: string): CharacterExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.characters) ? obj.characters : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        name: toText(row.name).trim(),
        gender: normalizeCharacterGender(toText(row.gender)),
        age: normalizeCharacterAge(toText(row.age)),
        personality: toText(row.personality).trim(),
        appearance: toText(row.appearance).trim(),
        background: toText(row.background).trim(),
      }
    })
    .filter((row) => row.name)
}

export function parseScenes(raw: string): SceneExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.scenes) ? obj.scenes : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        title: toText(row.title).trim(),
        location: toText(row.location).trim(),
        time: toText(row.time).trim(),
        mood: toText(row.mood).trim(),
        description: toText(row.description).trim(),
        shot_notes: toText(row.shot_notes).trim(),
      }
    })
    .filter((row) => row.title)
}

export function parseProps(raw: string): PropExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.props) ? obj.props : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        name: toText(row.name).trim(),
        category: toText(row.category).trim(),
        description: toText(row.description).trim(),
      }
    })
    .filter((row) => row.name)
}

export function parseCharacterRelations(raw: string): CharacterRelationExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.relations) ? obj.relations : []
  const rows = list
    .map((item) => {
      const row = item as Record<string, unknown>
      const strengthRaw = row.strength
      const strengthValue =
        typeof strengthRaw === 'number'
          ? strengthRaw
          : typeof strengthRaw === 'string'
            ? Number(strengthRaw)
            : 3
      const strength = Number.isFinite(strengthValue)
        ? Math.max(1, Math.min(5, Math.round(strengthValue)))
        : 3
      return {
        source_ref: toText(row.source_ref).trim(),
        target_ref: toText(row.target_ref).trim(),
        relation_type: toText(row.relation_type).trim(),
        strength,
        notes: toText(row.notes).trim(),
        evidence: toText(row.evidence).trim(),
      }
    })
    .filter((row) => row.source_ref && row.target_ref && row.source_ref !== row.target_ref)

  const dedup = new Map<string, CharacterRelationExtractRow>()
  for (const row of rows) {
    const key = `${row.source_ref}|${row.target_ref}|${row.relation_type.toLowerCase()}`
    if (!dedup.has(key)) {
      dedup.set(key, row)
    }
  }
  return [...dedup.values()]
}

export function parseShots(raw: string): ShotExtractRow[] {
  const obj = extractJsonObject(raw)
  const list = Array.isArray(obj?.shots) ? obj.shots : []
  return list
    .map((item) => {
      const row = item as Record<string, unknown>
      const durationRaw = row.duration_sec
      const duration =
        typeof durationRaw === 'number'
          ? durationRaw
          : typeof durationRaw === 'string'
            ? Number(durationRaw)
            : 0
      return {
        title: toText(row.title).trim(),
        scene_ref: toText(row.scene_ref).trim(),
        character_refs: Array.isArray(row.character_refs)
          ? row.character_refs.map((v) => toText(v).trim()).filter(Boolean)
          : [],
        prop_refs: Array.isArray(row.prop_refs)
          ? row.prop_refs.map((v) => toText(v).trim()).filter(Boolean)
          : [],
        costume_refs: Array.isArray(row.costume_refs)
          ? row.costume_refs.map((v) => toText(v).trim()).filter(Boolean)
          : [],
        shot_size: toText(row.shot_size).trim(),
        camera_angle: toText(row.camera_angle).trim(),
        camera_move: toText(row.camera_move).trim(),
        duration_sec: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : 3,
        action: toText(row.action).trim(),
        dialogue: toText(row.dialogue).trim(),
      }
    })
    .filter((row) => row.title && row.scene_ref)
}

export function stripCliStyleParams(prompt: string): string {
  return prompt
    .replace(/\s--ar\s+\S+/gi, '')
    .replace(/\s--stylize\s+\S+/gi, '')
    .replace(/\s--style\s+\S+/gi, '')
    .replace(/\s--v\s+\S+/gi, '')
    .replace(/\s--q\s+\S+/gi, '')
    .replace(/\s--s\s+\S+/gi, '')
    .replace(/\s--\w+(?:\s+\S+)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function getScriptToolkitPrompt(action: ScriptToolkitAction, context: string, instruction?: string): string {
  return getScriptToolkitPromptFromLibrary(action, context, instruction)
}
