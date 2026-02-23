import { createFileRoute } from '@tanstack/react-router'
import { GenreEditorPage } from '../components/GenreEditorPage'

export const Route = createFileRoute('/genres/new')({
  component: () => <GenreEditorPage />,
})
