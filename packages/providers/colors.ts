export const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#c96442',
  google: '#4285f4',
  xai: '#2d2d2d',
  azure: '#0078d4',
  mistral: '#ff6f00',
  groq: '#e84040',
  deepseek: '#4d6bfe',
  togetherai: '#7c3aed',
  perplexity: '#20808d',
  volcengine: '#1664ff',
  qwen: '#6200ea',
  zhipu: '#3b82f6',
}

export function providerColor(id: string): string {
  return PROVIDER_COLORS[id] ?? '#6b7280'
}
