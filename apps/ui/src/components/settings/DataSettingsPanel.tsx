import { useState, useEffect, useMemo } from 'react'
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
  const isDesktopRuntime = useMemo(
    () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent),
    [],
  )
  const [info, setInfo] = useState<{
    defaultDir: string
    currentDir: string
    pendingDir: string
    dbSize: number
    thumbsSize: number
    videosSize: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{
    removedImages: number
    removedVideos: number
    freedBytes: number
  } | null>(null)

  function load() {
    setLoading(true)
    window.dataAPI.getInfo()
      .then((data) => {
        setInfo(data)
      })
      .finally(() => {
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

  async function handleCleanup() {
    setCleaning(true)
    try {
      const result = await window.dataAPI.cleanupUnusedMedia()
      setCleanupResult(result)
      load()
    } finally {
      setCleaning(false)
    }
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

            {isDesktopRuntime && (
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
            )}
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
              {isDesktopRuntime && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">{t('settings.dataThumbsSize')}</span>
                  <span className="text-sm font-mono text-base-content/60">{formatBytes(info.thumbsSize)}</span>
                </div>
              )}
              {isDesktopRuntime && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">{t('settings.dataVideosSize')}</span>
                  <span className="text-sm font-mono text-base-content/60">{formatBytes(info.videosSize)}</span>
                </div>
              )}
            </div>
          </section>

          {isDesktopRuntime && (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">{t('settings.dataCleanup')}</h4>
              <p className="text-xs text-base-content/60">{t('settings.dataCleanupHint')}</p>
              <div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setCleanupConfirmOpen(true)}
                  disabled={cleaning}
                >
                  {cleaning ? t('settings.dataCleanupRunning') : t('settings.dataCleanupButton')}
                </button>
              </div>
              {cleanupResult && (
                <p className="text-xs text-base-content/60">
                  {t('settings.dataCleanupResult', {
                    images: cleanupResult.removedImages,
                    videos: cleanupResult.removedVideos,
                    size: formatBytes(cleanupResult.freedBytes),
                  })}
                </p>
              )}
            </section>
          )}

          {isDesktopRuntime && cleanupConfirmOpen && (
            <dialog className="modal modal-open">
              <div className="modal-box max-w-sm">
                <h3 className="font-bold mb-3">{t('settings.dataCleanup')}</h3>
                <p className="text-sm text-base-content/70">{t('settings.dataCleanupConfirm')}</p>
                <div className="modal-action">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCleanupConfirmOpen(false)}
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => {
                      setCleanupConfirmOpen(false)
                      void handleCleanup()
                    }}
                  >
                    {t('settings.dataCleanupButton')}
                  </button>
                </div>
              </div>
              <div className="modal-backdrop" onClick={() => setCleanupConfirmOpen(false)} />
            </dialog>
          )}
        </>
      )}
    </div>
  )
}
