import { createFileRoute } from '@tanstack/react-router'
import { ProjectEditorPage } from '../components/ProjectEditorPage'

export const Route = createFileRoute('/projects/new')({
  component: () => <ProjectEditorPage />,
})
