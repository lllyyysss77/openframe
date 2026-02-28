import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ThemePreview, type Theme } from './ThemePreview'
import type { UILanguage } from '../../utils/language'

export type { Theme }

const themes: { value: Theme; labelKey: string }[] = [
  { value: 'light',  labelKey: 'settings.themeLight'  },
  { value: 'dark',   labelKey: 'settings.themeDark'   },
  { value: 'system', labelKey: 'settings.themeSystem' },
]

interface GeneralSettingsPanelProps {
  pendingLang: UILanguage
  setPendingLang: (lang: UILanguage) => void
  pendingTheme: Theme
  setPendingTheme: (theme: Theme) => void
}

export function GeneralSettingsPanel({
  pendingLang,
  setPendingLang,
  pendingTheme,
  setPendingTheme,
}: GeneralSettingsPanelProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Language */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-base-content/60" />
          <span className="text-sm font-medium">{t('settings.language')}</span>
        </div>
        <select
          className="select select-bordered w-36"
          value={pendingLang}
          onChange={(e) => setPendingLang(e.target.value as UILanguage)}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Appearance */}
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
                  isSelected ? 'border-primary' : 'border-base-300 hover:border-base-content/30'
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
  )
}
