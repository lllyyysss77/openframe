export const PROVIDER_BASE_URLS = {
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  volcengineImage: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  ollama: 'http://localhost:11434',
} as const

export const PROVIDER_DEFAULT_MEDIA_OPTIONS = {
  volcengine: {
    imageSize: '2k',
  },
  qwen: {
    imageSize: '1664*928',
  },
} as const

export const PROVIDER_IMAGE_RATIO_SIZE_MAP = {
  volcengine: {
    '16:9': '2848x1600',
    '9:16': '1600x2848',
  },
  qwen: {
    '16:9': '1664*928',
    '9:16': '928*1664',
  },
} as const
