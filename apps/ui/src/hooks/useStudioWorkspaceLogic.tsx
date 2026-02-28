import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSelectableModelsByType, type AIConfig } from '@openframe/providers'
import { useLiveQuery } from '@tanstack/react-db'
import PQueue from 'p-queue'
import { useCharacterStudioLogic } from './panels/useCharacterStudioLogic'
import { usePropStudioLogic } from './panels/usePropStudioLogic'
import { useSceneStudioLogic } from './panels/useSceneStudioLogic'
import { useShotProductionStudioLogic } from './panels/useShotProductionStudioLogic'
import { seriesCollection } from '../db/series_collection'
import { settingsCollection } from '../db/settings_collection'
import {
  PROMPT_OVERRIDES_SETTING_KEY,
  parsePromptOverridesFromSetting,
} from '../utils/prompt_overrides'

export type StudioTaskStatus = 'queued' | 'running' | 'success' | 'error'

export type StudioTaskItem = {
  id: string
  title: string
  status: StudioTaskStatus
  message: string
  created_at: number
}

type WorkflowStepKey = 'script' | 'character' | 'prop' | 'storyboard' | 'shot' | 'production' | 'export'

export interface StudioWorkspaceProps {
  projectId: string
  seriesId: string
  projectName: string
  projectRatio: '16:9' | '9:16'
  projectCategory: string
  projectGenre: string
  seriesTitle: string
  scriptContent: string
}

export function useStudioWorkspaceLogic({
  projectId,
  seriesId,
  projectName,
  projectRatio,
  projectCategory,
  projectGenre,
  seriesTitle,
  scriptContent,
}: StudioWorkspaceProps) {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState<WorkflowStepKey>('script')
  const [taskQueue, setTaskQueue] = useState<StudioTaskItem[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const queueRef = useRef(new PQueue({ concurrency: 1 }))
  const mediaQueueRef = useRef(new PQueue({ concurrency: 5 }))
  const [textModelOptions, setTextModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedTextModelKey, setSelectedTextModelKey] = useState('')
  const [imageModelOptions, setImageModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('')
  const [videoModelOptions, setVideoModelOptions] = useState<Array<{ key: string; label: string }>>([])
  const [selectedVideoModelKey, setSelectedVideoModelKey] = useState('')
  const { data: settingsList } = useLiveQuery(settingsCollection)
  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((item) => [item.id, item.value])),
    [settingsList],
  )
  const promptOverrides = useMemo(
    () => parsePromptOverridesFromSetting(settingsMap[PROMPT_OVERRIDES_SETTING_KEY]),
    [settingsMap],
  )

  function updateTask(id: string, patch: Partial<StudioTaskItem>) {
    setTaskQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function enqueueTask(title: string, runner: () => Promise<void>, queueType: 'default' | 'media' = 'default') {
    const id = crypto.randomUUID()
    setTaskQueue((prev) => [
      ...prev,
      {
        id,
        title,
        status: 'queued',
        message: t('projectLibrary.taskQueued'),
        created_at: Date.now(),
      },
    ])

    const targetQueue = queueType === 'media' ? mediaQueueRef.current : queueRef.current
    void targetQueue.add(async () => {
      updateTask(id, { status: 'running', message: t('projectLibrary.taskRunning') })
      try {
        await runner()
        updateTask(id, { status: 'success', message: t('projectLibrary.taskSuccess') })
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('projectLibrary.taskFailed')
        updateTask(id, { status: 'error', message: msg })
      }
    })
  }

  useEffect(() => {
    window.aiAPI
      .getConfig()
      .then((cfg) => {
        const config = cfg as AIConfig
        const textOptions = getSelectableModelsByType(config, 'text').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )
        const imageOptions = getSelectableModelsByType(config, 'image').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )
        const videoOptions = getSelectableModelsByType(config, 'video').flatMap(({ provider, models }) =>
          models.map((model) => ({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })),
        )

        setTextModelOptions(textOptions)
        if (config.models?.text && textOptions.some((item) => item.key === config.models.text)) {
          setSelectedTextModelKey(config.models.text)
        } else {
          setSelectedTextModelKey(textOptions[0]?.key ?? '')
        }

        setImageModelOptions(imageOptions)
        if (config.models?.image && imageOptions.some((item) => item.key === config.models.image)) {
          setSelectedImageModelKey(config.models.image)
        } else {
          setSelectedImageModelKey(imageOptions[0]?.key ?? '')
        }

        setVideoModelOptions(videoOptions)
        if (config.models?.video && videoOptions.some((item) => item.key === config.models.video)) {
          setSelectedVideoModelKey(config.models.video)
        } else {
          setSelectedVideoModelKey(videoOptions[0]?.key ?? '')
        }

        const imageConcurrency = Math.max(1, Math.min(20, config.concurrency?.image ?? 5))
        mediaQueueRef.current.concurrency = imageConcurrency
      })
      .catch(() => {
        setTextModelOptions([])
        setSelectedTextModelKey('')
        setImageModelOptions([])
        setSelectedImageModelKey('')
        setVideoModelOptions([])
        setSelectedVideoModelKey('')
        mediaQueueRef.current.concurrency = 5
      })
  }, [])

  const characterStudio = useCharacterStudioLogic({
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    selectedTextModelKey,
    selectedImageModelKey,
    promptOverrides,
    enqueueTask,
  })

  const propStudio = usePropStudioLogic({
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    projectRatio,
    selectedTextModelKey,
    selectedImageModelKey,
    promptOverrides,
    enqueueTask,
  })

  const sceneStudio = useSceneStudioLogic({
    t,
    projectId,
    seriesId,
    scriptContent,
    projectCategory,
    projectGenre,
    projectRatio,
    selectedTextModelKey,
    selectedImageModelKey,
    promptOverrides,
    enqueueTask,
  })

  const {
    characterError,
    relationError,
    optimizingRelations,
    projectCharacters,
    projectCharacterRelations,
    queueOptimizeRelationsFromCurrentScript,
    characterPanelProps,
  } = characterStudio

  const {
    propError,
    projectProps,
    propPanelProps,
  } = propStudio

  const {
    sceneError,
    shotsRefreshTick,
    currentSeriesScenes,
    scenePanelProps,
  } = sceneStudio

  const shotStudio = useShotProductionStudioLogic({
    t,
    seriesId,
    scriptContent,
    projectRatio,
    projectCategory,
    projectGenre,
    projectName,
    seriesTitle,
    selectedTextModelKey,
    selectedImageModelKey,
    selectedVideoModelKey,
    videoModelOptions,
    onVideoModelChange: setSelectedVideoModelKey,
    currentSeriesScenes,
    projectCharacters,
    projectCharacterRelations,
    projectProps,
    promptOverrides,
    enqueueTask,
  })

  const {
    shotError,
    seriesShots,
    productionAutoEditVideo,
    productionTimelineClips,
    refreshShotsBySeries,
    shotPanelProps,
    videoPanelProps,
    productionWorkspacePanelProps,
  } = shotStudio

  useEffect(() => {
    if (shotsRefreshTick <= 0) return
    void refreshShotsBySeries()
  }, [refreshShotsBySeries, shotsRefreshTick])

  const workflowSteps = useMemo<Array<{ key: WorkflowStepKey; label: string }>>(
    () => [
      { key: 'script', label: t('projectLibrary.stepScript') },
      { key: 'character', label: t('projectLibrary.stepCharacter') },
      { key: 'prop', label: t('projectLibrary.stepProp') },
      { key: 'storyboard', label: t('projectLibrary.stepStoryboard') },
      { key: 'shot', label: t('projectLibrary.stepShot') },
      { key: 'production', label: t('projectLibrary.stepProduction') },
      // { key: 'export', label: t('projectLibrary.stepExport') },
    ],
    [t],
  )
  const workflowStepOrder = useMemo<WorkflowStepKey[]>(
    () => ['script', 'character', 'prop', 'storyboard', 'shot', 'production', 'export'],
    [],
  )

  const showCharacterPanel = activeStep === 'character'
  const showPropPanel = activeStep === 'prop'
  const showScenePanel = activeStep === 'storyboard'
  const showShotPanel = activeStep === 'shot'
  const showVideoPanel = activeStep === 'production'
  const showProductionWorkspacePanel = activeStep === 'export'

  const workflowStepCompleted = useMemo<Record<WorkflowStepKey, boolean>>(
    () => ({
      script: scriptContent.trim().length > 0,
      character: projectCharacters.length > 0,
      prop: projectProps.length > 0,
      storyboard: currentSeriesScenes.length > 0,
      shot: seriesShots.length > 0,
      production: productionTimelineClips.length > 0,
      export: Boolean(productionAutoEditVideo || productionTimelineClips.length > 0),
    }),
    [
      productionAutoEditVideo,
      productionTimelineClips.length,
      projectCharacters.length,
      projectProps.length,
      currentSeriesScenes.length,
      scriptContent,
      seriesShots.length,
    ],
  )
  const workflowStepLabelMap = useMemo(
    () => new Map(workflowSteps.map((step) => [step.key, step.label])),
    [workflowSteps],
  )

  function canAccessStep(stepKey: WorkflowStepKey): boolean {
    if (workflowStepCompleted[stepKey]) return true
    const targetIdx = workflowStepOrder.indexOf(stepKey)
    if (targetIdx <= 0) return true
    for (let i = 0; i < targetIdx; i += 1) {
      if (!workflowStepCompleted[workflowStepOrder[i]]) return false
    }
    return true
  }

  function getStepBlockedReason(stepKey: WorkflowStepKey): string {
    const targetIdx = workflowStepOrder.indexOf(stepKey)
    if (targetIdx <= 0) return ''
    for (let i = 0; i < targetIdx; i += 1) {
      const prevStepKey = workflowStepOrder[i]
      if (workflowStepCompleted[prevStepKey]) continue
      return t('projectLibrary.stepLockedHint', {
        step: workflowStepLabelMap.get(prevStepKey) ?? '',
      })
    }
    return ''
  }

  useEffect(() => {
    const activeStepIdx = workflowStepOrder.indexOf(activeStep)
    if (activeStepIdx <= 0) return
    if (workflowStepCompleted[activeStep]) return
    const blocked = workflowStepOrder
      .slice(0, activeStepIdx)
      .some((stepKey) => !workflowStepCompleted[stepKey])
    if (!blocked) return
    const firstIncompleteIdx = workflowStepOrder.findIndex((stepKey) => !workflowStepCompleted[stepKey])
    if (firstIncompleteIdx < 0) return
    const fallbackStep = workflowStepOrder[firstIncompleteIdx]
    if (fallbackStep !== activeStep) {
      setActiveStep(fallbackStep)
    }
  }, [activeStep, workflowStepCompleted, workflowStepOrder])

  function clearTaskQueue() {
    const shouldClear = window.confirm(t('projectLibrary.taskQueueClearConfirm'))
    if (!shouldClear) return
    queueRef.current.clear()
    mediaQueueRef.current.clear()
    setTaskQueue((prev) => prev.filter((task) => task.status === 'running'))
  }

  function toggleQueueOpen() {
    setQueueOpen((prev) => !prev)
  }

  const scriptEditorPanelProps = useMemo(
    () => ({
      content: scriptContent,
      selectedTextModelKey,
      generatingRelationsFromScript: optimizingRelations,
      onGenerateRelationsFromScript: queueOptimizeRelationsFromCurrentScript,
      onContentChange: (nextContent: string) => {
        if (!seriesId) return
        seriesCollection.update(seriesId, (draft) => {
          draft.script = nextContent
        })
      },
    }),
    [
      optimizingRelations,
      queueOptimizeRelationsFromCurrentScript,
      scriptContent,
      selectedTextModelKey,
      seriesId,
    ],
  )
  const sortedTaskQueue = useMemo(
    () => taskQueue.slice().sort((a, b) => a.created_at - b.created_at),
    [taskQueue],
  )

  return {
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
    propError,
    sceneError,
    shotError,
    showCharacterPanel,
    showPropPanel,
    showScenePanel,
    showShotPanel,
    showVideoPanel,
    showProductionWorkspacePanel,
    characterPanelProps,
    propPanelProps,
    scenePanelProps,
    shotPanelProps,
    videoPanelProps,
    productionWorkspacePanelProps,
    scriptEditorPanelProps,
    queueOpen,
    taskQueue,
    sortedTaskQueue,
    toggleQueueOpen,
    clearTaskQueue,
  }
}
