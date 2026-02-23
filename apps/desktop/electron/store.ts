import Store from 'electron-store'
import { DEFAULT_AI_CONFIG, type AIConfig } from '@openframe/providers'

const modelKeySchema = { type: 'string', default: '' } as const

const providerConfigSchema = {
  type: 'object',
  properties: {
    apiKey:  { type: 'string', default: '' },
    baseUrl: { type: 'string', default: '' },
    enabled: { type: 'boolean', default: false },
  },
  default: { apiKey: '', baseUrl: '', enabled: false },
} as const

const modelDefSchema = {
  type: 'object',
  properties: {
    id:   { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['text', 'image', 'video'] },
  },
  required: ['id', 'name', 'type'],
} as const

export interface AppSettings {
  language: string
  theme: string
  ai_config: AIConfig
}

export const store = new Store<AppSettings>({
  name: 'settings',
  schema: {
    language: {
      type: 'string',
      enum: ['en', 'zh'],
      default: 'en',
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    ai_config: {
      type: 'object',
      properties: {
        providers: {
          type: 'object',
          additionalProperties: providerConfigSchema,
          default: {},
        },
        models: {
          type: 'object',
          properties: {
            text:  modelKeySchema,
            image: modelKeySchema,
            video: modelKeySchema,
          },
          default: { text: '', image: '', video: '' },
        },
        customModels: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: modelDefSchema,
            default: [],
          },
          default: {},
        },
        disabledModels: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
          default: {},
        },
      },
      default: DEFAULT_AI_CONFIG,
    },
  },
  defaults: {
    language: 'en',
    theme: 'system',
    ai_config: DEFAULT_AI_CONFIG,
  },
})
