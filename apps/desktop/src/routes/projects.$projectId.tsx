import { createFileRoute } from '@tanstack/react-router'
import { ProjectDetailPage } from '../components/ProjectDetailPage'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectSeriesPage,
})

function ProjectSeriesPage() {
  const { projectId } = Route.useParams()
  return <ProjectDetailPage projectId={projectId} />
}
