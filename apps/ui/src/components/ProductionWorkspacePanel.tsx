import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Send, Scissors, Sparkles, Trash2, RotateCcw, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactPlayer from 'react-player'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type TimelineClip = {
  shotId: string
  shotIndex: number
  title: string
  path: string
  durationSec: number
}

export type EditableClip = {
  id: string
  shotId: string
  shotIndex: number
  title: string
  path: string
  originalDurationSec: number
  trimStartSec: number
  trimEndSec: number
}

export type EditedClipPayload = {
  shotId: string
  path: string
  trimStartSec: number
  trimEndSec: number
}

interface ProductionWorkspacePanelProps {
  clips: TimelineClip[]
  autoEditBusy: boolean
  masterVideoPath: string | null
  onAutoEdit: (prompt: string, editedClips: EditedClipPayload[]) => void
}

function toPlayableSrc(value: string): string {
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

function clipsFromProps(clips: TimelineClip[]): EditableClip[] {
  return clips.map((clip) => ({
    id: crypto.randomUUID(),
    shotId: clip.shotId,
    shotIndex: clip.shotIndex,
    title: clip.title,
    path: clip.path,
    originalDurationSec: Math.max(1, clip.durationSec || 0),
    trimStartSec: 0,
    trimEndSec: Math.max(1, clip.durationSec || 0),
  }))
}

function effectiveDuration(clip: EditableClip): number {
  return Math.max(0.1, clip.trimEndSec - clip.trimStartSec)
}

const MIN_SEGMENT_SEC = 0.1
const DRAG_THRESHOLD_PX = 5

export function ProductionWorkspacePanel({
  clips,
  autoEditBusy,
  masterVideoPath,
  onAutoEdit,
}: ProductionWorkspacePanelProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedClipId, setSelectedClipId] = useState('')
  const [playheadSec, setPlayheadSec] = useState(0)
  const [pixelsPerSec, setPixelsPerSec] = useState(64)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [editableClips, setEditableClips] = useState<EditableClip[]>(() => clipsFromProps(clips))

  // --- Continuous playback state ---
  const [isPlaying, setIsPlayingRaw] = useState(false)
  const playingRef = useRef(false)
  const pendingPlayClipRef = useRef<string | null>(null)
  const switchingClipRef = useRef(false)

  // Keep ref in sync synchronously to avoid race conditions between
  // the browser's pause and ended events.
  function setIsPlaying(value: boolean) {
    playingRef.current = value
    setIsPlayingRaw(value)
  }

  // Sync from parent props when clips identity changes
  const prevClipsRef = useRef(clips)
  useEffect(() => {
    if (prevClipsRef.current !== clips) {
      prevClipsRef.current = clips
      setEditableClips(clipsFromProps(clips))
      setSelectedClipId('')
      setIsPlaying(false)
    }
  }, [clips])

  const activeClip = useMemo(
    () => editableClips.find((clip) => clip.id === selectedClipId) ?? editableClips[0] ?? null,
    [editableClips, selectedClipId],
  )
  const masterVideoSrc = masterVideoPath
    ? toPlayableSrc(masterVideoPath)
    : activeClip
      ? toPlayableSrc(activeClip.path)
      : null

  const totalDurationSec = useMemo(
    () => Math.max(1, editableClips.reduce((sum, clip) => sum + effectiveDuration(clip), 0)),
    [editableClips],
  )
  const timelineWidth = useMemo(() => totalDurationSec * pixelsPerSec, [totalDurationSec, pixelsPerSec])
  const rulerMarks = useMemo(() => {
    const marks: number[] = []
    for (let second = 0; second <= totalDurationSec; second += 1) marks.push(second)
    return marks
  }, [totalDurationSec])

  const clipLayout = useMemo(() => {
    let offset = 0
    return editableClips.map((clip) => {
      const start = offset
      const duration = effectiveDuration(clip)
      offset += duration
      return { ...clip, start, duration }
    })
  }, [editableClips])

  const clipStartById = useMemo(
    () => new Map(clipLayout.map((clip) => [clip.id, clip.start])),
    [clipLayout],
  )

  // Clamp playhead when total duration changes
  useEffect(() => {
    setPlayheadSec((prev) => Math.min(prev, totalDurationSec))
  }, [totalDurationSec])

  // --- Trim state ---
  const [trimState, setTrimState] = useState<{
    clipId: string
    edge: 'left' | 'right'
    startX: number
    initialTrimStartSec: number
    initialTrimEndSec: number
  } | null>(null)

  useEffect(() => {
    if (!trimState) return

    function onMouseMove(e: MouseEvent) {
      if (!trimState) return
      const deltaX = e.clientX - trimState.startX
      const deltaSec = deltaX / pixelsPerSec

      setEditableClips((prev) =>
        prev.map((clip) => {
          if (clip.id !== trimState.clipId) return clip

          if (trimState.edge === 'left') {
            const newTrimStart = Math.max(0, Math.min(trimState.initialTrimStartSec + deltaSec, trimState.initialTrimEndSec - MIN_SEGMENT_SEC))
            return { ...clip, trimStartSec: newTrimStart }
          } else {
            const newTrimEnd = Math.min(clip.originalDurationSec, Math.max(trimState.initialTrimStartSec + MIN_SEGMENT_SEC, trimState.initialTrimEndSec + deltaSec))
            return { ...clip, trimEndSec: newTrimEnd }
          }
        }),
      )
    }

    function onMouseUp() {
      setTrimState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [trimState, pixelsPerSec])

  // --- Drag reorder state ---
  const [dragState, setDragState] = useState<{
    clipId: string
    startX: number
    currentX: number
    activated: boolean
  } | null>(null)

  useEffect(() => {
    if (!dragState) return

    function onMouseMove(e: MouseEvent) {
      if (!dragState) return
      const dx = e.clientX - dragState.startX
      if (!dragState.activated && Math.abs(dx) < DRAG_THRESHOLD_PX) return
      setDragState((prev) => prev ? { ...prev, currentX: e.clientX, activated: true } : null)
    }

    function onMouseUp(e: MouseEvent) {
      if (!dragState) return

      if (dragState.activated) {
        const deltaX = e.clientX - dragState.startX
        const deltaSec = deltaX / pixelsPerSec

        setEditableClips((prev) => {
          const dragIndex = prev.findIndex((c) => c.id === dragState.clipId)
          if (dragIndex < 0) return prev

          const layout = (() => {
            let offset = 0
            return prev.map((c) => {
              const s = offset
              const d = effectiveDuration(c)
              offset += d
              return { id: c.id, start: s, duration: d, mid: s + d / 2 }
            })
          })()

          const draggedLayout = layout[dragIndex]
          const newMid = draggedLayout.mid + deltaSec

          let targetIndex = prev.length - 1
          for (let i = 0; i < layout.length; i++) {
            if (i === dragIndex) continue
            if (newMid < layout[i].mid) {
              targetIndex = i > dragIndex ? i - 1 : i
              break
            }
          }

          if (targetIndex === dragIndex) return prev

          const next = [...prev]
          const [removed] = next.splice(dragIndex, 1)
          next.splice(targetIndex, 0, removed)
          return next
        })
      }

      setDragState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState, pixelsPerSec])

  // --- Advance to next clip (shared by timeupdate and ended handlers) ---
  function advanceToNextClip() {
    if (!activeClip) return
    const currentIndex = editableClips.findIndex((c) => c.id === activeClip.id)
    const nextClip = editableClips[currentIndex + 1]
    const video = videoRef.current

    if (!nextClip || !video) {
      // End of timeline
      video?.pause()
      setIsPlaying(false)
      setPlayheadSec(totalDurationSec)
      return
    }

    // Check if next clip uses the same source file (happens after split)
    const nextSrc = toPlayableSrc(nextClip.path)
    const currentSrc = activeClip ? toPlayableSrc(activeClip.path) : ''

    switchingClipRef.current = true
    video.pause()
    setSelectedClipId(nextClip.id)

    if (nextSrc === currentSrc) {
      // Same source file, just seek directly
      video.currentTime = nextClip.trimStartSec
      void video.play().then(() => {
        switchingClipRef.current = false
      }).catch(() => {
        switchingClipRef.current = false
      })
    } else {
      // Different source; wait for loadedmetadata via pendingPlayClipRef
      pendingPlayClipRef.current = nextClip.id
    }
  }

  // --- Actions ---
  const handleDeleteClip = useCallback(() => {
    if (!selectedClipId) return
    setEditableClips((prev) => prev.filter((c) => c.id !== selectedClipId))
    setSelectedClipId('')
  }, [selectedClipId])

  const handleSplitAtPlayhead = useCallback(() => {
    const targetClip = clipLayout.find(
      (clip) => playheadSec >= clip.start && playheadSec < clip.start + clip.duration,
    )
    if (!targetClip) return

    const splitLocalSec = playheadSec - targetClip.start
    const splitOriginalSec = targetClip.trimStartSec + splitLocalSec

    if (splitLocalSec < MIN_SEGMENT_SEC || targetClip.duration - splitLocalSec < MIN_SEGMENT_SEC) return

    const clipA: EditableClip = {
      ...targetClip,
      id: crypto.randomUUID(),
      trimEndSec: splitOriginalSec,
    }
    const clipB: EditableClip = {
      ...targetClip,
      id: crypto.randomUUID(),
      trimStartSec: splitOriginalSec,
    }

    setEditableClips((prev) => {
      const index = prev.findIndex((c) => c.id === targetClip.id)
      if (index < 0) return prev
      const next = [...prev]
      next.splice(index, 1, clipA, clipB)
      return next
    })
  }, [clipLayout, playheadSec])

  const handleResetEdits = useCallback(() => {
    setEditableClips(clipsFromProps(clips))
    setSelectedClipId('')
    setIsPlaying(false)
  }, [clips])

  // --- Continuous playback: Play / Pause ---
  function handlePlayPause() {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
      return
    }

    // Master video: just play the single file
    if (masterVideoPath) {
      void video.play()
      setIsPlaying(true)
      return
    }

    if (editableClips.length === 0) return

    // If playhead is at or past the end, restart from the beginning
    if (playheadSec >= totalDurationSec - 0.05) {
      const firstClip = editableClips[0]
      setPlayheadSec(0)
      setSelectedClipId(firstClip.id)
      switchingClipRef.current = true
      pendingPlayClipRef.current = firstClip.id
      setIsPlaying(true)
      // If already on the same source, loadedmetadata may not fire
      if (activeClip && toPlayableSrc(firstClip.path) === toPlayableSrc(activeClip.path)) {
        video.currentTime = firstClip.trimStartSec
        void video.play().then(() => {
          switchingClipRef.current = false
          pendingPlayClipRef.current = null
        }).catch(() => {
          switchingClipRef.current = false
          pendingPlayClipRef.current = null
        })
      }
      return
    }

    // Play from current position within current clip
    setIsPlaying(true)
    void video.play()
  }

  // --- Video event handlers ---
  function handleVideoTimeUpdate() {
    const video = videoRef.current
    if (!video) return

    if (masterVideoPath) {
      setPlayheadSec(video.currentTime)
      return
    }

    if (!activeClip) return
    const start = clipStartById.get(activeClip.id) ?? 0
    const localTime = video.currentTime - activeClip.trimStartSec
    setPlayheadSec(start + Math.max(0, localTime))

    // During continuous playback, check if we've reached the clip's trim end
    if (playingRef.current && video.currentTime >= activeClip.trimEndSec - 0.05) {
      advanceToNextClip()
    }
  }

  function handleVideoLoadedMetadata() {
    const video = videoRef.current
    if (!video) return

    // If we have a pending clip to play (from clip switching), start it
    if (pendingPlayClipRef.current && activeClip && pendingPlayClipRef.current === activeClip.id) {
      pendingPlayClipRef.current = null
      video.currentTime = activeClip.trimStartSec
      if (playingRef.current) {
        void video.play().then(() => {
          switchingClipRef.current = false
        }).catch(() => {
          switchingClipRef.current = false
        })
      } else {
        switchingClipRef.current = false
      }
      return
    }

    // Normal metadata load: update playhead
    if (!masterVideoPath && activeClip) {
      const start = clipStartById.get(activeClip.id) ?? 0
      const localTime = video.currentTime - activeClip.trimStartSec
      setPlayheadSec(start + Math.max(0, localTime))
    }
  }

  function handleVideoEnded() {
    if (!playingRef.current) return

    if (masterVideoPath) {
      setIsPlaying(false)
      return
    }

    // Video file ended naturally; advance if more clips remain
    advanceToNextClip()
  }

  function handleNativePause() {
    // If we're in the middle of switching clips, ignore the pause event
    if (switchingClipRef.current) return
    // When a video ends naturally the browser fires pause BEFORE ended.
    // Don't kill playback here; let handleVideoEnded advance to the next clip.
    if (videoRef.current?.ended) return
    setIsPlaying(false)
  }

  function handleNativePlay() {
    setIsPlaying(true)
  }

  function handleSend() {
    const content = draft.trim()
    if (!content) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: t('projectLibrary.productionAgentPendingReply'),
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setDraft('')

    const payload: EditedClipPayload[] = editableClips.map((clip) => ({
      shotId: clip.shotId,
      path: clip.path,
      trimStartSec: clip.trimStartSec,
      trimEndSec: clip.trimEndSec,
    }))
    onAutoEdit(content, payload)
  }

  function seekFromTimeline(nextSec: number) {
    const boundedSec = Math.max(0, Math.min(totalDurationSec, nextSec))
    setPlayheadSec(boundedSec)

    const video = videoRef.current
    if (!video) return

    if (masterVideoPath) {
      video.currentTime = boundedSec
      return
    }

    const targetClip = clipLayout.find((clip) => boundedSec >= clip.start && boundedSec < clip.start + clip.duration)
      ?? clipLayout[clipLayout.length - 1]
    if (!targetClip) return

    if (targetClip.id !== selectedClipId) {
      setSelectedClipId(targetClip.id)
      // If source changes we need to wait for load, otherwise seek directly
      const currentSrc = activeClip ? toPlayableSrc(activeClip.path) : ''
      const targetSrc = toPlayableSrc(targetClip.path)
      if (targetSrc !== currentSrc) {
        pendingPlayClipRef.current = null // not auto-playing, just seeking
        return
      }
    }
    const localTime = Math.max(0, boundedSec - targetClip.start)
    video.currentTime = Math.min(targetClip.trimStartSec + localTime, Math.max(0, video.duration || (targetClip.trimStartSec + localTime)))
  }

  // --- Stable refs for event handlers that outlive a single render ---
  const handlePlayPauseRef = useRef(handlePlayPause)
  handlePlayPauseRef.current = handlePlayPause
  const handleDeleteClipRef = useRef(handleDeleteClip)
  handleDeleteClipRef.current = handleDeleteClip
  const handleSplitRef = useRef(handleSplitAtPlayhead)
  handleSplitRef.current = handleSplitAtPlayhead
  const seekRef = useRef(seekFromTimeline)
  seekRef.current = seekFromTimeline
  const playheadSecRef = useRef(playheadSec)
  playheadSecRef.current = playheadSec
  const pixelsPerSecRef = useRef(pixelsPerSec)
  pixelsPerSecRef.current = pixelsPerSec

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPauseRef.current()
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          handleDeleteClipRef.current()
          break
        case 'KeyS':
          e.preventDefault()
          handleSplitRef.current()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekRef.current(playheadSecRef.current - 0.5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seekRef.current(playheadSecRef.current + 0.5)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // --- Ruler click / drag scrub ---
  function handleRulerMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    seekRef.current((e.clientX - rect.left) / pixelsPerSecRef.current)

    function onMouseMove(me: MouseEvent) {
      seekRef.current((me.clientX - rect.left) / pixelsPerSecRef.current)
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // --- Format time as MM:SS.t ---
  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
  }

  // --- Clip playback progress (0-1) for active clip ---
  const activeClipProgress = useMemo(() => {
    if (!activeClip) return 0
    const start = clipStartById.get(activeClip.id) ?? 0
    const dur = effectiveDuration(activeClip)
    if (dur <= 0) return 0
    return Math.max(0, Math.min(1, (playheadSec - start) / dur))
  }, [activeClip, clipStartById, playheadSec])

  const hasMessages = useMemo(() => messages.length > 0, [messages])

  return (
    <section className="h-full min-h-0 overflow-hidden rounded-2xl border border-base-300 bg-base-100 p-4 md:p-5">
      <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[0.95fr_1.35fr] gap-3">
        <article className="rounded-xl border border-base-300 bg-base-100 min-h-0 flex flex-col overflow-hidden">
          <header className="border-b border-base-300 px-3 py-2.5 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} />
              {t('projectLibrary.productionAgentTitle')}
            </div>
            <span className="text-[11px] text-base-content/60">{t('projectLibrary.productionAgentHint')}</span>
          </header>

          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2 bg-base-200/35">
            {hasMessages ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary/12 border border-primary/20'
                      : 'bg-base-100 border border-base-300'
                  }`}
                >
                  <div className="text-[11px] text-base-content/55 mb-1">
                    {msg.role === 'user' ? t('projectLibrary.productionAgentYou') : t('projectLibrary.productionAgent')}
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))
            ) : (
              <div className="h-full min-h-24 rounded-lg border border-dashed border-base-300 flex items-center justify-center px-4 text-xs text-base-content/55 text-center">
                {t('projectLibrary.productionAgentEmpty')}
              </div>
            )}
          </div>

          <footer className="border-t border-base-300 p-3 space-y-2">
            <textarea
              className="textarea textarea-bordered w-full min-h-24"
              value={draft}
              placeholder={t('projectLibrary.productionAgentInputPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end">
              <button type="button" className="btn btn-sm btn-primary" onClick={handleSend} disabled={autoEditBusy}>
                <Send size={14} />
                {autoEditBusy ? t('projectLibrary.aiStreaming') : t('projectLibrary.productionAgentSend')}
              </button>
            </div>
          </footer>
        </article>

        <article className="rounded-xl border border-base-300 bg-base-100 min-h-0 flex flex-col overflow-hidden">
          <header className="border-b border-base-300 px-3 py-2.5 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <Scissors size={14} />
              {t('projectLibrary.productionTimelineTitle')}
            </div>
            <span className="text-[11px] text-base-content/60">{t('projectLibrary.productionTimelineHint')}</span>
          </header>

          <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col gap-3">
            <section className="shrink-0 rounded-lg border border-base-300 overflow-hidden bg-base-200/40">
              <div className="px-3 py-2 text-xs font-medium border-b border-base-300">
                {t('projectLibrary.productionMasterVideoTitle')}
              </div>
              <div className="p-2">
                <div className="aspect-video w-full rounded-md overflow-hidden bg-black flex items-center justify-center">
                  {masterVideoSrc ? (
                    <ReactPlayer
                      ref={videoRef}
                      src={masterVideoSrc}
                      width="100%"
                      height="100%"
                      className="h-full w-full object-contain"
                      preload="metadata"
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onSeeked={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                      onPause={handleNativePause}
                      onPlay={handleNativePlay}
                    />
                  ) : (
                    <div className="text-xs text-base-content/60 px-4 text-center">
                      {t('projectLibrary.productionMasterVideoPlaceholder')}
                    </div>
                  )}
                </div>
                {/* Custom transport bar */}
                {masterVideoSrc && (
                  <div className="flex items-center gap-2 mt-1.5 px-0.5">
                    <button type="button" className="btn btn-ghost btn-xs btn-circle" onClick={() => seekFromTimeline(0)} title="Start">
                      <SkipBack size={13} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs btn-circle" onClick={handlePlayPause}>
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs btn-circle" onClick={() => seekFromTimeline(totalDurationSec)} title="End">
                      <SkipForward size={13} />
                    </button>
                    <span className="text-[11px] tabular-nums text-base-content/70 ml-1">
                      {formatTime(playheadSec)} / {formatTime(totalDurationSec)}
                    </span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-base-content/50">
                      Space · ← → · S · Del
                    </span>
                  </div>
                )}
              </div>
            </section>

            <section className="flex-1 min-h-0 rounded-lg border border-dashed border-base-300 bg-base-200/35 p-3 overflow-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Sparkles size={14} className="text-primary" />
                  {t('projectLibrary.productionTimelineTrackTitle')}
                </div>
                <div className="inline-flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    className={`btn btn-xs ${isPlaying ? 'btn-warning' : 'btn-success'}`}
                    onClick={handlePlayPause}
                    disabled={editableClips.length === 0 && !masterVideoPath}
                    title={isPlaying ? t('projectLibrary.timelinePause') : t('projectLibrary.timelinePlay')}
                  >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                    {isPlaying ? t('projectLibrary.timelinePause') : t('projectLibrary.timelinePlay')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleSplitAtPlayhead}
                    disabled={editableClips.length === 0}
                    title={t('projectLibrary.timelineSplitShortcut')}
                  >
                    <Scissors size={12} />
                    {t('projectLibrary.timelineSplit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleDeleteClip}
                    disabled={!selectedClipId}
                    title={t('projectLibrary.timelineDeleteShortcut')}
                  >
                    <Trash2 size={12} />
                    {t('projectLibrary.timelineDelete')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleResetEdits}
                    disabled={editableClips.length === 0}
                    title={t('projectLibrary.timelineResetEdits')}
                  >
                    <RotateCcw size={12} />
                    {t('projectLibrary.timelineResetEdits')}
                  </button>
                  <span className="text-base-content/60">{t('projectLibrary.productionTimelineZoom')}</span>
                  <input
                    type="range"
                    min={36}
                    max={120}
                    step={4}
                    value={pixelsPerSec}
                    className="range range-xs w-24"
                    onChange={(event) => setPixelsPerSec(Number(event.target.value) || 64)}
                  />
                </div>
              </div>
              <p className="text-xs text-base-content/65 leading-relaxed mt-2">{t('projectLibrary.productionTimelinePlaceholderBody')}</p>
              <div className="mt-3 rounded-md border border-base-300 bg-base-100 p-2 overflow-auto">
                {editableClips.length === 0 ? (
                  <div className="h-20 rounded-md border border-base-300 bg-base-200/60 flex items-center justify-center text-xs text-base-content/60">
                    {t('projectLibrary.productionTimelineEmpty')}
                  </div>
                ) : (
                  <div className="relative" style={{ width: `${timelineWidth + 120}px` }}>
                    <div className="sticky top-0 z-10 bg-base-100/95 backdrop-blur border-b border-base-300 mb-2">
                      <div className="flex items-stretch" style={{ width: `${timelineWidth + 120}px` }}>
                        <div className="w-20 shrink-0 px-2 py-1 text-[10px] text-base-content/60 border-r border-base-300">TC</div>
                        <div
                          className="relative h-7 cursor-pointer select-none"
                          style={{ width: `${timelineWidth}px` }}
                          onMouseDown={handleRulerMouseDown}
                        >
                          {rulerMarks.map((second) => (
                            <div
                              key={second}
                              className="absolute top-0 h-full border-l border-base-300/60 pointer-events-none"
                              style={{ left: `${second * pixelsPerSec}px` }}
                            >
                              <span className="absolute top-0 left-1 text-[10px] text-base-content/60">{second}s</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-stretch" style={{ width: `${timelineWidth + 120}px` }}>
                        <div className="w-20 shrink-0 px-2 py-2 text-xs font-semibold border border-base-300 bg-base-200">V1</div>
                        <div className="relative h-14 border border-base-300 border-l-0 bg-base-200/40" style={{ width: `${timelineWidth}px` }}>
                          {clipLayout.map((clip) => {
                            const isSelected = activeClip?.id === clip.id
                            const isDragging = dragState?.clipId === clip.id && dragState.activated
                            const dragOffset = isDragging ? dragState.currentX - dragState.startX : 0

                            return (
                              <div
                                key={`v-${clip.id}`}
                                className={`absolute top-1 h-12 rounded-md border select-none ${isSelected ? 'border-primary bg-primary/15' : 'border-info/30 bg-info/15 hover:bg-info/20'} ${isDragging ? 'opacity-60 z-20' : ''}`}
                                style={{
                                  left: `${clip.start * pixelsPerSec}px`,
                                  width: `${Math.max(72, clip.duration * pixelsPerSec - 2)}px`,
                                  transform: isDragging ? `translateX(${dragOffset}px)` : undefined,
                                }}
                              >
                                {/* Left trim handle */}
                                <div
                                  className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 rounded-l-md z-10"
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    setTrimState({
                                      clipId: clip.id,
                                      edge: 'left',
                                      startX: e.clientX,
                                      initialTrimStartSec: clip.trimStartSec,
                                      initialTrimEndSec: clip.trimEndSec,
                                    })
                                  }}
                                />
                                {/* Playback progress overlay */}
                                {isSelected && isPlaying && (
                                  <div
                                    className="absolute bottom-0 left-0 h-0.5 bg-primary/70 transition-none pointer-events-none z-[5]"
                                    style={{ width: `${activeClipProgress * 100}%` }}
                                  />
                                )}
                                {/* Clip content area -- click to select, drag to reorder */}
                                <div
                                  className="absolute left-1.5 right-1.5 top-0 h-full px-1.5 py-1 cursor-grab active:cursor-grabbing"
                                  onMouseDown={(e) => {
                                    if (trimState) return
                                    e.stopPropagation()
                                    setSelectedClipId(clip.id)
                                    setDragState({
                                      clipId: clip.id,
                                      startX: e.clientX,
                                      currentX: e.clientX,
                                      activated: false,
                                    })
                                  }}
                                  onClick={() => {
                                    if (!dragState?.activated) {
                                      setSelectedClipId(clip.id)
                                      seekFromTimeline(clip.start)
                                    }
                                  }}
                                >
                                  <div className="text-[10px] text-base-content/65">#{clip.shotIndex} · {clip.duration.toFixed(1)}s</div>
                                  <div className="text-xs font-medium line-clamp-1">{clip.title || t('projectLibrary.shotCardUntitled')}</div>
                                </div>
                                {/* Right trim handle */}
                                <div
                                  className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 rounded-r-md z-10"
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    setTrimState({
                                      clipId: clip.id,
                                      edge: 'right',
                                      startX: e.clientX,
                                      initialTrimStartSec: clip.trimStartSec,
                                      initialTrimEndSec: clip.trimEndSec,
                                    })
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="flex items-stretch" style={{ width: `${timelineWidth + 120}px` }}>
                        <div className="w-20 shrink-0 px-2 py-2 text-xs font-semibold border border-base-300 bg-base-200">A1</div>
                        <div className="relative h-12 border border-base-300 border-l-0 bg-base-200/30">
                          {clipLayout.map((clip) => (
                            <div
                              key={`a-${clip.id}`}
                              className="absolute top-1.5 h-9 rounded-md border border-success/25 bg-success/15"
                              style={{
                                left: `${clip.start * pixelsPerSec}px`,
                                width: `${Math.max(72, clip.duration * pixelsPerSec - 2)}px`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div
                      className="absolute top-8 bottom-0 w-px bg-error"
                      style={{ left: `${80 + Math.min(playheadSec, totalDurationSec) * pixelsPerSec}px` }}
                    >
                      <div className="-ml-2 -mt-1 w-4 h-2 rounded-b bg-error" />
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className="text-base-content/60">{t('projectLibrary.productionTimelinePlayhead')}</span>
                      <input
                        type="range"
                        min={0}
                        max={totalDurationSec}
                        step={0.1}
                        value={playheadSec}
                        className="range range-xs flex-1"
                        onChange={(event) => seekFromTimeline(Number(event.target.value) || 0)}
                      />
                      <span className="w-14 text-right tabular-nums">{playheadSec.toFixed(1)}s</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </article>
      </div>
    </section>
  )
}
