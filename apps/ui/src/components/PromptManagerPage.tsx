import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { settingsCollection } from '../db/settings_collection'
import { PromptSettingsPanel } from './settings/PromptSettingsPanel'
import {
  PROMPT_OVERRIDES_SETTING_KEY,
  parsePromptOverridesFromSetting,
  type PromptOverrides,
} from '../utils/prompt_overrides'

function upsertSetting(
  settingsList: Array<{ id: string; value: string }> | undefined,
  key: string,
  value: string,
) {
  if (settingsList?.some((item) => item.id === key)) {
    settingsCollection.update(key, (draft) => {
      draft.value = value
    })
  } else {
    settingsCollection.insert({ id: key, value })
  }
}

export function PromptManagerPage() {
  const { t } = useTranslation()
  const { data: settingsList } = useLiveQuery(settingsCollection)
  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((item) => [item.id, item.value])),
    [settingsList],
  )
  const rawPromptOverrides = settingsMap[PROMPT_OVERRIDES_SETTING_KEY] ?? ''
  const storedOverrides = useMemo(
    () => parsePromptOverridesFromSetting(rawPromptOverrides),
    [rawPromptOverrides],
  )
  const [draftOverrides, setDraftOverrides] = useState<PromptOverrides>(storedOverrides)
  const [savedHintVisible, setSavedHintVisible] = useState(false)

  useEffect(() => {
    setDraftOverrides(storedOverrides)
  }, [rawPromptOverrides, storedOverrides])

  const isDirty = useMemo(
    () => JSON.stringify(draftOverrides) !== JSON.stringify(storedOverrides),
    [draftOverrides, storedOverrides],
  )

  function handleSave() {
    if (!isDirty) return
    upsertSetting(settingsList, PROMPT_OVERRIDES_SETTING_KEY, JSON.stringify(draftOverrides))
    setSavedHintVisible(true)
    window.setTimeout(() => setSavedHintVisible(false), 1500)
  }

  function handleCancel() {
    setDraftOverrides(storedOverrides)
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">{t('promptLibrary.title')}</h1>
            <p className="text-base-content/60 text-sm">{t('promptLibrary.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleCancel}
              disabled={!isDirty}
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!isDirty}
            >
              {t('settings.save')}
            </button>
          </div>
        </div>

        {savedHintVisible ? (
          <div className="mb-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            {t('promptLibrary.saved')}
          </div>
        ) : null}

        <div className="rounded-xl border border-base-300 bg-base-100">
          <PromptSettingsPanel overrides={draftOverrides} onChange={setDraftOverrides} />
        </div>
      </div>
    </main>
  )
}
