<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { checkThreads, type ThreadReport } from '@/lib/system/threadChecker'

const report = ref<ThreadReport | null>(null)

const statusText = computed(() => {
  const r = report.value
  if (!r) return 'در حال بررسی...'
  if (!r.crossOriginIsolated || !r.sharedArrayBuffer) {
    return 'چندنخی غیرفعال است. صفحه روی HTTPS یا localhost نیست یا هدرهای COOP/COEP تنظیم نشده‌اند.'
  }
  return `چندنخی فعال است: ${r.numThreads} نخ (از ${r.hardwareConcurrency ?? 'نامشخص'} هستهٔ منطقی)`
})

onMounted(() => {
  report.value = checkThreads()
})
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h2 class="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
      وضعیت چندنخی WASM
    </h2>
    <p :class="[
      'mb-4 text-sm font-medium sm:text-base',
      report?.crossOriginIsolated && report?.sharedArrayBuffer 
        ? 'text-emerald-600 dark:text-emerald-400' 
        : 'text-amber-600 dark:text-amber-400'
    ]">
      {{ statusText }}
    </p>
    
    <dl v-if="report" class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2">
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">crossOriginIsolated</dt>
        <dd dir="ltr" class="font-mono font-medium">{{ report.crossOriginIsolated }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">SharedArrayBuffer</dt>
        <dd dir="ltr" class="font-mono font-medium">{{ report.sharedArrayBuffer }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">hardwareConcurrency</dt>
        <dd dir="ltr" class="font-mono font-medium">{{ report.hardwareConcurrency ?? 'نامشخص' }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">SIMD</dt>
        <dd dir="ltr" class="font-mono font-medium">{{ report.simd }}</dd>
      </div>
    </dl>
  </div>
</template>