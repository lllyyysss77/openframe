import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_PROMPT_OVERRIDES,
  PROMPT_OVERRIDE_FIELDS,
  type PromptModality,
  type PromptOverrideKey,
  type PromptOverrides,
} from '../../utils/prompt_overrides'

const PLACEHOLDER_DESC_KEY: Record<string, string> = {
  projectCategory: 'settings.promptVarProjectCategory',
  projectStyle: 'settings.promptVarProjectStyle',
  name: 'settings.promptVarName',
  gender: 'settings.promptVarGender',
  age: 'settings.promptVarAge',
  personality: 'settings.promptVarPersonality',
  appearance: 'settings.promptVarAppearance',
  background: 'settings.promptVarBackground',
  propName: 'settings.promptVarPropName',
  category: 'settings.promptVarCategory',
  description: 'settings.promptVarDescription',
  sceneTitle: 'settings.promptVarSceneTitle',
  location: 'settings.promptVarLocation',
  time: 'settings.promptVarTime',
  mood: 'settings.promptVarMood',
  shotTitle: 'settings.promptVarShotTitle',
  shotSize: 'settings.promptVarShotSize',
  cameraAngle: 'settings.promptVarCameraAngle',
  cameraMove: 'settings.promptVarCameraMove',
  action: 'settings.promptVarAction',
  characters: 'settings.promptVarCharacters',
  props: 'settings.promptVarProps',
  previousShotContext: 'settings.promptVarPreviousShotContext',
  nextShotContext: 'settings.promptVarNextShotContext',
  frameKind: 'settings.promptVarFrameKind',
  direction: 'settings.promptVarDirection',
  modeHint: 'settings.promptVarModeHint',
  characterAgeCanonical: 'settings.promptVarCharacterAgeCanonical',
  outputLanguage: 'settings.promptVarOutputLanguage',
  languageRule: 'settings.promptVarLanguageRule',
  script: 'settings.promptVarScript',
  currentCharacter: 'settings.promptVarCurrentCharacter',
  currentScene: 'settings.promptVarCurrentScene',
  existingRelations: 'settings.promptVarExistingRelations',
  targetCountSection: 'settings.promptVarTargetCountSection',
  scenes: 'settings.promptVarScenes',
  relations: 'settings.promptVarRelations',
}

interface PromptSettingsPanelProps {
  overrides: PromptOverrides
  onChange: (next: PromptOverrides) => void
}

export function PromptSettingsPanel({ overrides, onChange }: PromptSettingsPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<PromptModality>('image')
  const [guideFieldKey, setGuideFieldKey] = useState<PromptOverrideKey | null>(null)

  const tabItems: Array<{ key: PromptModality; labelKey: string }> = [
    { key: 'image', labelKey: 'promptLibrary.tabImage' },
    { key: 'text', labelKey: 'promptLibrary.tabText' },
    { key: 'video', labelKey: 'promptLibrary.tabVideo' },
  ]

  const fields = useMemo(
    () => PROMPT_OVERRIDE_FIELDS.filter((field) => field.modality === activeTab),
    [activeTab],
  )
  const guideField = useMemo(
    () => PROMPT_OVERRIDE_FIELDS.find((field) => field.key === guideFieldKey) ?? null,
    [guideFieldKey],
  )

  function updateField(key: PromptOverrideKey, value: string) {
    onChange({
      ...overrides,
      [key]: value,
    })
  }

  function resetAll() {
    const shouldReset = window.confirm(t('settings.promptResetConfirm'))
    if (!shouldReset) return
    onChange({ ...DEFAULT_PROMPT_OVERRIDES })
  }

  return (
    <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-4">
      <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-xs text-base-content/70">
        {t('settings.promptDesc')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="tabs tabs-boxed bg-base-200/60 p-1">
          {tabItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className={`tab ${activeTab === item.key ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(item.key)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
            {t('settings.promptReset')}
          </button>
        </div>
      </div>

      {fields.map((field) => (
        <label key={field.key} className="form-control flex flex-col gap-1.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t(field.labelKey)}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setGuideFieldKey(field.key)}
            >
              {t('settings.promptVariableGuideOpen')}
            </button>
          </span>
          <span className="text-xs text-base-content/55">{t(field.hintKey)}</span>
          <span className="text-[11px] text-base-content/45">
            {field.placeholders.map((item) => `{{${item}}}`).join('  ')}
          </span>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full h-28 font-mono"
            placeholder={t('settings.promptPlaceholder')}
            value={overrides[field.key]}
            onChange={(event) => updateField(field.key, event.target.value)}
          />
        </label>
      ))}
      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-base-300 px-3 py-6 text-center text-sm text-base-content/55">
          {t('promptLibrary.emptyTab')}
        </div>
      ) : null}

      {guideField ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-semibold text-base mb-1">{t('settings.promptVariableGuideTitle')}</h3>
            <p className="text-sm text-base-content/70 mb-1">{t(guideField.labelKey)}</p>
            <p className="text-sm text-base-content/60 mb-3">{t('settings.promptVariableGuideHint')}</p>
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-64">{t('settings.promptVariableName')}</th>
                    <th>{t('settings.promptVariableMeaning')}</th>
                  </tr>
                </thead>
                <tbody>
                  {guideField.placeholders.map((item) => (
                    <tr key={item}>
                      <td className="font-mono text-xs">{`{{${item}}}`}</td>
                      <td className="text-sm">
                        {t(PLACEHOLDER_DESC_KEY[item] ?? 'settings.promptVarUnknown')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setGuideFieldKey(null)}>
                {t('settings.promptVariableClose')}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setGuideFieldKey(null)} />
        </dialog>
      ) : null}
    </div>
  )
}
