import { createRouter, createWebHistory } from 'vue-router'
import { features } from '@/config/features'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: features.map((feature) => ({
    path: feature.path,
    name: feature.name,
    component: feature.load as () => Promise<never>,
  })),
})
