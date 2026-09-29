<script setup lang="ts">
import { features } from '@/config/features'

const quickActions = features.filter((feature) => feature.showInNav && feature.name !== 'home')
</script>

<template>
  <section>
    <h1 class="mb-2 text-2xl font-bold">ابزارهای هوش مصنوعی آفلاین</h1>
    <p class="mb-6 text-slate-600 dark:text-slate-400">
      مدل‌ها فقط با درخواست شما دانلود می‌شوند و همهٔ پردازش‌ها در مرورگر خودتان انجام می‌شود.
    </p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="action in quickActions"
        :key="action.name"
        :to="action.path"
        class="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 class="mb-1 font-semibold">{{ action.label }}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-400">{{ action.description }}</p>
      </RouterLink>
    </div>
  </section>
</template>
