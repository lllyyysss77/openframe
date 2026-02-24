import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft, Clock3, Play, Plus, Trash2 } from 'lucide-react'
import { projectsCollection } from '../db/projects_collection'
import { seriesCollection } from '../db/series_collection'

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: projects } = useLiveQuery(projectsCollection)
  const { data: allSeries } = useLiveQuery(seriesCollection)

  const project = useMemo(() => (projects ?? []).find((p) => p.id === projectId) ?? null, [projects, projectId])
  const series = useMemo(
    () => (allSeries ?? []).filter((item) => item.project_id === projectId).sort((a, b) => a.sort_index - b.sort_index),
    [allSeries, projectId],
  )

  const [saving, setSaving] = useState(false)

  async function handleAddSeries() {
    const duration = 0

    setSaving(true)
    try {
      const nextSortIndex = series.length === 0 ? 1 : Math.max(...series.map((s) => s.sort_index)) + 1
      seriesCollection.insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        sort_index: nextSortIndex,
        thumbnail: null,
        duration,
        created_at: Date.now(),
      })
      projectsCollection.update(projectId, (draft) => {
        draft.series_count = draft.series_count + 1
      })
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteSeries(seriesId: string) {
    seriesCollection.delete(seriesId)
    projectsCollection.update(projectId, (draft) => {
      draft.series_count = Math.max(0, draft.series_count - 1)
    })
  }

  if (!project) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        <p className="text-sm text-base-content/60">{t('projectLibrary.notFound')}</p>
      </main>
    )
  }

  return (
    <main className="flex-1 p-6 overflow-auto bg-gradient-to-br from-base-200/40 via-base-100 to-base-200/20">
      <div className="max-w-full">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold mb-1 text-base-content">{project.name}</h1>
            <p className="text-base-content/60 text-sm">{t('projectLibrary.episodesSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ to: '/projects' })}>
              <ArrowLeft size={14} />
              {t('projectLibrary.backToList')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {series.map((item) => (
            <div key={item.id} className="w-64 rounded-xl border border-base-300 bg-base-100 p-4 hover:shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <span className="inline-flex items-center rounded-md bg-base-200 px-2 py-1 text-xs text-base-content/70">
                  {t('projectLibrary.seriesNo')} {item.sort_index}
                </span>
                <button
                  className="btn btn-ghost btn-xs text-base-content/50 hover:text-error"
                  onClick={() => handleDeleteSeries(item.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-lg font-semibold text-base-content">{t('projectLibrary.seriesNo')}{item.sort_index}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-base-content/60">
                  <Clock3 size={12} />
                  {item.duration} {t('projectLibrary.minute')}
                </p>
              </div>

              <div className="border-t border-base-300 pt-3 flex justify-end">
                <button type="button" className="btn btn-primary btn-xs">
                  <Play size={12} />
                  {t('projectLibrary.enterCreation')}
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void handleAddSeries()}
            disabled={saving}
            className="w-64 h-47.5 rounded-xl border border-dashed border-base-300 bg-base-100/60 hover:bg-base-200/60 transition-colors flex flex-col items-center justify-center gap-3 text-base-content"
          >
            <Plus size={32} className="text-base-content/50" />
            <p className="text-lg font-semibold">{t('projectLibrary.addSeries')}</p>
            <p className="text-xs text-base-content/60">{t('projectLibrary.addSeriesHint')}</p>
          </button>
        </div>

      </div>
    </main>
  )
}
