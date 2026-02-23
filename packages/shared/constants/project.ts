export interface ProjectCategory {
  id: string
  name: string
  locales: Record<'en' | 'cn', string>
}

export const PROJECT_CATEGORIES: ProjectCategory[] = [{
  id: 'fantasy',
  name: 'Fantasy',
  locales: { en: 'Fantasy', cn: '玄幻' },
}, {
  id: 'wuxia',
  name: 'Wuxia',
  locales: { en: 'Wuxia', cn: '武侠' },
}, {
  id: 'xianxia',
  name: 'Xianxia',
  locales: { en: 'Xianxia', cn: '仙侠' },
}, {
  id: 'suspense',
  name: 'Suspense',
  locales: { en: 'Suspense', cn: '悬疑' },
}, {
  id: 'comedy',
  name: 'Comedy',
  locales: { en: 'Comedy', cn: '喜剧' },
}, {
  id: 'action',
  name: 'Action',
  locales: { en: 'Action', cn: '动作' },
}, {
  id: 'period',
  name: 'Period',
  locales: { en: 'Period', cn: '古装' },
}, {
  id: 'modern',
  name: 'Modern',
  locales: { en: 'Modern', cn: '现代' },
}, {
  id: 'scifi',
  name: 'Sci-Fi',
  locales: { en: 'Sci-Fi', cn: '科幻' },
}, {
  id: 'urban',
  name: 'Urban',
  locales: { en: 'Urban', cn: '都市' },
}, {
  id: 'campus',
  name: 'Campus',
  locales: { en: 'Campus', cn: '校园' },
}, {
  id: 'history',
  name: 'History',
  locales: { en: 'History', cn: '历史' },
}, {
  id: 'sports',
  name: 'Sports',
  locales: { en: 'Sports', cn: '体育' },
}, {
  id: 'game',
  name: 'Game',
  locales: { en: 'Game', cn: '游戏' },
}, {
  id: 'military',
  name: 'Military',
  locales: { en: 'Military', cn: '军事' },
}, {
  id: 'realistic',
  name: 'Realistic',
  locales: { en: 'Realistic', cn: '现实' },
},]
