import { DEFAULT_AI_CONFIG } from '@openframe/providers'
import { registerAIBaseAndMediaHandlers } from './ai/register-base-media'
import { registerAIExtractionHandlers } from './ai/register-extraction'
import { registerAIStyleAndScriptHandlers } from './ai/register-style-script'

export function registerAIHandlers() {
  registerAIBaseAndMediaHandlers()
  registerAIStyleAndScriptHandlers()
  registerAIExtractionHandlers()
}

export { DEFAULT_AI_CONFIG }
