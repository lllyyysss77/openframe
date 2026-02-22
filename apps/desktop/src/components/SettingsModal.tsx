import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Settings, Globe } from 'lucide-react'
import { useLiveQuery } from '@tanstack/react-db'
import { settingsCollection } from '../db/settingsCollection'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

type Category = 'general'
type Theme = 'light' | 'dark' | 'system'

const categories: { id: Category; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'general', labelKey: 'settings.general', icon: <Settings size={16} /> },
]

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'system') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', theme)
  }
}

// 预览卡片 SVG
function ThemePreview({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'

  const sidebar = isLight ? '#e5e7eb' : '#1d232a'
  const content = isLight ? '#f9fafb' : '#191e24'
  const line1 = isLight ? '#d1d5db' : '#374151'
  const line2 = isLight ? '#e5e7eb' : '#2d3748'

  if (theme === 'system') {
    return (
      <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* 左半 light */}
        <clipPath id="clip-left">
          <rect x="0" y="0" width="60" height="80" />
        </clipPath>
        <g clipPath="url(#clip-left)">
          <rect width="120" height="80" fill="#f9fafb" />
          <rect width="32" height="80" fill="#e5e7eb" />
          <rect x="36" y="12" width="28" height="4" rx="2" fill="#d1d5db" />
          <rect x="36" y="20" width="20" height="3" rx="1.5" fill="#e5e7eb" />
          <rect x="36" y="27" width="24" height="3" rx="1.5" fill="#e5e7eb" />
          <rect x="36" y="34" width="18" height="3" rx="1.5" fill="#e5e7eb" />
          <rect x="4" y="12" width="22" height="3" rx="1.5" fill="#d1d5db" />
          <rect x="4" y="20" width="22" height="3" rx="1.5" fill="#d1d5db" />
          <rect x="4" y="28" width="22" height="3" rx="1.5" fill="#d1d5db" />
        </g>
        {/* 右半 dark */}
        <clipPath id="clip-right">
          <rect x="60" y="0" width="60" height="80" />
        </clipPath>
        <g clipPath="url(#clip-right)">
          <rect width="120" height="80" fill="#191e24" />
          <rect width="32" height="80" fill="#1d232a" />
          <rect x="36" y="12" width="28" height="4" rx="2" fill="#374151" />
          <rect x="36" y="20" width="20" height="3" rx="1.5" fill="#2d3748" />
          <rect x="36" y="27" width="24" height="3" rx="1.5" fill="#2d3748" />
          <rect x="36" y="34" width="18" height="3" rx="1.5" fill="#2d3748" />
          <rect x="4" y="12" width="22" height="3" rx="1.5" fill="#374151" />
          <rect x="4" y="20" width="22" height="3" rx="1.5" fill="#374151" />
          <rect x="4" y="28" width="22" height="3" rx="1.5" fill="#374151" />
        </g>
        {/* 分割线 */}
        <line x1="60" y1="0" x2="60" y2="80" stroke="#6b7280" strokeWidth="1" strokeDasharray="4 2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="120" height="80" fill={content} />
      {/* 侧边栏 */}
      <rect width="32" height="80" fill={sidebar} />
      {/* 侧边栏菜单项 */}
      <rect x="4" y="12" width="22" height="3" rx="1.5" fill={line1} />
      <rect x="4" y="20" width="22" height="3" rx="1.5" fill={line1} />
      <rect x="4" y="28" width="22" height="3" rx="1.5" fill={line1} />
      {/* 内容区文本行 */}
      <rect x="36" y="12" width="28" height="4" rx="2" fill={line1} />
      <rect x="36" y="20" width="20" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="27" width="24" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="34" width="18" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="44" width="70" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="51" width="60" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="58" width="66" height="3" rx="1.5" fill={line2} />
    </svg>
  )
}

const themes: { value: Theme; labelKey: string }[] = [
  { value: 'light',  labelKey: 'settings.themeLight'  },
  { value: 'dark',   labelKey: 'settings.themeDark'   },
  { value: 'system', labelKey: 'settings.themeSystem' },
]

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<Category>('general')
  const [pendingLang, setPendingLang] = useState(i18n.language.startsWith('zh') ? 'zh' : 'en')
  const [pendingTheme, setPendingTheme] = useState<Theme>('system')

  const { data: settingsList } = useLiveQuery(settingsCollection)

  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((s) => [s.id, s.value])),
    [settingsList],
  )

  // 每次打开 modal 时从 DB 同步最新值到 pending state
  useEffect(() => {
    if (open) {
      setPendingLang(settingsMap.language ?? (i18n.language.startsWith('zh') ? 'zh' : 'en'))
      setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    }
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
    applyTheme(pendingTheme)
    onClose()
  }

  function handleCancel() {
    setPendingLang(settingsMap.language ?? (i18n.language.startsWith('zh') ? 'zh' : 'en'))
    setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    onClose()
  }

  return createPortal(
    <dialog className={`modal ${open ? 'modal-open' : ''}`}>
      <div className="modal-box p-0 max-w-3xl w-full h-140 flex flex-col overflow-hidden">

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧分类 */}
          <aside className="w-52 shrink-0 bg-base-200 flex flex-col p-4 gap-1">
            <h2 className="text-base font-semibold mb-2">{t('menu.settings')}</h2>
            <ul className="menu menu-sm bg-base-200 p-0 w-full">
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

          {/* 右侧内容 */}
          <div className="flex-1 flex flex-col overflow-hidden border-l border-base-300">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
              <h3 className="text-base font-semibold">{t(`settings.${activeCategory}`)}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={handleCancel}>
                <X size={16} />
              </button>
            </div>

            {/* 设置项 */}
            <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-7">
              {activeCategory === 'general' && (
                <>
                  {/* 语言 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-base-content/60" />
                      <span className="text-sm font-medium">{t('settings.language')}</span>
                    </div>
                    <select
                      className="select select-bordered select-sm w-36"
                      value={pendingLang}
                      onChange={(e) => setPendingLang(e.target.value)}
                    >
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                  </div>

                  {/* 外观 */}
                  <div className="flex flex-col gap-3">
                    <span className="text-sm font-medium">{t('settings.appearance')}</span>
                    <div className="grid grid-cols-3 gap-3">
                      {themes.map(({ value, labelKey }) => {
                        const isSelected = pendingTheme === value
                        return (
                          <button
                            key={value}
                            onClick={() => setPendingTheme(value)}
                            className={`flex flex-col gap-2 rounded-xl border-2 p-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-primary'
                                : 'border-base-300 hover:border-base-content/30'
                            }`}
                          >
                            <div className="w-full aspect-3/2 rounded-lg overflow-hidden">
                              <ThemePreview theme={value} />
                            </div>
                            <span className={`text-xs text-center w-full font-medium ${isSelected ? 'text-primary' : 'text-base-content/70'}`}>
                              {t(labelKey)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300">
              <button className="btn btn-ghost btn-sm" onClick={handleCancel}>
                {t('settings.cancel')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
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
