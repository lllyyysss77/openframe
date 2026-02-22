export type ModelType = 'text' | 'image' | 'video'

export interface ModelDef {
  id: string
  name: string
  type: ModelType
}

export interface ProviderDef {
  id: string
  /** Package name from Vercel AI SDK, undefined = custom REST */
  sdkPackage?: string
  name: string
  models: ModelDef[]
}

// ── Official Vercel AI SDK providers ─────────────────────────────────────────

export const AI_PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    sdkPackage: '@ai-sdk/openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o',       name: 'GPT-4o',       type: 'text' },
      { id: 'gpt-4o-mini',  name: 'GPT-4o mini',  type: 'text' },
      { id: 'o3-mini',      name: 'o3 mini',       type: 'text' },
      { id: 'o1',           name: 'o1',            type: 'text' },
      { id: 'dall-e-3',     name: 'DALL·E 3',      type: 'image' },
      { id: 'dall-e-2',     name: 'DALL·E 2',      type: 'image' },
    ],
  },
  {
    id: 'anthropic',
    sdkPackage: '@ai-sdk/anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-opus-4-5',   name: 'Claude Opus 4.5',   type: 'text' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', type: 'text' },
      { id: 'claude-haiku-3-5',  name: 'Claude Haiku 3.5',  type: 'text' },
    ],
  },
  {
    id: 'google',
    sdkPackage: '@ai-sdk/google',
    name: 'Google',
    models: [
      { id: 'gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro',    type: 'text' },
      { id: 'gemini-2.0-flash',       name: 'Gemini 2.0 Flash',  type: 'text' },
      { id: 'gemini-1.5-pro',         name: 'Gemini 1.5 Pro',    type: 'text' },
      { id: 'gemini-1.5-flash',       name: 'Gemini 1.5 Flash',  type: 'text' },
      { id: 'imagen-3',               name: 'Imagen 3',          type: 'image' },
    ],
  },
  {
    id: 'xai',
    sdkPackage: '@ai-sdk/xai',
    name: 'xAI Grok',
    models: [
      { id: 'grok-2-1212',        name: 'Grok 2',            type: 'text' },
      { id: 'grok-2-vision-1212', name: 'Grok 2 Vision',     type: 'text' },
      { id: 'grok-beta',          name: 'Grok Beta',         type: 'text' },
    ],
  },
  {
    id: 'azure',
    sdkPackage: '@ai-sdk/azure',
    name: 'Azure OpenAI',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      type: 'text' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', type: 'text' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', type: 'text' },
    ],
  },
  {
    id: 'amazon-bedrock',
    sdkPackage: '@ai-sdk/amazon-bedrock',
    name: 'Amazon Bedrock',
    models: [
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet', type: 'text' },
      { id: 'anthropic.claude-3-haiku-20240307-v1:0',    name: 'Claude 3 Haiku',    type: 'text' },
      { id: 'amazon.nova-pro-v1:0',                      name: 'Amazon Nova Pro',   type: 'text' },
      { id: 'amazon.nova-lite-v1:0',                     name: 'Amazon Nova Lite',  type: 'text' },
      { id: 'meta.llama3-3-70b-instruct-v1:0',           name: 'Llama 3.3 70B',    type: 'text' },
    ],
  },
  {
    id: 'google-vertex',
    sdkPackage: '@ai-sdk/google-vertex',
    name: 'Google Vertex',
    models: [
      { id: 'gemini-2.0-flash',   name: 'Gemini 2.0 Flash', type: 'text' },
      { id: 'gemini-1.5-pro',     name: 'Gemini 1.5 Pro',   type: 'text' },
      { id: 'gemini-1.5-flash',   name: 'Gemini 1.5 Flash', type: 'text' },
    ],
  },
  {
    id: 'mistral',
    sdkPackage: '@ai-sdk/mistral',
    name: 'Mistral',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large',  type: 'text' },
      { id: 'mistral-small-latest', name: 'Mistral Small',  type: 'text' },
      { id: 'codestral-latest',     name: 'Codestral',      type: 'text' },
    ],
  },
  {
    id: 'groq',
    sdkPackage: '@ai-sdk/groq',
    name: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',   type: 'text' },
      { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',    type: 'text' },
      { id: 'gemma2-9b-it',            name: 'Gemma 2 9B',      type: 'text' },
      { id: 'qwen-qwq-32b',            name: 'Qwen QwQ 32B',    type: 'text' },
    ],
  },
  {
    id: 'deepseek',
    sdkPackage: '@ai-sdk/deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat',     name: 'DeepSeek V3',       type: 'text' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1',       type: 'text' },
    ],
  },
  {
    id: 'togetherai',
    sdkPackage: '@ai-sdk/togetherai',
    name: 'Together.ai',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', type: 'text' },
      { id: 'deepseek-ai/DeepSeek-R1',                 name: 'DeepSeek R1',          type: 'text' },
      { id: 'Qwen/QwQ-32B-Preview',                    name: 'Qwen QwQ 32B',         type: 'text' },
      { id: 'black-forest-labs/FLUX.1.1-pro',          name: 'FLUX 1.1 Pro',         type: 'image' },
    ],
  },
  {
    id: 'cohere',
    sdkPackage: '@ai-sdk/cohere',
    name: 'Cohere',
    models: [
      { id: 'command-r-plus', name: 'Command R+',  type: 'text' },
      { id: 'command-r',      name: 'Command R',   type: 'text' },
      { id: 'command',        name: 'Command',     type: 'text' },
    ],
  },
  {
    id: 'perplexity',
    sdkPackage: '@ai-sdk/perplexity',
    name: 'Perplexity',
    models: [
      { id: 'sonar-pro',   name: 'Sonar Pro',  type: 'text' },
      { id: 'sonar',       name: 'Sonar',      type: 'text' },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', type: 'text' },
    ],
  },
  {
    id: 'cerebras',
    sdkPackage: '@ai-sdk/cerebras',
    name: 'Cerebras',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', type: 'text' },
      { id: 'llama-3.1-8b',  name: 'Llama 3.1 8B',  type: 'text' },
    ],
  },
  {
    id: 'fireworks',
    sdkPackage: '@ai-sdk/fireworks',
    name: 'Fireworks',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B',  type: 'text' },
      { id: 'accounts/fireworks/models/deepseek-r1',             name: 'DeepSeek R1',     type: 'text' },
      { id: 'accounts/fireworks/models/flux-1-1-pro',            name: 'FLUX 1.1 Pro',    type: 'image' },
    ],
  },
  {
    id: 'deepinfra',
    sdkPackage: '@ai-sdk/deepinfra',
    name: 'DeepInfra',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B',    type: 'text' },
      { id: 'deepseek-ai/DeepSeek-R1',           name: 'DeepSeek R1',       type: 'text' },
      { id: 'Qwen/QwQ-32B',                      name: 'Qwen QwQ 32B',      type: 'text' },
    ],
  },
  {
    id: 'baseten',
    sdkPackage: '@ai-sdk/baseten',
    name: 'Baseten',
    models: [
      { id: 'custom', name: 'Custom Deployment', type: 'text' },
    ],
  },
  // ── Non-SDK providers (custom REST) ────────────────────────────────────────
  {
    id: 'stability',
    name: 'Stability AI',
    models: [
      { id: 'stable-diffusion-3-5-large', name: 'SD 3.5 Large',       type: 'image' },
      { id: 'stable-diffusion-3-medium',  name: 'SD 3 Medium',        type: 'image' },
      { id: 'stable-image-ultra',         name: 'Stable Image Ultra', type: 'image' },
    ],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    models: [
      { id: 'flux-1.1-pro',       name: 'FLUX 1.1 Pro',    type: 'image' },
      { id: 'flux-dev',           name: 'FLUX Dev',         type: 'image' },
      { id: 'minimax-video-01',   name: 'MiniMax Video 01', type: 'video' },
      { id: 'wan-2.1',            name: 'Wan 2.1',          type: 'video' },
    ],
  },
  {
    id: 'runway',
    name: 'RunwayML',
    models: [
      { id: 'gen4-turbo',  name: 'Gen-4 Turbo',       type: 'video' },
      { id: 'gen3a-turbo', name: 'Gen-3 Alpha Turbo', type: 'video' },
    ],
  },
  {
    id: 'kling',
    name: 'Kling AI',
    models: [
      { id: 'kling-v2',   name: 'Kling v2',   type: 'video' },
      { id: 'kling-v1-5', name: 'Kling v1.5', type: 'video' },
      { id: 'kling-v1',   name: 'Kling v1',   type: 'video' },
    ],
  },
]
