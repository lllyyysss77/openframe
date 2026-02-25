import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Film, Sparkles } from 'lucide-react'
import type { ShotCard } from './ShotPanel'

type SceneOption = { id: string; title: string }
type CharacterOption = { id: string; name: string }
type FramePair = { first: string | null; last: string | null; video: string | null }
type VideoFrameMode = 'single' | 'first_last'

interface ProductionPanelProps {
  shots: ShotCard[]
  scenes: SceneOption[]
  characters: CharacterOption[]
  projectRatio: '16:9' | '9:16'
  videoModelOptions: Array<{ key: string; label: string }>
  selectedVideoModelKey: string
  onVideoModelChange: (value: string) => void
  framesByShot: Record<string, FramePair>
  frameBusyKey: string | null
  videoBusyShotId: string | null
  onGenerateFrame: (shotId: string, kind: 'first' | 'last') => void
  onGenerateVideo: (shotId: string, params: { durationSec: number; ratio: string; mode: VideoFrameMode }) => void
}

function getThumbSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function ProductionPanel({
  shots,
  scenes,
  characters,
  projectRatio,
  videoModelOptions,
  selectedVideoModelKey,
  onVideoModelChange,
  framesByShot,
  frameBusyKey,
  videoBusyShotId,
  onGenerateFrame,
  onGenerateVideo,
}: ProductionPanelProps) {
  const { t } = useTranslation()
  const [selectedShotId, setSelectedShotId] = useState<string>('')
  const [durationSec, setDurationSec] = useState(4)
  const [frameMode, setFrameMode] = useState<VideoFrameMode>('single')

  useEffect(() => {
    if (!shots.length) {
      setSelectedShotId('')
      return
    }
    if (!shots.some((item) => item.id === selectedShotId)) {
      setSelectedShotId(shots[0].id)
    }
  }, [shots, selectedShotId])

  const selectedShot = useMemo(() => shots.find((item) => item.id === selectedShotId) ?? null, [shots, selectedShotId])
  const sceneNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const scene of scenes) map.set(scene.id, scene.title)
    return map
  }, [scenes])
  const selectedScene = useMemo(() => scenes.find((item) => item.id === selectedShot?.scene_id) ?? null, [scenes, selectedShot])
  const selectedCharacters = useMemo(() => {
    if (!selectedShot) return []
    const map = new Map(characters.map((item) => [item.id, item.name]))
    return selectedShot.character_ids.map((id) => map.get(id)).filter(Boolean) as string[]
  }, [characters, selectedShot])

  const pair = selectedShot ? framesByShot[selectedShot.id] ?? { first: null, last: null, video: null } : { first: null, last: null, video: null }
  const videoViewportClass = projectRatio === '9:16'
    ? 'aspect-[9/16]'
    : 'aspect-video'

  return (
    <section className="h-full min-h-0 overflow-hidden rounded-2xl border border-base-300 bg-base-100 p-4 md:p-5 grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr_1.4fr_1fr] gap-3">
      <article className="rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col min-h-0">
        <h3 className="text-sm font-semibold">{t('projectLibrary.productionShotDetail')}</h3>
        <div className="mt-2 flex-1 min-h-0 overflow-auto space-y-2">
          {shots.length === 0 ? (
            <p className="text-xs text-base-content/60">{t('projectLibrary.shotEmpty')}</p>
          ) : (
            shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                className={`w-full text-left rounded-lg border px-2 py-2 text-xs ${selectedShotId === shot.id ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'}`}
                onClick={() => setSelectedShotId(shot.id)}
              >
                <div className="font-medium line-clamp-1">#{shot.shot_index} {shot.title}</div>
                <div className="text-base-content/60 line-clamp-1 mt-1">{sceneNameMap.get(shot.scene_id) || '-'}</div>
                <div className="text-base-content/60 line-clamp-2 mt-1">{shot.action || '-'}</div>
              </button>
            ))
          )}
        </div>

        {selectedShot ? (
          <div className="mt-3 pt-3 border-t border-base-300 space-y-1.5 text-xs text-base-content/75">
            <div>{t('projectLibrary.shotSceneLabel')}: {selectedScene?.title || '-'}</div>
            <div>{t('projectLibrary.shotSizeLabel')}: {selectedShot.shot_size || '-'}</div>
            <div>{t('projectLibrary.shotAngleLabel')}: {selectedShot.camera_angle || '-'}</div>
            <div>{t('projectLibrary.shotMoveLabel')}: {selectedShot.camera_move || '-'}</div>
            <div>{t('projectLibrary.productionCharacters')}: {selectedCharacters.join(', ') || '-'}</div>
          </div>
        ) : null}
      </article>

      <article className="rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col gap-3 min-h-0">
        <h3 className="text-sm font-semibold">{t('projectLibrary.productionFrames')}</h3>
        {frameMode === 'first_last' ? (
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              disabled={!selectedShot || frameBusyKey === `${selectedShot.id}:first`}
              onClick={() => selectedShot && onGenerateFrame(selectedShot.id, 'first')}
            >
              <Sparkles size={12} />
              {t('projectLibrary.productionGenerateFirstFrame')}
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              disabled={!selectedShot || frameBusyKey === `${selectedShot.id}:last`}
              onClick={() => selectedShot && onGenerateFrame(selectedShot.id, 'last')}
            >
              <Sparkles size={12} />
              {t('projectLibrary.productionGenerateLastFrame')}
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 overflow-auto pr-1 min-h-0">
          {frameMode === 'first_last' ? (
            <div className="rounded-lg border border-base-300 overflow-hidden">
              <div className="px-2 py-1 text-xs border-b border-base-300">{t('projectLibrary.productionFirstFrame')}</div>
              <div className="aspect-video bg-base-200 flex items-center justify-center">
                {getThumbSrc(pair.first) ? (
                  <img src={getThumbSrc(pair.first)!} className="w-full h-full object-cover" />
                ) : <Clapperboard size={20} className="text-base-content/60" />}
              </div>
              <button type="button" className="btn btn-xs btn-outline w-full rounded-none" disabled={!selectedShot || frameBusyKey === `${selectedShot.id}:first`} onClick={() => selectedShot && onGenerateFrame(selectedShot.id, 'first')}>
                <Sparkles size={12} />
                {t('projectLibrary.productionGenerateFirstFrame')}
              </button>
            </div>
          ) : null}

          <div className="rounded-lg border border-base-300 overflow-hidden">
            <div className="px-2 py-1 text-xs border-b border-base-300">{t('projectLibrary.productionMiddleFrame')}</div>
            <div className="aspect-video bg-base-200 flex items-center justify-center">
              {getThumbSrc(selectedShot?.thumbnail || null) ? (
                <img src={getThumbSrc(selectedShot?.thumbnail || null)!} className="w-full h-full object-cover" />
              ) : <Clapperboard size={20} className="text-base-content/60" />}
            </div>
            <div className="px-2 py-1 text-[11px] text-base-content/60 text-center border-t border-base-300">{t('projectLibrary.productionMiddleFrameHint')}</div>
          </div>

          {frameMode === 'first_last' ? (
            <div className="rounded-lg border border-base-300 overflow-hidden">
              <div className="px-2 py-1 text-xs border-b border-base-300">{t('projectLibrary.productionLastFrame')}</div>
              <div className="aspect-video bg-base-200 flex items-center justify-center">
                {getThumbSrc(pair.last) ? (
                  <img src={getThumbSrc(pair.last)!} className="w-full h-full object-cover" />
                ) : <Clapperboard size={20} className="text-base-content/60" />}
              </div>
              <button type="button" className="btn btn-xs btn-outline w-full rounded-none" disabled={!selectedShot || frameBusyKey === `${selectedShot.id}:last`} onClick={() => selectedShot && onGenerateFrame(selectedShot.id, 'last')}>
                <Sparkles size={12} />
                {t('projectLibrary.productionGenerateLastFrame')}
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <article className="rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col gap-3 min-h-0">
        <h3 className="text-sm font-semibold">{t('projectLibrary.productionVideoWindow')}</h3>
        <div className="flex min-h-0 rounded-lg border border-base-300 bg-base-200/70 flex items-center justify-center p-2 overflow-hidden">
          <div className={`h-auto max-h-full max-w-full w-full overflow-hidden rounded-md bg-black ${videoViewportClass}`}>
            {getThumbSrc(pair.video) ? (
              <video src={getThumbSrc(pair.video)!} controls className="h-full w-full object-contain" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-base-content/60 px-4 text-center bg-base-200">
                {t('projectLibrary.productionVideoPlaceholder')}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!selectedShot || videoBusyShotId === selectedShot.id}
          onClick={() => selectedShot && onGenerateVideo(selectedShot.id, { durationSec, ratio: projectRatio, mode: frameMode })}
        >
          <Film size={14} />
          {videoBusyShotId === selectedShot?.id ? t('projectLibrary.aiStreaming') : t('projectLibrary.productionGenerateVideo')}
        </button>
      </article>

      <article className="rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col gap-3 min-h-0 overflow-auto">
        <h3 className="text-sm font-semibold">{t('projectLibrary.productionParams')}</h3>
        <label className="form-control flex flex-col items-start gap-1">
          <span className="text-xs text-base-content/70">{t('settings.aiVideoModel')}</span>
            <select className="select select-bordered w-full" value={selectedVideoModelKey} onChange={(e) => onVideoModelChange(e.target.value)}>
              {videoModelOptions.length === 0 ? (
                <option value="">{t('projectLibrary.aiVideoModelEmpty')}</option>
              ) : (
                videoModelOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)
              )}
            </select>
        </label>

        <label className="form-control flex flex-col items-start gap-1">
          <span className="text-xs text-base-content/70">{t('projectLibrary.videoRatio')}</span>
          <input className="input input-bordered w-full" value={projectRatio} readOnly />
        </label>

        <label className="form-control flex flex-col items-start gap-1">
          <span className="text-xs text-base-content/70">{t('projectLibrary.productionFrameMode')}</span>
          <select className="select select-bordered w-full" value={frameMode} onChange={(e) => setFrameMode(e.target.value as VideoFrameMode)}>
            <option value="single">{t('projectLibrary.productionFrameModeSingle')}</option>
            <option value="first_last">{t('projectLibrary.productionFrameModeFirstLast')}</option>
          </select>
        </label>

        <label className="form-control flex flex-col items-start gap-1">
          <span className="text-xs text-base-content/70">{t('projectLibrary.productionDuration')}</span>
          <select className="select select-bordered w-full" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value) || 4)}>
            {[3, 4, 5, 6, 8].map((sec) => <option key={sec} value={sec}>{sec}s</option>)}
          </select>
        </label>
      </article>
    </section>
  )
}
