<script setup lang="ts">
import { pwaUpdater } from '@/lib/registerServiceWorker'

const needRefresh = pwaUpdater.needRefresh
</script>

<template>
  <div
    v-if="needRefresh"
    role="alert"
    class="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-600 bg-white p-4 text-sm shadow-lg dark:bg-slate-900"
  >
    <span>نسخه جدید سایت آماده است. برای استفاده از آن، صفحه را بروزرسانی کنید.</span>
    <span class="flex gap-2">
      <button type="button" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-white" @click="pwaUpdater.apply()">
        بروزرسانی
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700"
        @click="pwaUpdater.dismiss()"
      >
        بعدا
      </button>
    </span>
  </div>
</template>