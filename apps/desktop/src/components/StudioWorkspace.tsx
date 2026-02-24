import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { AI_PROVIDERS, type AIConfig } from '@openframe/providers'
import { ScriptEditor } from './ScriptEditor'
import { CharacterPanel, type CreateCharacterDraft } from './CharacterPanel'
import { seriesCollection } from '../db/series_collection'
import type { Character } from '../db/characters_collection'

type CharacterGender = Character['gender']
type CharacterAge = Character['age']

interface StudioWorkspaceProps {
  projectId: string
  seriesId: string
  projectName: string
  projectCategory: string
  projectGenre: string
  seriesTitle: string
  scriptContent: string
}

export function StudioWorkspace({
  projectId,
  seriesId,
  projectName,
  projectCategory,
  projectGenre,
  seriesTitle,
  scriptContent,
}: StudioWorkspaceProps) {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState<'script' | 'character'>('script')
  const [extractMode, setExtractMode] = useState<'merge' | 'replace' | null>(null)
  const [characterBusyId, setCharacterBusyId] = useState<string | null>(null)
  const [characterError, setCharacterError] = useState('')
  const [projectCharacters, setProjectCharacters] = useState<Character[]>([])
  const [imageModelOptions, setImageModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('')

  useEffect(() => {
    let active = true
    window.charactersAPI
      .getByProject(projectId)
      .then((rows) => {
        if (active) setProjectCharacters(rows)
      })
      .catch(() => {
        if (active) setProjectCharacters([])
      })

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    window.aiAPI
      .getConfig()
      .then((cfg) => {
        const config = cfg as AIConfig
        const options: Array<{ key: string; label: string }> = []
        for (const provider of AI_PROVIDERS) {
          const providerCfg = config.providers[provider.id]
          if (!providerCfg?.enabled) continue
          const builtin = provider.models.filter((m) => m.type === 'image')
          const custom = (config.customModels[provider.id] ?? []).filter((m) => m.type === 'image')
          for (const model of [...builtin, ...custom]) {
            const key = `${provider.id}:${model.id}`
            if (!config.enabledModels?.[key]) continue
            if (config.hiddenModels?.[key]) continue
            options.push({ key, label: `${provider.name} / ${model.name || model.id}` })
          }
        }
        setImageModelOptions(options)
        if (config.models?.image && options.some((item) => item.key === config.models.image)) {
          setSelectedImageModelKey(config.models.image)
        } else {
          setSelectedImageModelKey(options[0]?.key ?? '')
        }
      })
      .catch(() => {
        setImageModelOptions([])
        setSelectedImageModelKey('')
      })
  }, [])

  const workflowSteps = useMemo(
    () => [
      { key: 'script', label: t('projectLibrary.stepScript') },
      { key: 'character', label: t('projectLibrary.stepCharacter') },
      { key: 'storyboard', label: t('projectLibrary.stepStoryboard') },
      { key: 'shot', label: t('projectLibrary.stepShot') },
      { key: 'production', label: t('projectLibrary.stepProduction') },
      { key: 'export', label: t('projectLibrary.stepExport') },
    ],
    [t],
  )

  const showCharacterPanel = activeStep === 'character'

  function normalizeCharacterName(name: string): string {
    return name.trim().toLowerCase()
  }

  function normalizeGender(value: string): CharacterGender {
    const raw = (value || '').trim().toLowerCase()
    if (raw === 'male' || value === '男') return 'male'
    if (raw === 'female' || value === '女') return 'female'
    if (raw === 'other' || value === '其他') return 'other'
    return ''
  }

  function normalizeAge(value: string): CharacterAge {
    const raw = (value || '').trim().toLowerCase()
    if (raw === 'child' || value === '幼年') return 'child'
    if (raw === 'youth' || raw === 'teen' || value === '少年') return 'youth'
    if (raw === 'young_adult' || raw === 'young adult' || value === '青年') return 'young_adult'
    if (raw === 'adult' || value === '成年') return 'adult'
    if (raw === 'middle_aged' || raw === 'middle-aged' || value === '中年') return 'middle_aged'
    if (raw === 'elder' || value === '老年') return 'elder'
    return ''
  }

  function extFromMediaType(mediaType: string | undefined): string {
    const mt = (mediaType ?? '').toLowerCase().split(';')[0].trim()
    switch (mt) {
      case 'image/jpeg':
        return 'jpg'
      case 'image/png':
        return 'png'
      case 'image/webp':
        return 'webp'
      case 'image/gif':
        return 'gif'
      case 'image/bmp':
        return 'bmp'
      case 'image/svg+xml':
        return 'svg'
      case 'image/avif':
        return 'avif'
      default:
        return 'png'
    }
  }

  function mergeCharacters(existing: Character[], extracted: Character[]): Character[] {
    const next = [...existing]
    const nameIndex = new Map<string, number>()
    next.forEach((item, index) => {
      const key = normalizeCharacterName(item.name)
      if (key) nameIndex.set(key, index)
    })

    for (const item of extracted) {
      const key = normalizeCharacterName(item.name)
      if (!key) continue
      const hitIndex = nameIndex.get(key)
      if (hitIndex == null) {
        nameIndex.set(key, next.length)
        next.push(item)
        continue
      }

      const current = next[hitIndex]
      next[hitIndex] = {
        ...current,
        gender: current.gender || item.gender,
        age: current.age || item.age,
        personality: current.personality || item.personality,
        appearance: current.appearance || item.appearance,
        background: current.background || item.background,
      }
    }

    return next
  }

  async function extractCharactersFromScript(mode: 'merge' | 'replace') {
    if (!scriptContent.trim()) {
      setCharacterError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setExtractMode(mode)
    setCharacterError('')
    try {
      const result = await window.aiAPI.extractCharactersFromScript({ script: scriptContent })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }

      const extractedRows = result.characters.map((item, index) => ({
        id: crypto.randomUUID(),
        project_id: projectId,
        name: item.name,
        gender: normalizeGender(item.gender),
        age: normalizeAge(item.age),
        personality: item.personality,
        thumbnail: null,
        appearance: item.appearance,
        background: item.background,
        created_at: Date.now() + index,
      }))

      const nextRows = mode === 'replace' ? extractedRows : mergeCharacters(projectCharacters, extractedRows)
      await window.charactersAPI.replaceByProject({ projectId, characters: nextRows })
      setProjectCharacters(nextRows)
    } catch {
      setCharacterError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setExtractMode(null)
    }
  }

  async function handleExtractCharactersFromScript() {
    await extractCharactersFromScript('merge')
  }

  async function handleRegenerateCharactersFromScript() {
    const shouldReplace = window.confirm(t('projectLibrary.characterRegenerateConfirm'))
    if (!shouldReplace) return
    await extractCharactersFromScript('replace')
  }

  async function handleDeleteCharacter(id: string, name: string) {
    setCharacterError('')
    const shouldDelete = window.confirm(t('projectLibrary.characterDeleteConfirm', { name }))
    if (!shouldDelete) return
    try {
      await window.charactersAPI.delete(id)
      setProjectCharacters((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleAddCharacter(draft: CreateCharacterDraft) {
    setCharacterError('')
    const row: Character = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: draft.name,
      gender: draft.gender,
      age: draft.age,
      personality: draft.personality,
      thumbnail: draft.thumbnail,
      appearance: draft.appearance,
      background: draft.background,
      created_at: Date.now(),
    }

    try {
      await window.charactersAPI.insert(row)
      setProjectCharacters((prev) => [...prev, row])
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function persistCharacter(nextCharacter: Character) {
    await window.charactersAPI.update(nextCharacter)
    setProjectCharacters((prev) => prev.map((item) => (item.id === nextCharacter.id ? nextCharacter : item)))
  }

  async function handleUpdateCharacter(
    id: string,
    draft: CreateCharacterDraft,
  ) {
    const current = projectCharacters.find((item) => item.id === id)
    if (!current) return
    setCharacterError('')
    try {
      await persistCharacter({
        ...current,
        ...draft,
      })
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    }
  }

  async function handleSmartGenerateCharacter(
    draft: CreateCharacterDraft,
  ): Promise<{ ok: true; draft: CreateCharacterDraft } | { ok: false; error: string }> {
    if (!draft.name.trim()) {
      return { ok: false, error: t('projectLibrary.characterNameRequired') }
    }

    const context = [
      `Project category: ${projectCategory || 'unknown'}`,
      `Project style: ${projectGenre || 'unknown'}`,
      scriptContent ? `Script:\n${scriptContent}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await window.aiAPI.enhanceCharacterFromScript({
        script: context,
        character: {
          name: draft.name,
          gender: draft.gender,
          age: draft.age,
          personality: draft.personality,
          appearance: draft.appearance,
          background: draft.background,
        },
      })

      if (!result.ok) {
        return { ok: false, error: result.error }
      }

      return {
        ok: true,
        draft: {
          ...draft,
          gender: normalizeGender(result.character.gender),
          age: normalizeAge(result.character.age),
          personality: result.character.personality,
          appearance: result.character.appearance,
          background: result.character.background,
        },
      }
    } catch {
      return { ok: false, error: t('projectLibrary.aiToolkitFailed') }
    }
  }

  async function handleEnhanceCharacter(id: string) {
    if (!scriptContent.trim()) {
      setCharacterError(t('projectLibrary.aiEditorEmpty'))
      return
    }
    const character = projectCharacters.find((item) => item.id === id)
    if (!character) return

    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const result = await window.aiAPI.enhanceCharacterFromScript({
        script: scriptContent,
        character: {
          name: character.name,
          gender: character.gender,
          age: character.age,
          personality: character.personality,
          appearance: character.appearance,
          background: character.background,
        },
      })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }
      await persistCharacter({
        ...character,
        name: result.character.name || character.name,
        gender: normalizeGender(result.character.gender),
        age: normalizeAge(result.character.age),
        personality: result.character.personality,
        appearance: result.character.appearance,
        background: result.character.background,
      })
    } catch {
      setCharacterError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setCharacterBusyId(null)
    }
  }

  async function handleRefreshCharacter(id: string) {
    if (!scriptContent.trim()) {
      setCharacterError(t('projectLibrary.aiEditorEmpty'))
      return
    }
    const character = projectCharacters.find((item) => item.id === id)
    if (!character) return

    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const result = await window.aiAPI.extractCharactersFromScript({ script: scriptContent })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }

      const key = normalizeCharacterName(character.name)
      const match = result.characters.find((item) => normalizeCharacterName(item.name) === key)
      if (!match) {
        setCharacterError(t('projectLibrary.characterNotFoundInScript'))
        return
      }

      await persistCharacter({
        ...character,
        name: match.name || character.name,
        gender: normalizeGender(match.gender),
        age: normalizeAge(match.age),
        personality: match.personality,
        appearance: match.appearance,
        background: match.background,
      })
    } catch {
      setCharacterError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setCharacterBusyId(null)
    }
  }

  async function handleUploadCharacter(id: string) {
    const character = projectCharacters.find((item) => item.id === id)
    if (!character) return

    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        resolve(input.files?.[0] ?? null)
      }
      input.click()
    })

    if (!file) return
    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const ext = (() => {
        const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
        if (fromName) return fromName
        if (file.type === 'image/jpeg') return 'jpg'
        if (file.type === 'image/png') return 'png'
        if (file.type === 'image/webp') return 'webp'
        if (file.type === 'image/gif') return 'gif'
        return 'png'
      })()

      const buf = new Uint8Array(await file.arrayBuffer())
      const savedPath = await window.thumbnailsAPI.save(buf, ext)
      await persistCharacter({
        ...character,
        thumbnail: savedPath,
      })
    } catch {
      setCharacterError(t('projectLibrary.saveError'))
    } finally {
      setCharacterBusyId(null)
    }
  }

  async function handleGenerateTurnaround(id: string) {
    const character = projectCharacters.find((item) => item.id === id)
    if (!character) return

    setCharacterBusyId(id)
    setCharacterError('')
    try {
      const prompt = [
        'Character turnaround sheet, full body, front view, side view, back view, consistent costume and face.',
        'Clean studio lighting, white background, concept art style, high detail, no text watermark.',
        `Project category: ${projectCategory || 'unknown'}`,
        `Project style: ${projectGenre || 'unknown'}`,
        `Name: ${character.name}`,
        `Gender: ${character.gender || 'unknown'}`,
        `Age: ${character.age || 'unknown'}`,
        `Personality: ${character.personality || 'unknown'}`,
        `Appearance: ${character.appearance || 'unknown'}`,
        `Background: ${character.background || 'unknown'}`,
      ].join('\n')

      const result = await window.aiAPI.generateImage({ prompt, modelKey: selectedImageModelKey || undefined })
      if (!result.ok) {
        setCharacterError(result.error)
        return
      }

      const bytes = new Uint8Array(result.data)
      const ext = extFromMediaType(result.mediaType)
      const savedPath = await window.thumbnailsAPI.save(bytes, ext)

      await persistCharacter({
        ...character,
        thumbnail: savedPath,
      })
    } catch {
      setCharacterError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setCharacterBusyId(null)
    }
  }

  return (
    <main className="h-full w-full overflow-hidden flex flex-col bg-linear-to-br from-base-200/40 via-base-100 to-base-200/30 text-base-content">
      <div className="sticky top-0 z-10 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <div className="relative px-4 py-3 flex items-center justify-center">
          <div className="absolute left-4 min-w-0">
            <p className="truncate text-sm font-semibold">{projectName}</p>
            <p className="truncate text-xs text-base-content/60">{seriesTitle}</p>
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto px-2">
            {workflowSteps.map((step, idx) => (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (step.key === 'script' || step.key === 'character') setActiveStep(step.key)
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border shrink-0 text-sm font-medium transition-colors ${
                  (activeStep === 'script' && step.key === 'script') || (activeStep === 'character' && step.key === 'character')
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : idx <= 1
                      ? 'border-base-300 hover:border-primary/30 text-base-content/70'
                      : 'border-base-300 text-base-content/45'
                }`}
              >
                <CheckCircle2 size={12} className={idx === 0 ? 'text-primary' : 'text-base-content/50'} />
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 min-h-0">
        {characterError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{characterError}</div> : null}
        {showCharacterPanel ? (
          <CharacterPanel
            characters={projectCharacters}
            extractingFromDraft={extractMode === 'merge'}
            extractingRegenerate={extractMode === 'replace'}
            characterBusyId={characterBusyId}
            imageModelOptions={imageModelOptions}
            selectedImageModelKey={selectedImageModelKey}
            onImageModelChange={setSelectedImageModelKey}
            onAddCharacter={(draft) => void handleAddCharacter(draft)}
            onUpdateCharacter={(id, draft) => void handleUpdateCharacter(id, draft)}
            onSmartGenerateCharacter={handleSmartGenerateCharacter}
            onExtractFromScript={() => void handleExtractCharactersFromScript()}
            onRegenerateFromScript={() => void handleRegenerateCharactersFromScript()}
            onDeleteCharacter={(id, name) => void handleDeleteCharacter(id, name)}
            onEnhanceCharacter={(id) => void handleEnhanceCharacter(id)}
            onRefreshCharacter={(id) => void handleRefreshCharacter(id)}
            onGenerateTurnaround={(id) => void handleGenerateTurnaround(id)}
            onUploadCharacter={(id) => void handleUploadCharacter(id)}
          />
        ) : (
          <ScriptEditor
            content={scriptContent}
            onContentChange={(nextContent) => {
              if (!seriesId) return
              seriesCollection.update(seriesId, (draft) => {
                draft.script = nextContent
              })
            }}
          />
        )}
      </div>
    </main>
  )
}
