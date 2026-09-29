<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import BackendBadge from '@/components/BackendBadge.vue'
import { encodeWav } from '@/lib/audio/wav'
import { TtsClient } from '@/lib/tts/TtsClient'
import type { RuntimeInfo } from '@/workers/protocol'

type Status = 'idle' | 'loading' | 'working'

const MAX_CHARS = 200

const text = ref('سلام دنیا')
const status = ref<Status>('idle')
const runtime = ref<RuntimeInfo | null>(null)
const audioUrl = ref<string | null>(null)
const errorMessage = ref('')
const client = new TtsClient()

const canSynthesize = computed(() => text.value.trim().length > 0 && status.value === 'idle')

function setAudio(blob: Blob): void {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = URL.createObjectURL(blob)
}

async function synthesize(): Promise<void> {
  errorMessage.value = ''
  try {
    if (!runtime.value) {
      status.value = 'loading'
      runtime.value = await client.init()
    }
    status.value = 'working'
    const { samples, sampleRate } = await client.synthesize(text.value.slice(0, MAX_CHARS))
    setAudio(encodeWav([samples], sampleRate))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    status.value = 'idle'
  }
}

onBeforeUnmount(() => {
  client.terminate()
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
})
</script>

<template>
  <section class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
    <h1 class="text-2xl font-bold">تبدیل متن به گفتار فارسی</h1>
    <p class="text-sm text-slate-600 dark:text-slate-400">
      نسخهٔ آزمایشی: این مرحله فقط پایپ‌لاین ONNX در Web Worker را با یک مدل تستی اثبات می‌کند،
      هر حرف یک بوق ۰٫۱ ثانیه‌ای تولید می‌کند. مدل واقعی فارسی در کامیت بعدی اضافه می‌شود.
    </p>
    <label class="block text-sm font-medium" for="tts-text">متن</label>
    <textarea
      id="tts-text"
      v-model="text"
      dir="auto"
      rows="4"
      :maxlength="MAX_CHARS"
      class="w-full rounded-lg border border-slate-300 bg-transparent p-3 dark:border-slate-700"
    />
    <button
      type="button"
      class="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      :disabled="!canSynthesize"
      @click="synthesize"
    >
      {{ status === 'loading' ? 'در حال آماده‌سازی موتور...' : status === 'working' ? 'در حال سنتز...' : 'سنتز گفتار' }}
    </button>
    <BackendBadge v-if="runtime" :info="runtime" />
    <p v-if="errorMessage" role="alert" class="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
      {{ errorMessage }}
    </p>
    <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
  </section>
</template>
