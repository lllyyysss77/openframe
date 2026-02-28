import { useEffect, useMemo, useRef } from 'react'
import { Network, Plus, Minus, Scan } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import type { CharacterRelation } from '../db/character_relations_collection'

type CharacterOption = {
  id: string
  name: string
  thumbnail: string | null
}

interface CharacterRelationGraphPanelProps {
  characters: CharacterOption[]
  relations: CharacterRelation[]
}

function clampStrength(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.max(1, Math.min(5, Math.round(value)))
}

function strengthColor(strength: number): string {
  const s = clampStrength(strength)
  if (s <= 1) return 'rgba(166, 214, 255, 0.9)'
  if (s === 2) return 'rgba(135, 230, 211, 0.9)'
  if (s === 3) return 'rgba(247, 206, 112, 0.9)'
  if (s === 4) return 'rgba(255, 162, 109, 0.9)'
  return 'rgba(255, 112, 156, 0.92)'
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (/^(https?:|data:|blob:|openframe-thumb:)/i.test(value)) return value
  return `openframe-thumb://local?path=${encodeURIComponent(value)}`
}

export function CharacterRelationGraphPanel({
  characters,
  relations,
}: CharacterRelationGraphPanelProps) {
  const { t } = useTranslation()
  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const graphInstanceRef = useRef<Core | null>(null)

  const characterIdSet = useMemo(() => new Set(characters.map((item) => item.id)), [characters])

  const graphRelations = useMemo(
    () => relations
      .filter((row) => row.source_character_id !== row.target_character_id)
      .filter((row) => characterIdSet.has(row.source_character_id) && characterIdSet.has(row.target_character_id)),
    [relations, characterIdSet],
  )

  const relationDegreeById = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of graphRelations) {
      map.set(row.source_character_id, (map.get(row.source_character_id) ?? 0) + 1)
      map.set(row.target_character_id, (map.get(row.target_character_id) ?? 0) + 1)
    }
    return map
  }, [graphRelations])

  const graphElements = useMemo<ElementDefinition[]>(() => {
    const nodes: ElementDefinition[] = characters.map((character) => {
      const degree = relationDegreeById.get(character.id) ?? 0
      const thumb = getThumbnailSrc(character.thumbnail)
      const size = 80 + Math.min(10, degree * 1.2)
      const shortName = (character.name || t('projectLibrary.characterDefaultName')).trim()
      const displayName = shortName.length > 8 ? `${shortName.slice(0, 8)}...` : shortName
      return {
        data: {
          id: character.id,
          label: displayName,
          image: thumb || '',
          size,
        },
      }
    })

    const edges: ElementDefinition[] = graphRelations.map((row) => {
      const strength = clampStrength(row.strength)
      return {
        classes: strength <= 2 ? 'weak-edge' : '',
        data: {
          id: row.id,
          source: row.source_character_id,
          target: row.target_character_id,
          label: row.relation_type || '',
          color: strengthColor(strength),
        },
      }
    })

    return [...nodes, ...edges]
  }, [characters, graphRelations, relationDegreeById, t])

  useEffect(() => {
    if (!graphContainerRef.current) return

    if (!graphInstanceRef.current) {
      graphInstanceRef.current = cytoscape({
        container: graphContainerRef.current,
        elements: graphElements,
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3.2,
        autoungrabify: true,
        style: [
          {
            selector: 'node',
            style: {
              width: 'data(size)',
              height: 'data(size)',
              shape: 'ellipse',
              'background-color': 'rgba(247, 236, 252, 0.78)',
              'background-image': 'data(image)',
              'background-fit': 'cover',
              'background-clip': 'node',
              'background-repeat': 'no-repeat',
              'background-opacity': 1,
              label: 'data(label)',
              color: '#333',
              'font-size': 10,
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-halign': 'center',
              'text-margin-y': 14,
              'text-wrap': 'none',
              'overlay-opacity': 0,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1.4,
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'target-arrow-fill': 'filled',
              'curve-style': 'unbundled-bezier',
              'control-point-distance': 12,
              'control-point-weight': 0.5,
              label: 'data(label)',
              color: '#b188c9',
              'font-size': 10,
              'text-rotation': 'autorotate',
              'text-margin-y': -6,
              'text-background-opacity': 0,
              'overlay-opacity': 0,
            },
          },
          {
            selector: 'edge.weak-edge',
            style: {
              'line-style': 'dashed',
            },
          },
        ],
      })
    } else {
      const graph = graphInstanceRef.current
      graph.startBatch()
      graph.elements().remove()
      graph.add(graphElements)
      graph.endBatch()
    }

    const graph = graphInstanceRef.current
    const layout = graph.layout({
      name: 'cose',
      animate: true,
      animationDuration: 450,
      fit: true,
      padding: 80,
      nodeRepulsion: 9800,
      nodeOverlap: 24,
      idealEdgeLength: 300,
      edgeElasticity: 60,
      nestingFactor: 0.8,
      gravity: 0.22,
      randomize: true,
      numIter: 1200,
    })
    layout.run()
    graph.fit(graph.elements(), 64)
  }, [graphElements])

  useEffect(() => () => {
    graphInstanceRef.current?.destroy()
    graphInstanceRef.current = null
  }, [])

  function getGraphInstance(): Core | null {
    return graphInstanceRef.current
  }

  async function handleZoomIn() {
    const graph = getGraphInstance()
    if (!graph) return
    const next = Math.min(3.2, graph.zoom() + 0.2)
    graph.zoom(next)
  }

  async function handleZoomOut() {
    const graph = getGraphInstance()
    if (!graph) return
    const next = Math.max(0.2, graph.zoom() - 0.2)
    graph.zoom(next)
  }

  async function handleZoomFit() {
    const graph = getGraphInstance()
    if (!graph) return
    graph.fit(graph.elements(), 64)
  }

  return (
    <section className="h-full min-h-0 rounded-2xl border border-base-300 bg-transparent p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-wide flex items-center gap-2">
            <Network size={16} />
            {t('projectLibrary.relationPanelTitle')}
          </h2>
          <p className="text-xs text-base-content/60 mt-1">{t('projectLibrary.relationPanelSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => void handleZoomOut()} title={t('projectLibrary.relationZoomOut')}>
            <Minus size={13} />
          </button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => void handleZoomIn()} title={t('projectLibrary.relationZoomIn')}>
            <Plus size={13} />
          </button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => void handleZoomFit()} title={t('projectLibrary.relationZoomFit')}>
            <Scan size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-base-300 bg-transparent overflow-hidden min-h-107.5 2xl:min-h-0 relative">
          <div className="relative px-3 py-2 border-b border-base-300 text-xs text-base-content/60">
            {t('projectLibrary.relationGraphHint')}
          </div>
          {characters.length < 2 ? (
            <div className="h-full min-h-95 px-4 py-6 text-sm text-base-content/60 flex items-center justify-center text-center bg-transparent relative">
              {t('projectLibrary.relationNeedCharacters')}
            </div>
          ) : (
            <div className="h-130 2xl:h-full relative">
              <div ref={graphContainerRef} className="h-full w-full" />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2">
        <div className="text-[11px] text-base-content/65 mb-2">
          {t('projectLibrary.relationStrengthLabel')}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strengthColor(1) }} />
            1 {t('projectLibrary.relationStrengthVeryWeak')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strengthColor(2) }} />
            2 {t('projectLibrary.relationStrengthWeak')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strengthColor(3) }} />
            3 {t('projectLibrary.relationStrengthMedium')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strengthColor(4) }} />
            4 {t('projectLibrary.relationStrengthStrong')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strengthColor(5) }} />
            5 {t('projectLibrary.relationStrengthVeryStrong')}
          </span>
        </div>
      </div>
    </section>
  )
}
