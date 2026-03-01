import { useCallback, useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { CheckCircle2, ChevronLeft, Clock3, Loader2, ListChecks, ScrollText, Sparkles, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CharacterPanel } from './CharacterPanel'
import { CostumePanel } from './CostumePanel'
import { ProductionWorkspacePanel } from './ProductionWorkspacePanel'
import { PropPanel } from './PropPanel'
import { ScenePanel } from './ScenePanel'
import { ScriptEditor } from './ScriptEditor'
import { ShotPanel } from './ShotPanel'
import { VideoPanel } from './VideoPanel'
import { useStudioWorkspaceLogic, type StudioTaskStatus, type StudioWorkspaceProps } from '../hooks/useStudioWorkspaceLogic'

export type { StudioWorkspaceProps } from '../hooks/useStudioWorkspaceLogic'

function renderTaskStatusIcon(status: StudioTaskStatus) {
  if (status === 'queued') return <Clock3 size={12} className="text-base-content/55" />
  if (status === 'running') return <Loader2 size={12} className="text-info animate-spin" />
  if (status === 'success') return <CheckCircle2 size={12} className="text-success" />
  return <XCircle size={12} className="text-error" />
}

export function StudioWorkspace(props: StudioWorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const isDesktopRuntime = useMemo(
    () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent),
    [],
  )
  const handleWebStudioBack = useCallback(() => {
    const params = new URLSearchParams(location.search)
    params.delete('studio')
    const search = params.toString()
    const nextHash = `#${location.pathname}${search ? `?${search}` : ''}`

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
      return
    }

    void navigate({ to: '/projects' })
  }, [location.pathname, location.search, navigate])
  const {
    activeStep,
    workflowSteps,
    setActiveStep,
    canAccessStep,
    workflowStepCompleted,
    getStepBlockedReason,
    textModelOptions,
    selectedTextModelKey,
    setSelectedTextModelKey,
    imageModelOptions,
    selectedImageModelKey,
    setSelectedImageModelKey,
    characterError,
    relationError,
    costumeError,
    costumeLibraryCharacterName,
    propError,
    sceneError,
    shotError,
    showCharacterPanel,
    showCostumePanel,
    showPropPanel,
    showScenePanel,
    showShotPanel,
    showVideoPanel,
    showProductionWorkspacePanel,
    characterPanelProps,
    costumePanelProps,
    propPanelProps,
    scenePanelProps,
    shotPanelProps,
    videoPanelProps,
    productionWorkspacePanelProps,
    scriptEditorPanelProps,
    queueOpen,
    taskQueue,
    sortedTaskQueue,
    closeCostumeLibrary,
    toggleQueueOpen,
    clearTaskQueue,
  } = useStudioWorkspaceLogic(props)

  return (
    <main className="h-full w-full overflow-hidden flex flex-col bg-linear-to-br from-base-200/40 via-base-100 to-base-200/30 text-base-content">
      <div className="sticky top-0 z-10 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <div className="relative px-4 py-3 flex items-center justify-center">
          <div className="absolute left-4 min-w-0 flex items-center gap-2">
            {!isDesktopRuntime ? (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleWebStudioBack}
                title={t('onboarding.back')}
              >
                <ChevronLeft size={12} />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{props.projectName}</p>
              <p className="truncate text-xs text-base-content/60">{props.seriesTitle}</p>
            </div>
          </div>

          <div className="absolute right-4 hidden xl:flex items-center gap-2">
            <label className="input input-sm input-bordered flex items-center gap-2 w-56">
              <ScrollText size={12} className="text-base-content/60" />
              <select
                className="w-full bg-transparent outline-none"
                value={selectedTextModelKey}
                onChange={(event) => setSelectedTextModelKey(event.target.value)}
              >
                {textModelOptions.length === 0 ? (
                  <option value="">{t('projectLibrary.aiModelEmpty')}</option>
                ) : (
                  textModelOptions.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="input input-sm input-bordered flex items-center gap-2 w-56">
              <Sparkles size={12} className="text-base-content/60" />
              <select
                className="w-full bg-transparent outline-none"
                value={selectedImageModelKey}
                onChange={(event) => setSelectedImageModelKey(event.target.value)}
              >
                {imageModelOptions.length === 0 ? (
                  <option value="">{t('projectLibrary.characterModelEmpty')}</option>
                ) : (
                  imageModelOptions.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto px-2">
            {workflowSteps.map((step) => {
              const isActive = activeStep === step.key
              const canOpen = canAccessStep(step.key)
              const isCompleted = workflowStepCompleted[step.key]
              const blockedReason = canOpen ? '' : getStepBlockedReason(step.key)
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  disabled={!canOpen}
                  title={blockedReason || undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border shrink-0 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : canOpen
                        ? 'border-base-300 hover:border-primary/30 text-base-content/70'
                        : 'border-base-300 text-base-content/40 cursor-not-allowed opacity-70'
                  }`}
                >
                  <CheckCircle2
                    size={12}
                    className={
                      isCompleted
                        ? 'text-success'
                        : isActive
                          ? 'text-primary'
                          : canOpen
                            ? 'text-base-content/50'
                            : 'text-base-content/35'
                    }
                  />
                  {step.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 min-h-0">
        {characterError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{characterError}</div> : null}
        {relationError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{relationError}</div> : null}
        {costumeError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{costumeError}</div> : null}
        {propError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{propError}</div> : null}
        {sceneError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{sceneError}</div> : null}
        {shotError ? <div className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{shotError}</div> : null}
        {showCostumePanel ? (
          <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <button type="button" className="btn btn-sm btn-ghost" onClick={closeCostumeLibrary}>
                <ChevronLeft size={14} />
                {t('projectLibrary.back')}
              </button>
              <p className="text-sm text-base-content/70">
                {t('projectLibrary.characterCostumeLibrary', { name: costumeLibraryCharacterName || '-' })}
              </p>
            </div>
            <div className="min-h-0 flex-1">
              <CostumePanel {...costumePanelProps} />
            </div>
          </div>
        ) : showCharacterPanel ? (
          <CharacterPanel {...characterPanelProps} />
        ) : showPropPanel ? (
          <PropPanel {...propPanelProps} />
        ) : showScenePanel ? (
          <ScenePanel {...scenePanelProps} />
        ) : showShotPanel ? (
          <ShotPanel {...shotPanelProps} />
        ) : showVideoPanel ? (
          <VideoPanel {...videoPanelProps} />
        ) : showProductionWorkspacePanel ? (
          <ProductionWorkspacePanel {...productionWorkspacePanelProps} />
        ) : (
          <ScriptEditor {...scriptEditorPanelProps} />
        )}
      </div>

      <div className="fixed right-4 bottom-4 z-20 w-[320px]">
        <div className="rounded-xl border border-base-300 bg-base-100/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium border-b border-base-300">
            <button type="button" className="inline-flex items-center gap-2" onClick={toggleQueueOpen}>
              <ListChecks size={14} />
              {t('projectLibrary.taskQueueTitle')}
              <span className="text-xs text-base-content/60">{taskQueue.length}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={clearTaskQueue}
              disabled={taskQueue.length === 0}
              title={t('projectLibrary.taskQueueClear')}
            >
              <Trash2 size={12} />
              {t('projectLibrary.taskQueueClear')}
            </button>
          </div>

          {queueOpen ? (
            <div className="max-h-56 overflow-auto p-2 space-y-1.5">
              {taskQueue.length === 0 ? (
                <div className="px-2 py-3 text-xs text-base-content/60">{t('projectLibrary.taskQueueEmpty')}</div>
              ) : (
                sortedTaskQueue.map((task) => (
                  <div key={task.id} className="rounded-md border border-base-300 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      {renderTaskStatusIcon(task.status)}
                      <span className="line-clamp-1 font-medium">{task.title}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-base-content/65 line-clamp-2">{task.message}</div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
