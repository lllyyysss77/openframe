import {
  siAnthropic,
  siGooglegemini,
  siGooglecloud,
  siMistralai,
  siPerplexity,
  siReplicate,
} from 'simple-icons'

export interface ProviderLogo {
  /** SVG path data (24×24 viewBox) */
  path: string
  /** Brand hex color without the '#' */
  hex: string
}

const LOGOS: Record<string, ProviderLogo> = {
  anthropic:       { path: siAnthropic.path,   hex: siAnthropic.hex   },
  google:          { path: siGooglegemini.path, hex: siGooglegemini.hex },
  'google-vertex': { path: siGooglecloud.path,  hex: siGooglecloud.hex  },
  mistral:         { path: siMistralai.path,    hex: siMistralai.hex    },
  perplexity:      { path: siPerplexity.path,   hex: siPerplexity.hex   },
  replicate:       { path: siReplicate.path,    hex: siReplicate.hex    },
}

/** Returns the simple-icons logo data for a provider, or null if unavailable. */
export function getProviderLogo(id: string): ProviderLogo | null {
  return LOGOS[id] ?? null
}
