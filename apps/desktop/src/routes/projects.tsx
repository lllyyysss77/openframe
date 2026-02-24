import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Trash2, ImageOff, Plus } from 'lucide-react'
import { PROJECT_CATEGORIES } from '@openframe/shared'
import { projectsCollection, type Project } from '../db/projects_collection'
import { genresCollection } from '../db/genres_collection'
import { seriesCollection } from '../db/series_collection'

export const Route = createFileRoute('/projects')({
  component: ListPage,
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}

function getThumbnailSrc(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('openframe-thumb://')) return value
  const normalized = value.startsWith('file://') ? value.slice(7) : value
  return `openframe-thumb://local?path=${encodeURIComponent(normalized)}`
}

function parseCategoryIds(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx)
}

function DeleteDialog({ name, onConfirm, onCancel, t }: { name: string; onConfirm: () => void; onCancel: () => void; t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-sm">
        <p className="text-sm">{t('projectLibrary.deleteConfirm', { name })}</p>
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('projectLibrary.cancel')}</button>
          <button className="btn btn-error btn-sm" onClick={onConfirm}>{t('projectLibrary.delete')}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </dialog>
  )
}

function ProjectCard({
  project,
  genreName,
  onOpen,
  onDelete,
}: {
  project: Project
  genreName: string
  onOpen: () => void
  onDelete: () => void
}) {
  const { i18n } = useTranslation()
  const localeKey: 'en' | 'cn' = i18n.language.startsWith('zh') ? 'cn' : 'en'
  const categoryNames = parseCategoryIds(project.category)
    .map((id) => PROJECT_CATEGORIES.find((item) => item.id === id)?.locales[localeKey])
    .filter(Boolean)

  return (
    <div
      className="card bg-base-100 border border-base-300 hover:border-base-content/20 transition-colors w-64 hover:shadow-lg cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <figure className="h-40 bg-base-200 overflow-hidden rounded-t-box shrink-0">
        {getThumbnailSrc(project.thumbnail) ? (
          <img src={getThumbnailSrc(project.thumbnail)!} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base-content/20">
            <ImageOff size={32} />
          </div>
        )}
      </figure>
      <div className="card-body p-4 gap-2">
        <div>
          <h3 className="font-semibold leading-snug">{project.name}</h3>
          <p className="text-xs text-base-content/50">{project.video_ratio} · {project.series_count}</p>
        </div>
        <p className="text-sm text-base-content/60 line-clamp-1">{categoryNames.join(' / ')}</p>
        <p className="text-sm text-base-content/60 line-clamp-1">{genreName}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-xs text-base-content/40">{formatDate(project.created_at)}</span>
          <div className="flex gap-1">
            <button className="btn btn-ghost btn-xs text-error" onClick={(e) => { e.stopPropagation(); onDelete() }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const { data: projectsList } = useLiveQuery(projectsCollection)
  const { data: genresList } = useLiveQuery(genresCollection)
  const { data: seriesList } = useLiveQuery(seriesCollection)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const projects = useMemo(() => [...(projectsList ?? [])].sort((a, b) => b.created_at - a.created_at), [projectsList])
  const genreNameMap = useMemo(
    () => new Map((genresList ?? []).map((genre) => [genre.id, genre.name])),
    [genresList],
  )

  if (location.pathname !== '/projects') {
    return <Outlet />
  }

  function handleDelete(project: Project) {
    try {
      const relatedSeries = (seriesList ?? [])
        .filter((series) => series.project_id === project.id)
      relatedSeries.forEach((series) => seriesCollection.delete(series.id))
      projectsCollection.delete(project.id)
      if (project.thumbnail) {
        void window.thumbnailsAPI.delete(project.thumbnail)
      }
    } catch {
      // ignore
    }
    setDeleteTarget(null)
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('projectLibrary.title')}</h1>
          <p className="text-base-content/60 text-sm">{t('projectLibrary.subtitle')}</p>
        </div>
        <Link to="/projects/new" className="btn btn-primary btn-sm">
          <Plus size={15} />
          {t('projectLibrary.create')}
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center text-base-content/40 py-16 text-sm">{t('projectLibrary.empty')}</div>
      ) : (
        <div className="flex gap-4 flex-wrap">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              genreName={genreNameMap.get(project.genre) ?? project.genre}
              onOpen={() => navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteDialog
          name={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          t={t}
        />
      )}
    </main>
  )
}
