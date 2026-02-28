import { describe, expect, it } from 'vitest'
import {
  extractJsonObject,
  getScriptToolkitPrompt,
  normalizeCharacterAge,
  normalizeCharacterGender,
  parseCharacters,
  parseCharacterRelations,
  parseProps,
  parseScenes,
  parseShots,
  shortError,
  stripCliStyleParams,
} from './shared'

describe('ai shared utilities', () => {
  it('normalizes character age buckets across english and chinese inputs', () => {
    expect(normalizeCharacterAge('adult')).toBe('adult')
    expect(normalizeCharacterAge('青年')).toBe('young_adult')
    expect(normalizeCharacterAge('middle-aged')).toBe('middle_aged')
    expect(normalizeCharacterAge('unknown-age')).toBe('')
  })

  it('normalizes character gender buckets', () => {
    expect(normalizeCharacterGender('男')).toBe('male')
    expect(normalizeCharacterGender('female')).toBe('female')
    expect(normalizeCharacterGender('其他')).toBe('other')
    expect(normalizeCharacterGender('')).toBe('')
  })

  it('extracts json object from wrapped raw text', () => {
    expect(extractJsonObject('prefix {"a":1,"b":"x"} suffix')).toEqual({ a: 1, b: 'x' })
    expect(extractJsonObject('no-json-here')).toBeNull()
  })

  it('parses characters and filters invalid rows', () => {
    const rows = parseCharacters(
      JSON.stringify({
        characters: [
          {
            name: ' Alice ',
            gender: '女',
            age: 'teen',
            personality: ' brave ',
            appearance: ' tall ',
            background: ' from town ',
          },
          { name: '   ', gender: 'male', age: 'adult' },
        ],
      }),
    )

    expect(rows).toEqual([
      {
        name: 'Alice',
        gender: 'female',
        age: 'youth',
        personality: 'brave',
        appearance: 'tall',
        background: 'from town',
      },
    ])
  })

  it('parses scenes and shots with normalization and filtering', () => {
    const scenes = parseScenes(
      JSON.stringify({
        scenes: [
          { title: ' Scene 1 ', location: ' Room ', time: 'Night', mood: 'tense', description: 'A', shot_notes: 'B' },
          { title: '  ', location: 'Ignored' },
        ],
      }),
    )
    expect(scenes).toHaveLength(1)
    expect(scenes[0]?.title).toBe('Scene 1')

    const shots = parseShots(
      JSON.stringify({
        shots: [
          {
            title: ' Shot 1 ',
            scene_ref: ' Scene 1 ',
            character_refs: [' Alice ', '', 42],
            prop_refs: [' Sword ', '', 123],
            shot_size: 'close-up',
            camera_angle: 'eye-level',
            camera_move: 'dolly',
            duration_sec: '2.2',
            action: ' run ',
            dialogue: ' hello ',
          },
          {
            title: 'Shot 2',
            scene_ref: '',
            duration_sec: 1,
          },
          {
            title: 'Shot 3',
            scene_ref: 'Scene 1',
            duration_sec: 'oops',
          },
        ],
      }),
    )

    expect(shots).toHaveLength(2)
    expect(shots[0]).toMatchObject({
      title: 'Shot 1',
      scene_ref: 'Scene 1',
      character_refs: ['Alice'],
      prop_refs: ['Sword'],
      duration_sec: 2,
      action: 'run',
      dialogue: 'hello',
    })
    expect(shots[1]?.duration_sec).toBe(3)
  })

  it('parses props and filters invalid rows', () => {
    const rows = parseProps(
      JSON.stringify({
        props: [
          { name: ' Longsword ', category: ' Weapon ', description: ' forged steel blade ' },
          { name: '  ', category: 'Ignored', description: 'Ignored' },
        ],
      }),
    )

    expect(rows).toEqual([
      {
        name: 'Longsword',
        category: 'Weapon',
        description: 'forged steel blade',
      },
    ])
  })

  it('parses character relations with normalization, filtering and dedup', () => {
    const rows = parseCharacterRelations(
      JSON.stringify({
        relations: [
          {
            source_ref: ' c1 ',
            target_ref: ' c2 ',
            relation_type: ' Rival ',
            strength: '4.4',
            notes: ' long-term conflict ',
            evidence: ' they accuse each other ',
          },
          {
            source_ref: 'c1',
            target_ref: 'c2',
            relation_type: 'rival',
            strength: 5,
            notes: 'duplicate should be removed',
            evidence: 'duplicate',
          },
          {
            source_ref: 'c3',
            target_ref: 'c3',
            relation_type: 'self',
            strength: 2,
          },
          {
            source_ref: '',
            target_ref: 'c4',
            relation_type: 'ally',
            strength: 2,
          },
          {
            source_ref: 'c2',
            target_ref: 'c4',
            relation_type: 'ally',
            strength: '10',
          },
        ],
      }),
    )

    expect(rows).toEqual([
      {
        source_ref: 'c1',
        target_ref: 'c2',
        relation_type: 'Rival',
        strength: 4,
        notes: 'long-term conflict',
        evidence: 'they accuse each other',
      },
      {
        source_ref: 'c2',
        target_ref: 'c4',
        relation_type: 'ally',
        strength: 5,
        notes: '',
        evidence: '',
      },
    ])
  })

  it('strips cli-style params and builds toolkit prompt', () => {
    expect(stripCliStyleParams('a cat --ar 16:9 --stylize 250 --foo bar --q 2')).toBe('a cat')

    const prompt = getScriptToolkitPrompt('scene.expand', 'scene content', 'keep concise')
    expect(prompt).toContain('You are an expert screenplay writing assistant.')
    expect(prompt).toContain('Output language must be English.')
    expect(prompt).toContain('Extra instruction: keep concise')
    expect(prompt).toContain('Content:\nscene content')

    const zhPrompt = getScriptToolkitPrompt('script.from-idea', '这是一个中文故事想法')
    expect(zhPrompt).toContain('Output language must be Simplified Chinese.')
    expect(zhPrompt).toContain('Do not mix English screenplay tokens')
  })

  it('returns short first-line error message with max length', () => {
    expect(shortError(new Error('first line\nsecond line'))).toBe('first line')

    const long = 'x'.repeat(260)
    expect(shortError(long)).toHaveLength(200)
  })
})
