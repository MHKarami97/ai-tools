export interface Feature {
  readonly path: string
  readonly name: string
  readonly label: string
  readonly description: string
  readonly showInNav: boolean
  readonly showInHome: boolean
  readonly load: () => Promise<unknown>
}

export const features: readonly Feature[] = [
  {
    path: '/',
    name: 'home',
    label: 'خانه',
    description: 'نمای کلی و دسترسی سریع',
    showInNav: false,
    showInHome: false,
    load: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/tts',
    name: 'tts',
    label: 'تبدیل متن به گفتار',
    description: 'سنتز گفتار فارسی با کلون صدا، کاملا در مرورگر',
    showInNav: false,
    showInHome: true,
    load: () => import('@/pages/TtsPage.vue'),
  },
  {
    path: '/splitter',
    name: 'splitter',
    label: 'جداسازی صدا',
    description: 'جداسازی وکال و ابزارها از فایل صوتی',
    showInNav: false,
    showInHome: true,
    load: () => import('@/pages/SplitterPage.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    label: 'تنظیمات',
    description: 'مدیریت مدل‌ها و کش',
    showInNav: false,
    showInHome: false,
    load: () => import('@/pages/SettingsPage.vue'),
  },
  {
    path: '/about',
    name: 'about',
    label: 'درباره',
    description: 'درباره ما',
    showInNav: false,
    showInHome: false,
    load: () => import('@/pages/AboutPage.vue'),
  },
  {
    path: '/offline',
    name: 'offline',
    label: 'آفلاین',
    description: 'راهنمای استفاده بدون اینترنت',
    showInNav: false,
    showInHome: false,
    load: () => import('@/pages/OfflinePage.vue'),
  },
]
