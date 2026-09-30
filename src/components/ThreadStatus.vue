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
  <div class="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
    <h2 class="font-semibold">وضعیت چندنخی WASM</h2>
    <p :class="report?.crossOriginIsolated && report?.sharedArrayBuffer ? 'text-emerald-600' : 'text-amber-600'">
      {{ statusText }}
    </p>
    <dl v-if="report" class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt class="text-slate-500">crossOriginIsolated</dt>
      <dd dir="ltr" class="text-start">{{ report.crossOriginIsolated }}</dd>
      <dt class="text-slate-500">SharedArrayBuffer</dt>
      <dd dir="ltr" class="text-start">{{ report.sharedArrayBuffer }}</dd>
      <dt class="text-slate-500">hardwareConcurrency</dt>
      <dd dir="ltr" class="text-start">{{ report.hardwareConcurrency ?? 'نامشخص' }}</dd>
      <dt class="text-slate-500">SIMD</dt>
      <dd dir="ltr" class="text-start">{{ report.simd }}</dd>
    </dl>
  </div>
</template>
