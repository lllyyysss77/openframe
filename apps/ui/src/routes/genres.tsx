import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { PencilLine, Trash2, ImageOff, Plus } from 'lucide-react'
import { genresCollection, type Genre } from '../db/genres_collection'

export const Route = createFileRoute('/genres')({
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

function DeleteDialog({ name, onConfirm, onCancel, t }: { name: string; onConfirm: () => void; onCancel: () => void; t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-sm">
        <p className="text-sm">{t('styleLibrary.deleteConfirm', { name })}</p>
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('styleLibrary.cancel')}</button>
          <button className="btn btn-error btn-sm" onClick={onConfirm}>{t('styleLibrary.delete')}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </dialog>
  )
}

function GenreCard({ genre, t, onDelete }: { genre: Genre; t: ReturnType<typeof useTranslation>['t']; onDelete: () => void }) {
  return (
    <div className="card bg-base-100 border border-base-300 hover:border-base-content/20 transition-colors w-60 hover:shadow-lg">
      <figure className="h-40 bg-base-200 overflow-hidden rounded-t-box shrink-0">
        {getThumbnailSrc(genre.thumbnail) ? (
          <img src={getThumbnailSrc(genre.thumbnail)!} alt={genre.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base-content/20">
            <ImageOff size={32} />
          </div>
        )}
      </figure>
      <div className="card-body p-4 gap-2">
        <div>
          <h3 className="font-semibold leading-snug">{genre.name}</h3>
          <code className="text-xs text-base-content/50">{genre.code}</code>
        </div>
        {genre.description && <p className="text-sm text-base-content/60 line-clamp-2">{genre.description}</p>}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-xs text-base-content/40">{formatDate(genre.created_at)}</span>
          <div className="flex gap-1">
            <Link to="/genres/$genreId" params={{ genreId: genre.id }} className="btn btn-ghost btn-xs">
              <PencilLine size={13} />
              {t('styleLibrary.edit')}
            </Link>
            <button className="btn btn-ghost btn-xs text-error" onClick={onDelete}>
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
  const { location } = useRouterState()
  const { data: genresList } = useLiveQuery(genresCollection)
  const [genreDeleteTarget, setGenreDeleteTarget] = useState<Genre | null>(null)
  const genres = useMemo(() => [...(genresList ?? [])].sort((a, b) => b.created_at - a.created_at), [genresList])

  if (location.pathname !== '/genres') {
    return <Outlet />
  }

  function handleGenreDelete(genre: Genre) {
    try {
      genresCollection.delete(genre.id)
      if (genre.thumbnail) window.thumbnailsAPI.delete(genre.thumbnail)
    } catch {
      // ignore
    }
    setGenreDeleteTarget(null)
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('menu.list')}</h1>
          <p className="text-base-content/60 text-sm">{t('styleLibrary.subtitle')}</p>
        </div>
        <Link to="/genres/new" className="btn btn-primary btn-sm">
          <Plus size={15} />
          {t('styleLibrary.create')}
        </Link>
      </div>

      {genres.length === 0 ? (
        <div className="text-center text-base-content/40 py-16 text-sm">{t('styleLibrary.empty')}</div>
      ) : (
        <div className="flex gap-4 flex-wrap">
          {genres.map((genre) => (
            <GenreCard key={genre.id} genre={genre} onDelete={() => setGenreDeleteTarget(genre)} t={t} />
          ))}
        </div>
      )}

      {genreDeleteTarget && (
        <DeleteDialog
          name={genreDeleteTarget.name}
          onConfirm={() => handleGenreDelete(genreDeleteTarget)}
          onCancel={() => setGenreDeleteTarget(null)}
          t={t}
        />
      )}
    </main>
  )
}
