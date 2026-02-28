import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Bold,
  Check,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  MessageSquare,
  Quote,
  RefreshCcw,
  Redo2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Square,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'

type SceneAction =
  | 'scene.expand'
  | 'scene.autocomplete'
  | 'scene.rewrite'
  | 'scene.dialogue-polish'
  | 'scene.pacing'
  | 'scene.continuity-check'

type ScriptGenerateMode = 'script.from-idea' | 'script.from-novel'

type ExpandDraft = {
  insertPos: number
  fullText: string
  displayText: string
  status: 'streaming' | 'done'
}

type AutocompleteDraft = {
  insertPos: number
  fullText: string
  displayText: string
  status: 'streaming' | 'done'
}

type MenuAnchor = {
  pos: number
}

type AutocompleteGhostMeta = {
  pos: number | null
  text: string
}

function isLikelyHtml(raw: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(raw)
}

function createGhostDom(text: string): HTMLElement {
  const root = document.createElement('span')
  root.className = 'pointer-events-none text-base-content/35 align-baseline'

  const normalized = text.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/\n{2,}/)

  blocks.forEach((block, blockIndex) => {
    const lineWrapper = document.createElement('span')
    lineWrapper.className = 'block whitespace-pre-wrap break-words'

    const lines = block.split('\n')
    lines.forEach((line, lineIndex) => {
      lineWrapper.append(document.createTextNode(line))
      if (lineIndex < lines.length - 1) {
        lineWrapper.append(document.createElement('br'))
      }
    })

    root.append(lineWrapper)
    if (blockIndex < blocks.length - 1) {
      const gap = document.createElement('span')
      gap.className = 'block h-3'
      root.append(gap)
    }
  })

  return root
}

const autocompleteGhostPluginKey = new PluginKey<AutocompleteGhostMeta>('autocompleteGhost')

function createAutocompleteGhostPlugin() {
  return new Plugin<AutocompleteGhostMeta>({
    key: autocompleteGhostPluginKey,
    state: {
      init: () => ({ pos: null, text: '' }),
      apply(tr: Transaction, prev: AutocompleteGhostMeta) {
        const meta = tr.getMeta(autocompleteGhostPluginKey) as AutocompleteGhostMeta | undefined
        if (meta) return meta
        return prev
      },
    },
    props: {
      decorations(state: EditorState) {
        const ghost = autocompleteGhostPluginKey.getState(state)
        if (!ghost || ghost.pos == null || !ghost.text) return null
        const pos = Math.max(0, Math.min(ghost.pos, state.doc.content.size))
        const widget = Decoration.widget(
          pos,
          () => createGhostDom(ghost.text),
          { side: 1, ignoreSelection: true },
        )
        return DecorationSet.create(state.doc, [widget])
      },
    },
  })
}

interface ScriptEditorProps {
  content: string
  onContentChange: (content: string) => void
  selectedTextModelKey: string
  generatingRelationsFromScript?: boolean
  onGenerateRelationsFromScript?: () => void
}

export function ScriptEditor({
  content,
  onContentChange,
  selectedTextModelKey,
  generatingRelationsFromScript = false,
  onGenerateRelationsFromScript,
}: ScriptEditorProps) {
  const { t } = useTranslation()
  const [editorTick, setEditorTick] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiReport, setAiReport] = useState('')
  const [expandDraft, setExpandDraft] = useState<ExpandDraft | null>(null)
  const [autocompleteDraft, setAutocompleteDraft] = useState<AutocompleteDraft | null>(null)
  const [contextMenu, setContextMenu] = useState<MenuAnchor | null>(null)
  const [scriptGenerateMode, setScriptGenerateMode] = useState<ScriptGenerateMode | null>(null)
  const [scriptGenerateInput, setScriptGenerateInput] = useState('')
  const activeStreamRequestIdRef = useRef<string | null>(null)
  const activeStreamKindRef = useRef<'scene.expand' | 'scene.autocomplete' | null>(null)
  const autocompleteTimerRef = useRef<number | null>(null)
  const autocompleteArmedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const lastSavedContentRef = useRef(content)
  const editorPaneRef = useRef<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const initialContentType = useMemo<'html' | 'markdown'>(
    () => (isLikelyHtml(content) ? 'html' : 'markdown'),
    [content],
  )

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: content || '',
    contentType: initialContentType,
    editorProps: {
      attributes: {
        class:
          'h-full overflow-auto px-6 py-10 outline-none text-sm leading-7 max-w-3xl mx-auto',
      },
    },
    onCreate: ({ editor: nextEditor }: { editor: ReturnType<typeof useEditor> }) => {
      nextEditor?.registerPlugin(createAutocompleteGhostPlugin())
    },
    onUpdate: ({ editor: nextEditor }: { editor: ReturnType<typeof useEditor> }) => {
      setEditorTick((v) => v + 1)
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = window.setTimeout(() => {
        const nextContent = nextEditor.getMarkdown()
        if (nextContent === lastSavedContentRef.current) return
        lastSavedContentRef.current = nextContent
        onContentChange(nextContent)
      }, 350)
    },
    onSelectionUpdate: () => setEditorTick((v) => v + 1),
  })

  useEffect(() => {
    if (!editor) return
    const currentMarkdown = editor.getMarkdown()
    if (content === currentMarkdown) return
    lastSavedContentRef.current = content || ''
    if (isLikelyHtml(content)) {
      editor.commands.setContent(content || '', { contentType: 'html' })
    } else {
      editor.commands.setContent(content || '', { contentType: 'markdown' })
    }
  }, [content, editor])

  function clearActiveStream() {
    activeStreamRequestIdRef.current = null
    activeStreamKindRef.current = null
  }

  function clearAutocompleteTimer() {
    if (autocompleteTimerRef.current) {
      window.clearTimeout(autocompleteTimerRef.current)
      autocompleteTimerRef.current = null
    }
  }

  function clearAutocompleteDraft() {
    setAutocompleteDraft(null)
  }

  const draftOverlayStyle = useMemo(() => {
    if (!expandDraft || !editor || !editorPaneRef.current) return null
    try {
      const safePos = Math.max(0, Math.min(expandDraft.insertPos, editor.state.doc.content.size))
      const coords = editor.view.coordsAtPos(safePos)
      const rect = editorPaneRef.current.getBoundingClientRect()
      return { top: Math.max(8, coords.bottom - rect.top + 8) }
    } catch {
      return { top: 16 }
    }
  }, [expandDraft, editor])

  const syncAutocompleteGhost = useCallback(
    (next: AutocompleteGhostMeta) => {
      if (!editor) return
      editor.view.dispatch(editor.state.tr.setMeta(autocompleteGhostPluginKey, next))
    },
    [editor],
  )

  useEffect(() => {
    if (!editor) return
    if (!autocompleteDraft?.displayText) {
      syncAutocompleteGhost({ pos: null, text: '' })
      return
    }
    syncAutocompleteGhost({
      pos: autocompleteDraft.insertPos,
      text: autocompleteDraft.displayText,
    })
  }, [autocompleteDraft, editor, syncAutocompleteGhost])

  function handleSelectionFinished() {
    if (!editor || !editorPaneRef.current) return
    const { from, to, empty, head } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, '\n').trim()
    if (empty || !selectedText) {
      setContextMenu(null)
      return
    }
    setContextMenu({ pos: head })
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isTypingKey =
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete')

    if (isTypingKey) {
      autocompleteArmedRef.current = true
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
      event.preventDefault()
      clearAutocompleteTimer()
      void triggerAutocomplete(true)
      return
    }

    if (event.key === 'Escape') {
      if (autocompleteDraft) {
        event.preventDefault()
        discardAutocompleteDraft()
        return
      }
      return
    }

    if (event.key !== 'Tab') return
    if (!autocompleteDraft?.displayText) return

    const { empty, head } = editor?.state.selection ?? { empty: false, head: -1 }
    if (!empty || head !== autocompleteDraft.insertPos) return

    event.preventDefault()
    acceptAutocompleteDraft()
  }

  const contextMenuStyle = (() => {
    if (!contextMenu || !editor || !editorPaneRef.current) return null
    try {
      const rect = editorPaneRef.current.getBoundingClientRect()
      const endCoords = editor.view.coordsAtPos(contextMenu.pos)
      const width = 440
      const left = Math.max(width / 2 + 12, Math.min(endCoords.right - rect.left, rect.width - width / 2 - 12))
      const top = Math.max(20, endCoords.top - rect.top - 8)
      return { left, top }
    } catch {
      return null
    }
  })()

  useEffect(() => {
    if (!editorPaneRef.current) return
    const scrollEl = editorPaneRef.current.querySelector('.ProseMirror')
    if (!scrollEl) return
    const onScroll = () => setEditorTick((v) => v + 1)
    const onResize = () => setEditorTick((v) => v + 1)
    scrollEl.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onResize)
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || !contextMenu) return
    const { empty, head } = editor.state.selection
    if (empty) {
      setContextMenu(null)
      return
    }
    const nextPos = head
    if (nextPos !== contextMenu.pos) {
      setContextMenu({ pos: nextPos })
    }
  }, [contextMenu, editor, editorTick])

  const buildAutocompleteContext = useCallback((pos: number) => {
    if (!editor) return ''
    const doc = editor.state.doc
    const beforeStart = Math.max(0, pos - 700)
    const beforeText = doc.textBetween(beforeStart, pos, '\n').trim()
    if (!beforeText || beforeText.length < 8) return ''

    return [
      'Continue this screenplay at the cursor.',
      `Before cursor:\n${beforeText || '(empty)'}`,
    ].join('\n\n')
  }, [editor])

  const triggerAutocomplete = useCallback(async (manual = false) => {
    if (!editor) return
    if (aiBusy || (expandDraft && expandDraft.status === 'streaming')) return

    const { empty, head } = editor.state.selection
    if (!empty) {
      if (manual) setAiError(t('projectLibrary.aiAutocompleteNeedCursor'))
      return
    }

    const context = buildAutocompleteContext(head)
    if (!context.trim()) {
      if (manual) setAiError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setAiError('')
    setContextMenu(null)
    clearActiveStream()
    clearAutocompleteDraft()

    try {
      const start = await window.aiAPI.scriptToolkitStreamStart({
        action: 'scene.autocomplete',
        context,
        modelKey: selectedTextModelKey || undefined,
      })

      if (!start.ok) {
        if (manual || /No default text model configured/i.test(start.error)) setAiError(start.error)
        return
      }

      activeStreamRequestIdRef.current = start.requestId
      activeStreamKindRef.current = 'scene.autocomplete'
      setAutocompleteDraft({
        insertPos: head,
        fullText: '',
        displayText: '',
        status: 'streaming',
      })
    } catch {
      if (manual) setAiError(t('projectLibrary.aiToolkitFailed'))
    }
  }, [aiBusy, buildAutocompleteContext, editor, expandDraft, selectedTextModelKey, t])

  useEffect(() => {
    if (!editor) return

    const { empty, head } = editor.state.selection
    if (!empty) {
      clearAutocompleteTimer()
      if (autocompleteDraft) {
        clearActiveStream()
        clearAutocompleteDraft()
      }
      return
    }

    if (autocompleteDraft && autocompleteDraft.insertPos !== head) {
      clearActiveStream()
      clearAutocompleteDraft()
      clearAutocompleteTimer()
      return
    }

    if (aiBusy || (expandDraft && expandDraft.status === 'streaming')) {
      clearAutocompleteTimer()
      return
    }

    if (!autocompleteArmedRef.current) return

    if (activeStreamKindRef.current === 'scene.autocomplete') return
    if (autocompleteDraft) return

    clearAutocompleteTimer()
    autocompleteTimerRef.current = window.setTimeout(() => {
      autocompleteArmedRef.current = false
      void triggerAutocomplete(false)
    }, 450)

    return () => {
      clearAutocompleteTimer()
    }
  }, [editor, editorTick, aiBusy, expandDraft, autocompleteDraft, triggerAutocomplete])

  async function runToolkit(action: SceneAction) {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, '\n')

    if (!selectedText.trim()) {
      setAiError(t('projectLibrary.aiSelectSceneFirst'))
      return
    }

    const context = selectedText.trim()
    if (!context) {
      setAiError(t('projectLibrary.aiEditorEmpty'))
      return
    }

    setAiBusy(true)
    setAiError('')
    setAiReport('')
    setContextMenu(null)
    clearAutocompleteTimer()
    clearAutocompleteDraft()
    if (action !== 'scene.expand') setExpandDraft(null)

    try {
      if (action === 'scene.expand') {
        const start = await window.aiAPI.scriptToolkitStreamStart({ action, context, modelKey: selectedTextModelKey || undefined })
        if (!start.ok) {
          setAiError(start.error)
          return
        }
        activeStreamRequestIdRef.current = start.requestId
        activeStreamKindRef.current = 'scene.expand'
        setExpandDraft({
          insertPos: to,
          fullText: '',
          displayText: '',
          status: 'streaming',
        })
      } else {
        const result = await window.aiAPI.scriptToolkit({ action, context, modelKey: selectedTextModelKey || undefined })
        if (!result.ok) {
          setAiError(result.error)
          return
        }

        if (action === 'scene.pacing' || action === 'scene.continuity-check') {
          setAiReport(result.text)
        } else {
          editor.chain().focus().insertContentAt({ from, to }, result.text).run()
        }
      }
    } catch {
      setAiError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setAiBusy(false)
    }
  }

  function openGenerateDialog(mode: ScriptGenerateMode) {
    if (aiBusy || (expandDraft && expandDraft.status === 'streaming')) return
    setAiError('')
    setAiReport('')
    setContextMenu(null)
    setScriptGenerateInput('')
    setScriptGenerateMode(mode)
  }

  function closeGenerateDialog() {
    if (aiBusy) return
    setScriptGenerateMode(null)
    setScriptGenerateInput('')
  }

  async function submitGenerateScript() {
    if (!editor || !scriptGenerateMode) return
    const input = scriptGenerateInput.trim()
    if (!input) {
      setAiError(t('projectLibrary.aiGenerateInputRequired'))
      return
    }

    setAiBusy(true)
    setAiError('')
    setAiReport('')
    setContextMenu(null)
    clearAutocompleteTimer()
    clearAutocompleteDraft()
    setExpandDraft(null)
    clearActiveStream()

    try {
      const result = await window.aiAPI.scriptToolkit({
        action: scriptGenerateMode,
        context: input,
        modelKey: selectedTextModelKey || undefined,
      })
      if (!result.ok) {
        setAiError(result.error)
        return
      }
      const generatedText = result.text.trim()
      if (!generatedText) {
        setAiError(t('projectLibrary.aiToolkitFailed'))
        return
      }
      const { from, to } = editor.state.selection
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, generatedText, { contentType: 'markdown' })
        .run()
      setScriptGenerateMode(null)
      setScriptGenerateInput('')
    } catch {
      setAiError(t('projectLibrary.aiToolkitFailed'))
    } finally {
      setAiBusy(false)
    }
  }

  function acceptExpandDraft() {
    if (!editor || !expandDraft) return
    editor.chain().focus().insertContentAt(expandDraft.insertPos, `\n\n${expandDraft.displayText}`).run()
    clearActiveStream()
    setExpandDraft(null)
  }

  function acceptAutocompleteDraft() {
    if (!editor || !autocompleteDraft?.displayText) return
    const { empty, head } = editor.state.selection
    if (!empty || head !== autocompleteDraft.insertPos) return
    editor
      .chain()
      .focus()
      .insertContentAt(autocompleteDraft.insertPos, autocompleteDraft.displayText, { contentType: 'markdown' })
      .run()
    clearActiveStream()
    clearAutocompleteDraft()
  }

  function discardExpandDraft() {
    clearActiveStream()
    setExpandDraft(null)
  }

  function discardAutocompleteDraft() {
    if (activeStreamKindRef.current === 'scene.autocomplete') {
      clearActiveStream()
    }
    clearAutocompleteDraft()
  }

  function stopAiToolkit() {
    clearActiveStream()
    setAiBusy(false)
    setExpandDraft((prev) => (prev ? { ...prev, status: 'done' } : null))
  }

  useEffect(() => {
    const off = window.aiAPI.onScriptToolkitStreamChunk((payload) => {
      if (!activeStreamRequestIdRef.current) return
      if (payload.requestId !== activeStreamRequestIdRef.current) return

      const streamKind = activeStreamKindRef.current
      if (!streamKind) return

      if (payload.error) {
        setAiError(payload.error)
        clearActiveStream()
        if (streamKind === 'scene.expand') {
          setExpandDraft((prev) => (prev ? { ...prev, status: 'done' } : null))
        } else {
          setAutocompleteDraft((prev) => (prev ? { ...prev, status: 'done' } : null))
        }
        return
      }

      if (payload.done) {
        clearActiveStream()
        if (streamKind === 'scene.expand') {
          setExpandDraft((prev) => (prev ? { ...prev, status: 'done' } : null))
        } else {
          setAutocompleteDraft((prev) => (prev ? { ...prev, status: 'done' } : null))
        }
        return
      }

      if (payload.chunk) {
        if (streamKind === 'scene.expand') {
          setExpandDraft((prev) => {
            if (!prev) return null
            const nextText = prev.displayText + payload.chunk
            return {
              ...prev,
              fullText: nextText,
              displayText: nextText,
              status: 'streaming',
            }
          })
        } else {
          setAutocompleteDraft((prev) => {
            if (!prev) return null
            const nextText = prev.displayText + payload.chunk
            return {
              ...prev,
              fullText: nextText,
              displayText: nextText,
              status: 'streaming',
            }
          })
        }
      }
    })

    return () => {
      off()
      clearActiveStream()
    }
  }, [])

  useEffect(() => {
    const onGlobalMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (contextMenuRef.current && target && contextMenuRef.current.contains(target)) return
      setContextMenu(null)
    }
    window.addEventListener('mousedown', onGlobalMouseDown)
    return () => window.removeEventListener('mousedown', onGlobalMouseDown)
  }, [])

  useEffect(() => {
    return () => {
      clearAutocompleteTimer()
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const aiActionsBusy = aiBusy || Boolean(expandDraft && expandDraft.status === 'streaming')

  return (
    <div className="rounded-2xl border border-base-300 bg-base-100/95 shadow-sm overflow-hidden max-w-350 mx-auto h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-center gap-1 border-b border-base-300 p-2.5 bg-base-100">
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('heading', { level: 1 }) ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="Heading 1"><Heading1 size={16} /></button>
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('heading', { level: 2 }) ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading 2"><Heading2 size={16} /></button>
        <div className="w-px h-5 bg-base-300 mx-1" />
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('bold') ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold"><Bold size={16} /></button>
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('italic') ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic size={16} /></button>
        <div className="w-px h-5 bg-base-300 mx-1" />
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('bulletList') ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="Bullet list"><List size={16} /></button>
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('orderedList') ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="Ordered list"><ListOrdered size={16} /></button>
        <button type="button" className={`btn btn-sm btn-ghost ${editor?.isActive('blockquote') ? 'bg-base-200' : ''}`} onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="Quote"><Quote size={16} /></button>
        <div className="w-px h-5 bg-base-300 mx-1" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().chain().focus().undo().run()} aria-label="Undo"><Undo2 size={16} /></button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().chain().focus().redo().run()} aria-label="Redo"><Redo2 size={16} /></button>
        <div className="w-px h-5 bg-base-300 mx-1" />
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-square"
          onClick={() => {
            clearAutocompleteTimer()
            void triggerAutocomplete(true)
          }}
          disabled={aiActionsBusy}
          title={t('projectLibrary.aiAutocomplete')}
          aria-label={t('projectLibrary.aiAutocomplete')}
        >
          <Wand2 size={14} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-square"
          onClick={() => openGenerateDialog('script.from-idea')}
          disabled={aiActionsBusy}
          title={t('projectLibrary.aiGenerateFromIdea')}
          aria-label={t('projectLibrary.aiGenerateFromIdea')}
        >
          <Sparkles size={14} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-square"
          onClick={() => openGenerateDialog('script.from-novel')}
          disabled={aiActionsBusy}
          title={t('projectLibrary.aiGenerateFromNovel')}
          aria-label={t('projectLibrary.aiGenerateFromNovel')}
        >
          <ScrollText size={14} />
        </button>
        {onGenerateRelationsFromScript ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-square"
            onClick={onGenerateRelationsFromScript}
            disabled={aiActionsBusy || generatingRelationsFromScript}
            title={generatingRelationsFromScript ? t('projectLibrary.aiStreaming') : t('projectLibrary.relationOptimizeFromCurrentScript')}
            aria-label={generatingRelationsFromScript ? t('projectLibrary.aiStreaming') : t('projectLibrary.relationOptimizeFromCurrentScript')}
          >
            <Activity size={14} />
          </button>
        ) : null}
      </div>

      {aiError ? <div className="px-3 py-2 text-xs text-error border-b border-base-300">{aiError}</div> : null}
      {aiReport ? <div className="px-3 py-2 text-xs text-base-content/80 border-b border-base-300 whitespace-pre-wrap">{aiReport}</div> : null}

      {scriptGenerateMode ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-semibold text-base">
              {scriptGenerateMode === 'script.from-idea'
                ? t('projectLibrary.aiGenerateFromIdeaTitle')
                : t('projectLibrary.aiGenerateFromNovelTitle')}
            </h3>
            <p className="text-sm text-base-content/60 mt-1">
              {scriptGenerateMode === 'script.from-idea'
                ? t('projectLibrary.aiGenerateFromIdeaHint')
                : t('projectLibrary.aiGenerateFromNovelHint')}
            </p>
            <textarea
              className="textarea textarea-bordered w-full h-52 mt-3"
              value={scriptGenerateInput}
              onChange={(event) => setScriptGenerateInput(event.target.value)}
              placeholder={
                scriptGenerateMode === 'script.from-idea'
                  ? t('projectLibrary.aiGenerateFromIdeaPlaceholder')
                  : t('projectLibrary.aiGenerateFromNovelPlaceholder')
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void submitGenerateScript()
                }
              }}
            />
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeGenerateDialog} disabled={aiBusy}>
                {t('projectLibrary.cancel')}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void submitGenerateScript()} disabled={aiBusy}>
                {aiBusy ? <span className="loading loading-spinner loading-xs" /> : null}
                {t('projectLibrary.aiGenerateScript')}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={closeGenerateDialog} />
        </dialog>
      ) : null}

      <div ref={editorPaneRef} className="relative flex-1 min-h-0" onMouseUp={handleSelectionFinished} onKeyDown={handleEditorKeyDown}>
        <EditorContent
          editor={editor}
          className="flex-1 min-h-0 h-full [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:mb-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-base-300 [&_.ProseMirror_blockquote]:pl-3"
        />

        {expandDraft && draftOverlayStyle ? (
          <div className="absolute left-4 right-4 rounded-xl border border-primary/30 bg-base-100/95 shadow-lg backdrop-blur p-3" style={{ top: `${draftOverlayStyle.top}px` }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-primary">{t('projectLibrary.aiDraftTitle')}</p>
              <div className="flex gap-1">
                <button type="button" className="btn btn-xs btn-ghost" onClick={discardExpandDraft}><X size={12} />{t('projectLibrary.aiDiscard')}</button>
                <button type="button" className="btn btn-xs btn-primary" onClick={acceptExpandDraft} disabled={expandDraft.status === 'streaming'}><Check size={12} />{t('projectLibrary.aiAccept')}</button>
              </div>
            </div>
            <div className="text-sm text-base-content/80 whitespace-pre-wrap max-h-44 overflow-auto">
              {expandDraft.displayText || t('projectLibrary.aiStreaming')}
            </div>
          </div>
        ) : null}

        {contextMenu && contextMenuStyle ? (
          <div
            ref={contextMenuRef}
            className="absolute z-20"
            style={{
              left: `${contextMenuStyle.left}px`,
              top: `${contextMenuStyle.top}px`,
              transform: 'translate(-50%, calc(-100% - 10px))',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="rounded-2xl border border-base-300/90 bg-base-100/96 shadow-2xl backdrop-blur px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-circle"
                title={t('projectLibrary.aiSceneExpand')}
                aria-label={t('projectLibrary.aiSceneExpand')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void runToolkit('scene.expand')}
                disabled={aiBusy}
              >
                <Wand2 size={15} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-circle"
                title={t('projectLibrary.aiSceneRewrite')}
                aria-label={t('projectLibrary.aiSceneRewrite')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void runToolkit('scene.rewrite')}
                disabled={aiBusy}
              >
                <RefreshCcw size={15} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-circle"
                title={t('projectLibrary.aiSceneDialoguePolish')}
                aria-label={t('projectLibrary.aiSceneDialoguePolish')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void runToolkit('scene.dialogue-polish')}
                disabled={aiBusy}
              >
                <MessageSquare size={15} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-circle"
                title={t('projectLibrary.aiScenePacing')}
                aria-label={t('projectLibrary.aiScenePacing')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void runToolkit('scene.pacing')}
                disabled={aiBusy}
              >
                <Activity size={15} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-circle"
                title={t('projectLibrary.aiSceneContinuityCheck')}
                aria-label={t('projectLibrary.aiSceneContinuityCheck')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void runToolkit('scene.continuity-check')}
                disabled={aiBusy}
              >
                <ShieldCheck size={15} />
              </button>
            </div>
            </div>
          </div>
        ) : null}

        {(aiBusy || (expandDraft && expandDraft.status === 'streaming')) ? (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(860px,calc(100%-2rem))] rounded-xl border border-base-300 bg-base-100/95 shadow-xl backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-primary/40" />
                <span className="w-2.5 h-2.5 rounded-full bg-base-300" />
              </div>
              <span className="font-medium text-primary">{t('projectLibrary.aiToolkitRunning')}</span>
            </div>

            <button type="button" className="btn btn-ghost btn-xs" onClick={stopAiToolkit}>
              <Square size={12} />
              {t('projectLibrary.aiStop')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
