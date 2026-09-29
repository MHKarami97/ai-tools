<script setup lang="ts">
import { features } from '@/config/features'
import { pwaInstaller } from '@/lib/pwaInstaller'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const navItems = features.filter((feature) => feature.showInNav)
const canInstall = pwaInstaller.canInstall
</script>

<template>
  <header
    class="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80"
  >
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
      <RouterLink to="/" class="shrink-0 text-lg font-bold">AI Tools</RouterLink>
      <nav class="flex flex-1 gap-1 overflow-x-auto" aria-label="ناوبری اصلی">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.path"
          class="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          active-class="!bg-emerald-600 !text-white"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <button
        v-if="canInstall"
        type="button"
        class="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
        @click="pwaInstaller.install()"
      >
        <span aria-hidden="true">⬇</span>
        <span class="hidden sm:inline"> نصب برنامه</span>
        <span class="sr-only sm:hidden">نصب برنامه</span>
      </button>
      <button
        type="button"
        class="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        :aria-label="themeStore.theme === 'dark' ? 'تم روشن' : 'تم تاریک'"
        @click="themeStore.toggle()"
      >
        {{ themeStore.theme === 'dark' ? '☀️' : '🌙' }}
      </button>
    </div>
  </header>
</template>
