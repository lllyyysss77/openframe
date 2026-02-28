import { createFileRoute } from '@tanstack/react-router'
import { GenreEditorPage } from '../components/GenreEditorPage'

export const Route = createFileRoute('/genres/$genreId')({
  component: EditGenrePage,
})

function EditGenrePage() {
  const { genreId } = Route.useParams()
  return <GenreEditorPage genreId={genreId} />
}
