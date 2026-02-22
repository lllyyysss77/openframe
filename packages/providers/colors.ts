export const PROVIDER_COLORS: Record<string, string> = {
  openai:           '#10a37f',
  anthropic:        '#c96442',
  google:           '#4285f4',
  xai:              '#2d2d2d',
  azure:            '#0078d4',
  'amazon-bedrock': '#ff9900',
  'google-vertex':  '#34a853',
  mistral:          '#ff6f00',
  groq:             '#e84040',
  deepseek:         '#4d6bfe',
  togetherai:       '#7c3aed',
  cohere:           '#39c6c0',
  perplexity:       '#20808d',
  cerebras:         '#ff4a00',
  fireworks:        '#7b2aff',
  deepinfra:        '#3b4eba',
  baseten:          '#1a56db',
  stability:        '#7c3aed',
  replicate:        '#555',
  runway:           '#333',
  kling:            '#ff4500',
}

export function providerColor(id: string): string {
  return PROVIDER_COLORS[id] ?? '#6b7280'
}
