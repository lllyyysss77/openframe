import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Settings, Bot } from 'lucide-react'
import { useLiveQuery } from '@tanstack/react-db'
import { settingsCollection } from '../db/settingsCollection'
import { type AIConfig, DEFAULT_AI_CONFIG, parseAIConfig } from '@openframe/providers'

async function loadAIConfig(): Promise<AIConfig> {
  const raw = await window.aiAPI.getConfig()
  return parseAIConfig(typeof raw === 'string' ? raw : JSON.stringify(raw))
}
import { GeneralSettingsPanel, type Theme } from './settings/GeneralSettingsPanel'
import { AISettingsPanel } from './settings/AISettingsPanel'

type Category = 'general' | 'ai'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const categories: { id: Category; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'general', labelKey: 'settings.general', icon: <Settings size={16} /> },
  { id: 'ai',      labelKey: 'settings.ai',      icon: <Bot size={16} /> },
]

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'system') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', theme)
  }
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<Category>('general')

  const [pendingLang,  setPendingLang]  = useState(i18n.language.startsWith('zh') ? 'zh' : 'en')
  const [pendingTheme, setPendingTheme] = useState<Theme>('system')
  const [pendingAI,    setPendingAI]    = useState<AIConfig>(DEFAULT_AI_CONFIG)

  const { data: settingsList } = useLiveQuery(settingsCollection)

  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((s) => [s.id, s.value])),
    [settingsList],
  )

  useEffect(() => {
    if (!open) return
    setPendingLang(settingsMap.language ?? (i18n.language.startsWith('zh') ? 'zh' : 'en'))
    setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    loadAIConfig().then(setPendingAI)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function upsertSetting(key: string, value: string) {
    if (settingsList?.some((s) => s.id === key)) {
      settingsCollection.update(key, (draft) => { draft.value = value })
    } else {
      settingsCollection.insert({ id: key, value })
    }
  }

  function handleSave() {
    i18n.changeLanguage(pendingLang)
    upsertSetting('theme', pendingTheme)
    upsertSetting('language', pendingLang)
    window.aiAPI.saveConfig(pendingAI)
    applyTheme(pendingTheme)
    onClose()
  }

  function handleCancel() {
    setPendingLang(settingsMap.language ?? (i18n.language.startsWith('zh') ? 'zh' : 'en'))
    setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    loadAIConfig().then(setPendingAI)
    onClose()
  }

  const isAI = activeCategory === 'ai'

  return createPortal(
    <dialog className={`modal ${open ? 'modal-open' : ''}`}>
      <div className="modal-box p-0 max-w-4xl w-full h-[600px] flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">

          {/* ── Category Sidebar ── */}
          <aside className="w-52 shrink-0 bg-base-200 flex flex-col p-4 gap-1">
            <h2 className="text-base font-semibold mb-2">{t('menu.settings')}</h2>
            <ul className="menu bg-base-200 p-0 w-full gap-1">
              {categories.map(({ id, labelKey, icon }) => (
                <li key={id}>
                  <a
                    className={activeCategory === id ? 'menu-active' : ''}
                    onClick={() => setActiveCategory(id)}
                  >
                    {icon}
                    {t(labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* ── Content ── */}
          <div className="flex-1 flex flex-col overflow-hidden border-l border-base-300">

            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 shrink-0">
              <h3 className="text-base font-semibold">{t(`settings.${activeCategory}`)}</h3>
              <button className="btn btn-ghost btn-circle" onClick={handleCancel}>
                <X size={16} />
              </button>
            </div>

            {/* Settings body */}
            {isAI ? (
              <div className="flex-1 overflow-hidden">
                <AISettingsPanel config={pendingAI} onChange={setPendingAI} />
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-7">
                <GeneralSettingsPanel
                  pendingLang={pendingLang}
                  setPendingLang={setPendingLang}
                  pendingTheme={pendingTheme}
                  setPendingTheme={setPendingTheme}
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300 shrink-0">
              <button className="btn btn-ghost" onClick={handleCancel}>
                {t('settings.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {t('settings.save')}
              </button>
            </div>

          </div>
        </div>
      </div>
      <div className="modal-backdrop" onClick={handleCancel} />
    </dialog>,
    document.body
  )
}
