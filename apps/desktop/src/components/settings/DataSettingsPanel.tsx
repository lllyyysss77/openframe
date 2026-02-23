import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderInput, RotateCcw, RefreshCw } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function DataSettingsPanel() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<{ defaultDir: string; currentDir: string; pendingDir: string; dbSize: number; thumbsSize: number } | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    window.dataAPI.getInfo().then((data) => {
      setInfo(data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function handleChange() {
    const dir = await window.dataAPI.selectDirectory()
    if (!dir) return
    await window.dataAPI.setDirectory(dir)
    load()
  }

  async function handleReset() {
    await window.dataAPI.resetDirectory()
    load()
  }

  const hasPending = info && info.pendingDir !== '' && info.pendingDir !== info.currentDir

  return (
    <div className="h-full overflow-auto px-6 py-5 flex flex-col gap-6">
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : info && (
        <>
          {/* Storage location */}
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">{t('settings.dataStorage')}</h4>

            <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-1">
              <span className="text-xs text-base-content/50">{t('settings.dataCurrentDir')}</span>
              <span className="text-sm font-mono break-all">{info.currentDir}</span>
            </div>

            <div className="flex gap-2">
              <button className="btn btn-sm btn-ghost gap-1" onClick={() => window.dataAPI.openDirectory()}>
                <FolderOpen size={14} />
                {t('settings.dataOpenDir')}
              </button>
              <button className="btn btn-sm btn-ghost gap-1" onClick={handleChange}>
                <FolderInput size={14} />
                {t('settings.dataChangeDir')}
              </button>
              {info.currentDir !== info.defaultDir && (
                <button className="btn btn-sm btn-ghost gap-1" onClick={handleReset}>
                  <RotateCcw size={14} />
                  {t('settings.dataResetDir')}
                </button>
              )}
            </div>
          </section>

          {/* Pending restart banner */}
          {hasPending && (
            <div className="alert alert-warning flex flex-col items-start gap-2">
              <div>
                <p className="font-semibold text-sm">{t('settings.dataRestartRequired')}</p>
                <p className="text-xs opacity-80">{t('settings.dataRestartHint')}</p>
                <p className="text-xs font-mono mt-1 break-all">{info.pendingDir}</p>
              </div>
              <button className="btn btn-sm btn-warning gap-1" onClick={() => window.dataAPI.restart()}>
                <RefreshCw size={14} />
                {t('settings.dataRestart')}
              </button>
            </div>
          )}

          {/* Storage usage */}
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">{t('settings.dataUsage')}</h4>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between py-2 border-b border-base-200">
                <span className="text-sm">{t('settings.dataDbSize')}</span>
                <span className="text-sm font-mono text-base-content/60">{formatBytes(info.dbSize)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">{t('settings.dataThumbsSize')}</span>
                <span className="text-sm font-mono text-base-content/60">{formatBytes(info.thumbsSize)}</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
