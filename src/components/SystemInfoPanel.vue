<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { performanceLog, type ToolId } from '@/lib/system/performanceLog'
import { systemProbe, type GpuProblem, type SystemReport } from '@/lib/system/systemInfo'

const report = ref<SystemReport | null>(null)
const minutes = ref(4)

const PROBLEM_TEXT: Record<GpuProblem, string> = {
  'insecure-context': 'صفحه روی HTTPS یا localhost باز نشده است.',
  'api-missing': 'این مرورگر WebGPU ندارد یا غیرفعال است.',
  'no-adapter': 'مرورگر هیچ کارت گرافیکی برای WebGPU پیدا نکرد.',
  'software-adapter': 'مرورگر فقط یک GPU نرم‌افزاری (شبیه‌سازی‌شده روی CPU) می‌بیند.',
  error: 'دسترسی به WebGPU با خطا روبه‌رو شد.',
}

const gpuName = computed(() => {
  const gpu = report.value?.gpu
  const parts = [gpu?.vendor, gpu?.architecture, gpu?.description].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : (report.value?.webglRenderer ?? 'نامشخص')
})

const splitterEngine = computed(() => (report.value?.gpu.usable ? 'GPU (WebGPU)' : 'CPU (WASM)'))

function estimateText(tool: ToolId): string {
  const seconds = performanceLog.estimateSeconds(tool, minutes.value * 60)
  if (seconds === null) return 'هنوز اجرایی ثبت نشده است.'
  const factor = performanceLog.speedFactor(tool) ?? 0
  const rounded = Math.max(1, Math.round(seconds))
  const text = rounded >= 60 
    ? `${Math.floor(rounded / 60)} دقیقه و ${rounded % 60} ثانیه` 
    : `${rounded} ثانیه`
  return `حدود ${text} (${factor.toFixed(2)}× از ${performanceLog.sampleCount(tool)} اجرا)`
}

onMounted(async () => {
  report.value = await systemProbe.collect()
})
</script>

<template>
  <div v-if="report" class="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
      مشخصات سیستم و شتاب‌دهی
    </h2>

    <dl class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2.5">
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">هستهٔ پردازنده (منطقی)</dt>
        <dd dir="ltr" class="font-medium">{{ report.cores ?? 'نامشخص' }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">حافظهٔ تقریبی</dt>
        <dd dir="ltr" class="font-medium">
          {{ report.memoryGb ? report.memoryGb + ' GB' : 'گزارش نمی‌شود' }}
        </dd>
      </div>
      <div class="col-span-1 flex flex-col gap-1 border-b border-slate-100 pb-1.5 dark:border-slate-800 sm:col-span-2">
        <dt class="text-slate-500 dark:text-slate-400">کارت گرافیک</dt>
        <dd dir="ltr" class="break-all text-sm font-medium">{{ gpuName }}</dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">WebGPU</dt>
        <dd :class="report.gpu.usable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
          {{ report.gpu.usable ? 'فعال' : 'در دسترس نیست' }}
        </dd>
      </div>
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <dt class="text-slate-500 dark:text-slate-400">چندنخی WASM</dt>
        <dd>{{ report.crossOriginIsolated ? 'فعال' : 'غیرفعال' }}</dd>
      </div>
    </dl>

    <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-800/50">
          <tr class="text-slate-500 dark:text-slate-400">
            <th class="px-3 py-2.5 text-start font-medium">ابزار</th>
            <th class="px-3 py-2.5 text-start font-medium">موتور اجرا</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td class="px-3 py-3">جداسازی صدا</td>
            <td class="px-3 py-3 font-medium">{{ splitterEngine }}</td>
          </tr>
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td class="px-3 py-3">تبدیل متن به گفتار</td>
            <td class="px-3 py-3 font-medium">CPU (WASM)</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <p class="text-xs text-slate-500 dark:text-slate-400">
      جداسازی صدا ابتدا WebGPU را امتحان می‌کند و در صورت نبودن به CPU برمی‌گردد. مدل گفتار فعلاً همیشه روی CPU اجرا می‌شود.
    </p>

    <div class="space-y-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
      <label class="flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">مدت آهنگ (دقیقه)</span>
        <input
          v-model.number="minutes"
          type="number"
          min="1"
          max="60"
          class="w-24 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <div class="space-y-1.5">
        <p class="text-sm">
          <span class="font-medium">جداسازی:</span> 
          <span class="text-slate-600 dark:text-slate-300">{{ estimateText('splitter') }}</span>
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          این تخمین فقط از اجراهای قبلی خودِ شما روی همین دستگاه ساخته می‌شود. اولین اجرا به‌خاطر دانلود مدل کندتر است.
        </p>
      </div>
    </div>

    <details v-if="!report.gpu.usable" class="group rounded-lg border border-amber-400 bg-amber-50 p-4 transition-all dark:border-amber-500/50 dark:bg-amber-950/20">
      <summary class="cursor-pointer select-none text-sm font-medium text-amber-800 transition group-open:mb-3 dark:text-amber-300">
        <span class="flex items-center gap-2">
          <svg class="h-4 w-4 transition group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          GPU استفاده نمی‌شود: {{ report.gpu.problem ? PROBLEM_TEXT[report.gpu.problem] : '' }}
        </span>
      </summary>
      <ol class="space-y-2.5 text-sm text-amber-900 dark:text-amber-200">
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">1</span>
          <span>مرورگر را به‌روز کنید: Chrome ۱۱۳+ (اندروید: ۱۲۱+ با اندروید ۱۲+).</span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">2</span>
          <span>
            در Chrome به 
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">chrome://settings/system</code>
            بروید و «Use graphics acceleration» را روشن کنید.
          </span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">3</span>
          <span>
            صفحهٔ 
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">chrome://gpu</code>
            را بررسی کنید. اگر «disabled via blocklist» بود، پرچم
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">chrome://flags/#enable-unsafe-webgpu</code>
            را فعال کنید.
          </span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">4</span>
          <span>
            پرچم 
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">chrome://flags/#ignore-gpu-blocklist</code>
            را فعال کنید. در لینوکس پرچم
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">chrome://flags/#enable-vulkan</code>
            هم لازم است.
          </span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">5</span>
          <span>درایور کارت گرافیک را به‌روز کنید.</span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">6</span>
          <span>
            Firefox: در 
            <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">about:config</code>
            مقدار <code class="font-mono text-xs">dom.webgpu.enabled</code> را true کنید.
          </span>
        </li>
        <li class="flex gap-2">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">7</span>
          <span>در لپ‌تاپ دو کارت گرافیک، مرورگر را روی کارت قوی‌تر بگذارید.</span>
        </li>
      </ol>
    </details>
  </div>
</template>