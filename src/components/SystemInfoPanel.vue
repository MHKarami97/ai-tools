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
  const text = rounded >= 60 ? `${Math.floor(rounded / 60)} دقیقه و ${rounded % 60} ثانیه` : `${rounded} ثانیه`
  return `حدود ${text} (${factor.toFixed(2)} برابر مدت صدا، از ${performanceLog.sampleCount(tool)} اجرای قبلی)`
}

onMounted(async () => {
  report.value = await systemProbe.collect()
})
</script>

<template>
  <div v-if="report" class="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
    <h2 class="font-semibold">مشخصات سیستم و شتاب‌دهی</h2>

    <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      <dt class="text-slate-500">هستهٔ پردازنده (منطقی)</dt>
      <dd dir="ltr" class="text-start">{{ report.cores ?? 'نامشخص' }}</dd>
      <dt class="text-slate-500">حافظهٔ تقریبی</dt>
      <dd dir="ltr" class="text-start">{{ report.memoryGb ? report.memoryGb + ' GB' : 'این مرورگر گزارش نمی‌دهد' }}</dd>
      <dt class="text-slate-500">کارت گرافیک</dt>
      <dd dir="ltr" class="break-all text-start">{{ gpuName }}</dd>
      <dt class="text-slate-500">WebGPU</dt>
      <dd :class="report.gpu.usable ? 'text-emerald-600' : 'text-amber-600'">
        {{ report.gpu.usable ? 'فعال و قابل استفاده' : 'در دسترس نیست' }}
      </dd>
      <dt class="text-slate-500">چندنخی WASM</dt>
      <dd>{{ report.crossOriginIsolated ? 'فعال' : 'غیرفعال (cross-origin isolation ندارد)' }}</dd>
    </dl>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-start text-slate-500">
            <th class="py-1 text-start font-normal">ابزار</th>
            <th class="py-1 text-start font-normal">موتور اجرا</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr>
            <td class="py-1.5">جداسازی صدا</td>
            <td>{{ splitterEngine }}</td>
          </tr>
          <tr>
            <td class="py-1.5">تبدیل متن به گفتار</td>
            <td>CPU (WASM)</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-500">
      جداسازی صدا ابتدا WebGPU را امتحان می‌کند و در صورت نبودن به CPU برمی‌گردد. مدل گفتار فعلاً همیشه روی CPU اجرا
      می‌شود.
    </p>

    <div class="space-y-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
      <label class="flex flex-wrap items-center gap-2">
        مدت آهنگ (دقیقه)
        <input
          v-model.number="minutes"
          type="number"
          min="1"
          max="60"
          class="w-20 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
        />
      </label>
      <p>جداسازی: {{ estimateText('splitter') }}</p>
      <p class="text-xs text-slate-500">
        این تخمین فقط از اجراهای قبلی خودِ شما روی همین دستگاه ساخته می‌شود. اولین اجرا به‌خاطر دانلود مدل کندتر است.
      </p>
    </div>

    <details v-if="!report.gpu.usable" class="rounded-lg border border-amber-400 p-3 text-sm">
      <summary class="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
        GPU استفاده نمی‌شود: {{ report.gpu.problem ? PROBLEM_TEXT[report.gpu.problem] : '' }}
      </summary>
      <ol class="mt-3 list-decimal space-y-2 ps-5">
        <li>مرورگر را به‌روز کنید: Chrome نسخهٔ ۱۱۳ یا بالاتر (اندروید: ۱۲۱ به بالا با اندروید ۱۲+).</li>
        <li>
          در Chrome به
          <span dir="ltr" class="font-mono">chrome://settings/system</span>
          بروید و «Use graphics acceleration when available» را روشن کنید، سپس مرورگر را کامل ببندید و دوباره باز کنید.
        </li>
        <li>
          صفحهٔ <span dir="ltr" class="font-mono">chrome://gpu</span> را باز کنید و بخش WebGPU را ببینید. اگر نوشته
          «disabled via blocklist»، پرچم
          <span dir="ltr" class="font-mono">chrome://flags/#enable-unsafe-webgpu</span>
          را فعال و مرورگر را راه‌اندازی مجدد کنید.
        </li>
        <li>
          اگر هنوز نشد، پرچم
          <span dir="ltr" class="font-mono">chrome://flags/#ignore-gpu-blocklist</span>
          را فعال کنید. در لینوکس پرچم
          <span dir="ltr" class="font-mono">chrome://flags/#enable-vulkan</span>
          هم لازم است.
        </li>
        <li>درایور کارت گرافیک را به‌روز کنید.</li>
        <li>
          Firefox: در <span dir="ltr" class="font-mono">about:config</span> مقدار
          <span dir="ltr" class="font-mono">dom.webgpu.enabled</span> را true کنید. Safari: به macOS Tahoe یا جدیدتر
          نیاز دارد.
        </li>
        <li>در لپ‌تاپ با دو کارت گرافیک، از تنظیمات سیستم‌عامل مرورگر را روی کارت قوی‌تر بگذارید.</li>
      </ol>
    </details>
  </div>
</template>
