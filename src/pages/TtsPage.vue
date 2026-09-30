<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import HistoryList from '@/components/HistoryList.vue'
import { encodeMp3 } from '@/lib/audio/mp3Client'
import { decodeToMono } from '@/lib/audio/resample'
import { encodeWav } from '@/lib/audio/wav'
import { formatBytes } from '@/lib/format'
import { historyStore } from '@/lib/history/historyStore'
import { requestPersistentStorage } from '@/lib/storageEstimate'
import { TtsClient } from '@/lib/tts/client'
import { MAX_PACE, MAX_TEXT_CHARS, MIN_PACE } from '@/lib/tts/limits'
import {
  allModelsCached,
  clearTtsModels,
  downloadModel,
  type DownloadProgress,
} from '@/lib/tts/modelDownloader'
import type { SynthesisMode } from '@/workers/protocol'
import { performanceLog } from '@/lib/system/performanceLog'

const SAMPLE_RATE = 24000
const VOICE_ID = 'custom'
const VOICE_NAME_KEY = 'tts-voice-name'
const MP3_KBPS = 96
const SOURCE_PREVIEW_CHARS = 60

const client = new TtsClient()
let engineReady = false
let voiceRegistered = false
let abortController: AbortController | null = null

const text = ref('سلام دنیا')
const mode = ref<SynthesisMode>('split')
const pace = ref(1)
const modelsReady = ref<boolean | null>(null)
const downloading = ref(false)
const download = ref<DownloadProgress | null>(null)
const hasVoice = ref(false)
const voiceName = ref('')
const busy = ref(false)
const sentenceProgress = ref<{ done: number; total: number } | null>(null)
const wavUrl = ref<string | null>(null)
const mp3Url = ref<string | null>(null)
const wavSize = ref(0)
const mp3Size = ref(0)
const outputName = ref('')
const errorMessage = ref('')

const canSynthesize = computed(
  () => modelsReady.value === true && hasVoice.value && text.value.trim().length > 0 && !busy.value,
)
const downloadPercent = computed(() => Math.round((download.value?.fraction ?? 0) * 100))
const playerUrl = computed(() => mp3Url.value ?? wavUrl.value)
const wavName = computed(() => outputName.value.replace(/\.mp3$/, '.wav'))

function revokeOutputs(): void {
  if (wavUrl.value) URL.revokeObjectURL(wavUrl.value)
  if (mp3Url.value) URL.revokeObjectURL(mp3Url.value)
  wavUrl.value = null
  mp3Url.value = null
}

async function tryEncodeMp3(samples: Float32Array): Promise<Blob | null> {
  try {
    return await encodeMp3([samples], SAMPLE_RATE, MP3_KBPS)
  } catch {
    return null
  }
}

function timestampName(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

async function guarded(action: () => Promise<void>): Promise<void> {
  errorMessage.value = ''
  busy.value = true
  try {
    await action()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function ensureEngine(): Promise<void> {
  if (!engineReady) {
    await client.init()
    engineReady = true
  }
  if (!voiceRegistered && hasVoice.value) {
    await client.restoreVoice(VOICE_ID)
    voiceRegistered = true
  }
}

async function startDownload(): Promise<void> {
  errorMessage.value = ''
  downloading.value = true
  abortController = new AbortController()
  try {
    await requestPersistentStorage()
    await downloadModel((state) => {
      download.value = state
    }, abortController.signal)
    modelsReady.value = await allModelsCached()
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    if (!aborted) errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    downloading.value = false
    abortController = null
  }
}

function cancelDownload(): void {
  abortController?.abort()
}

async function removeModels(): Promise<void> {
  if (!window.confirm('مدل‌های دانلودشده حذف شوند؟')) return
  client.terminate()
  engineReady = false
  voiceRegistered = false
  await clearTtsModels()
  modelsReady.value = false
  download.value = null
}

function onVoiceChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  void guarded(async () => {
    const samples = await decodeToMono(file, SAMPLE_RATE)
    await ensureEngine()
    await client.registerVoice(VOICE_ID, samples)
    voiceRegistered = true
    hasVoice.value = true
    voiceName.value = file.name
    localStorage.setItem(VOICE_NAME_KEY, file.name)
  })
}

function synthesize(): void {
  void guarded(async () => {
    await ensureEngine()
    const startedAt = performance.now()
    sentenceProgress.value = null
    const result = await client.synthesizeText(text.value.trim(), VOICE_ID, mode.value, pace.value, (done, total) => {
      sentenceProgress.value = { done, total }
    })
    performanceLog.record('tts', result.audio.length / SAMPLE_RATE, performance.now() - startedAt)

    const wav = encodeWav([result.audio], SAMPLE_RATE)
    const mp3 = await tryEncodeMp3(result.audio)

    revokeOutputs()
    wavUrl.value = URL.createObjectURL(wav)
    wavSize.value = wav.size
    mp3Url.value = mp3 ? URL.createObjectURL(mp3) : null
    mp3Size.value = mp3?.size ?? 0
    outputName.value = `tts-${timestampName()}.${mp3 ? 'mp3' : 'wav'}`

    await historyStore.add({
      kind: 'tts',
      sourceName: text.value.trim().slice(0, SOURCE_PREVIEW_CHARS),
      outputs: [outputName.value],
    })
  })
}

onMounted(async () => {
  modelsReady.value = await allModelsCached()
  hasVoice.value = await client.hasSavedVoice(VOICE_ID)
  voiceName.value = localStorage.getItem(VOICE_NAME_KEY) ?? ''
})

onBeforeUnmount(() => {
  abortController?.abort()
  client.terminate()
  revokeOutputs()
})
</script>

<template>
  <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
    <header>
      <h1 class="text-2xl font-bold">تبدیل متن به گفتار فارسی</h1>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        همهٔ پردازش‌ها داخل مرورگر و آفلاین انجام می‌شود. مدل فقط بار اول دانلود می‌شود.
      </p>
    </header>

    <div class="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 class="font-semibold">۱. مدل</h2>
      <p v-if="modelsReady === null" class="text-sm text-slate-500">در حال بررسی کش...</p>

      <div v-else-if="modelsReady" class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-emerald-700 dark:text-emerald-400">مدل دانلود و ذخیره شده است.</p>
        <button type="button" class="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-600" @click="removeModels">
          حذف مدل
        </button>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          مدل حدود ۵۰۰ مگابایت است. اتصال Wi-Fi و فضای خالی کافی لازم است.
        </p>
        <div v-if="downloading && download" class="space-y-1">
          <div class="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
            <div class="h-full bg-emerald-600 transition-all" :style="{ width: downloadPercent + '%' }" />
          </div>
          <p class="text-xs text-slate-500" dir="ltr">
            {{ downloadPercent }}% · {{ download.filesDone + 1 }}/{{ download.fileCount }} · {{ download.fileName }} ·
            {{ formatBytes(download.downloadedBytes) }} · {{ formatBytes(download.bytesPerSecond) }}/s
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="!downloading"
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
            @click="startDownload"
          >
            دانلود مدل
          </button>
          <button v-else type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" @click="cancelDownload">
            لغو
          </button>
        </div>
      </div>
    </div>

    <div class="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 class="font-semibold">۲. صدای مرجع</h2>
      <p class="text-sm text-slate-600 dark:text-slate-400">
        یک فایل صوتی کوتاه (حدود ۵ ثانیه، بدون موسیقی) انتخاب کنید. مدل صدای شما را تقلید می‌کند.
      </p>
      <input
        type="file"
        accept="audio/*"
        :disabled="modelsReady !== true || busy"
        class="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-white disabled:opacity-50"
        @change="onVoiceChange"
      />
      <p v-if="hasVoice" class="text-sm text-emerald-700 dark:text-emerald-400">
        صدای ذخیره‌شده: <span dir="ltr">{{ voiceName || VOICE_ID }}</span>
      </p>
    </div>

    <div class="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 class="font-semibold">۳. متن</h2>
      <textarea
        v-model="text"
        dir="auto"
        rows="5"
        :maxlength="MAX_TEXT_CHARS"
        aria-label="متن"
        class="w-full rounded-lg border border-slate-300 bg-transparent p-3 dark:border-slate-700"
      />
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block text-sm">
          حالت
          <select v-model="mode" class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700">
            <option value="split">جداسازی عبارت‌ها</option>
            <option value="pack">بسته‌بندی فشرده</option>
          </select>
        </label>
        <label class="block text-sm">
          سرعت: {{ pace.toFixed(2) }}
          <input v-model.number="pace" type="range" :min="MIN_PACE" :max="MAX_PACE" step="0.05" class="mt-2 w-full" />
        </label>
      </div>

      <button
        type="button"
        class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50 sm:w-auto"
        :disabled="!canSynthesize"
        @click="synthesize"
      >
        {{ busy ? 'در حال پردازش...' : 'ساخت گفتار' }}
      </button>
      <p v-if="busy && sentenceProgress" class="text-sm text-slate-500">
        جمله {{ sentenceProgress.done }} از {{ sentenceProgress.total }}
      </p>
    </div>

    <p v-if="errorMessage" role="alert" class="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
      {{ errorMessage }}
    </p>

    <div v-if="playerUrl" class="space-y-2">
      <audio :src="playerUrl" controls class="w-full" />
      <div class="flex flex-wrap gap-2 text-sm">
        <a v-if="mp3Url" :href="mp3Url" :download="outputName" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-white">
          دانلود MP3 ({{ formatBytes(mp3Size) }})
        </a>
        <a v-if="wavUrl" :href="wavUrl" :download="wavName" class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">
          دانلود WAV ({{ formatBytes(wavSize) }})
        </a>
      </div>
    </div>
  </section>

  <HistoryList kind="tts" title="تاریخچهٔ تبدیل متن به گفتار" source-label="متن" />
</template>
