import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  MessageSquare,
  SwatchBook,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import SettingsModal from './SettingsModal'

interface MenuItem {
  icon: LucideIcon
  labelKey: string
  to: string
}

const menuItems: MenuItem[] = [
  { to: '/projects', icon: FolderOpen, labelKey: 'menu.projects' },
  { to: '/genres', icon: SwatchBook, labelKey: 'menu.list' },
  { to: '/prompts', icon: MessageSquare, labelKey: 'menu.prompts' },
]
const ONBOARDING_VERSION = '3'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const { location } = useRouterState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingPending, setOnboardingPending] = useState(false)
  const isDesktopRuntime = useMemo(
    () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent),
    [],
  )
  const isStudioWindow = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('studio') === '1'
  }, [location.search])

  const markOnboardingSeen = useCallback(() => {
    setOnboardingPending(false)
    void window.settingsAPI.upsert('onboarding_seen', '1')
    void window.settingsAPI.upsert('onboarding_version', ONBOARDING_VERSION)
  }, [])

  useEffect(() => {
    if (isStudioWindow) return
    let active = true
    void window.settingsAPI
      .getAll()
      .then((rows) => {
        if (!active) return
        const seen = rows.find((row) => row.key === 'onboarding_seen')?.value === '1'
        const seenVersion = rows.find((row) => row.key === 'onboarding_version')?.value || ''
        const shouldShow = !seen || seenVersion !== ONBOARDING_VERSION
        setOnboardingPending(shouldShow)
      })
      .catch(() => {
        if (active) setOnboardingPending(true)
      })
    return () => {
      active = false
    }
  }, [isStudioWindow])

  useEffect(() => {
    if (!onboardingPending || isStudioWindow) return
    let disposed = false
    const timer = window.setTimeout(() => {
      if (disposed) return

      const steps: DriveStep[] = [
        {
          element: '[data-tour="menu-projects"]',
          popover: {
            title: t('onboarding.stepProjectsTitle'),
            description: t('onboarding.stepProjectsDesc'),
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-tour="projects-create"]',
          popover: {
            title: t('onboarding.stepStudioTitle'),
            description: t('onboarding.stepStudioDesc'),
            side: 'left',
            align: 'center',
          },
        },
        {
          popover: {
            title: t('onboarding.stepAiTitle'),
            description: t('onboarding.stepAiDesc'),
          },
        },
        {
          element: '[data-tour="menu-settings"]',
          popover: {
            title: t('onboarding.stepSettingsTitle'),
            description: t('onboarding.stepSettingsDesc'),
            side: 'right',
            align: 'end',
          },
        },
      ]

      const availableSteps = steps.filter((step) => {
        if (!step.element) return true
        if (typeof step.element === 'string') return Boolean(document.querySelector(step.element))
        return true
      })

      if (availableSteps.length === 0) {
        markOnboardingSeen()
        return
      }

      const onboardingDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayClickBehavior: 'close',
        nextBtnText: t('onboarding.next'),
        prevBtnText: t('onboarding.back'),
        doneBtnText: t('onboarding.finish'),
        steps: availableSteps,
        onDestroyed: () => {
          markOnboardingSeen()
        },
      })

      onboardingDriver.drive()
    }, 120)

    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [isStudioWindow, markOnboardingSeen, onboardingPending, t])

  if (isStudioWindow) {
    return (
      <>
        {isDesktopRuntime ? (
          <div
            className="h-10 w-full shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        ) : null}
        <div className="flex-1 overflow-hidden">{children}</div>
      </>
    )
  }

  return (
    <>
      {/* 拖动区域（仅 desktop） */}
      {isDesktopRuntime ? (
        <div
          className="h-10 w-full shrink-0 select-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      ) : null}

      <div className="drawer drawer-open flex-1 overflow-hidden">
        <input id="main-drawer" type="checkbox" className="drawer-toggle" />

        {/* 右侧内容区 */}
        <div className="drawer-content flex flex-col overflow-auto">
          {children}
        </div>

        {/* 左侧侧边栏 */}
        <div className="drawer-side border-r border-base-300 h-full">
          <label htmlFor="main-drawer" className="drawer-overlay" />
          <aside className="bg-base-200 w-56 flex flex-col h-full">

            {/* 应用名 */}
            <div className="px-4 py-3 text-xs font-semibold text-base-content/50 uppercase tracking-widest">
              {t('common.appName')}
            </div>

            {/* 菜单 */}
            <ul className="menu bg-base-200 flex-1 px-2 w-full gap-2">
              {menuItems.map(({ to, icon: Icon, labelKey }) => {
                const isActive = location.pathname === to
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      className={`${isActive ? 'menu-active' : ''} py-2`}
                      data-tour={to === '/projects' ? 'menu-projects' : to === '/genres' ? 'menu-genres' : undefined}
                    >
                      <Icon size={16} />
                      {t(labelKey)}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* 底部：Settings 弹框触发 */}
            <div className="p-2 border-t border-base-300">
              <button
                className="flex items-center gap-2 w-full rounded-lg px-2 py-2 transition-colors hover:bg-base-300 text-left"
                onClick={() => setSettingsOpen(true)}
                data-tour="menu-settings"
              >
                <Settings size={16} />
                <span className="text-sm">{t('menu.settings')}</span>
              </button>
            </div>

            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

          </aside>
        </div>
      </div>
    </>
  )
}
