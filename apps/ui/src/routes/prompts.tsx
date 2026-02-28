import { createFileRoute } from '@tanstack/react-router'
import { PromptManagerPage } from '../components/PromptManagerPage'

export const Route = createFileRoute('/prompts')({
  component: PromptManagerPage,
})
