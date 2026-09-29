<template>
  <div class="splitter-panel">
    <div class="hero">
      <div class="brand-mark">🎤</div>
      <div>
        <p class="eyebrow">Voice Splitter</p>
        <h1>جداسازی صدای خواننده از موسیقی</h1>
        <p class="subtitle">پردازش کاملاً روی دستگاه شما، بدون آپلود فایل</p>
      </div>
    </div>

    <div class="card">
      <div
        class="file-drop"
        :class="{ 'is-dragging': isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @click="triggerFileInput"
        tabindex="0"
        @keydown.enter="triggerFileInput"
      >
        <div class="upload-icon">📁</div>
        <p class="drop-title">فایل ترانه را انتخاب کنید</p>
        <p class="drop-help">MP3، WAV، M4A، OGG</p>
        <input ref="fileInput" type="file" accept="audio/*" @change="onFileChange" hidden />
      </div>
      <div v-if="fileMeta" class="file-meta">
        <strong>{{ fileMeta.name }}</strong> · {{ fileMeta.size }}
      </div>
    </div>

    <div class="card">
      <div class="status-row">
        <strong>وضعیت</strong>
      </div>
      <div class="progress-track">
        <div class="progress-bar" :style="{ width: progressPercent + '%' }" />
      </div>
      <p class="status-detail">{{ statusDetail }}</p>
      <button class="primary-button" :disabled="!selectedFile || isProcessing" @click="startSeparation">
        شروع جداسازی
      </button>
      <button v-if="isProcessing" class="secondary-button" @click="cancelSeparation">لغو پردازش</button>
    </div>

    <div v-if="result" class="card results-card">
      <div class="section-heading">
        <strong>خروجی آماده است</strong>
        <span class="quality-pill">WAV</span>
      </div>
      <div class="result-list">
        <div class="result-row">
          <div>
            <strong>صدای خواننده</strong>
            <span>Vocal stem</span>
          </div>
          <button class="download-button" @click="downloadResult('vocals')">دانلود</button>
        </div>
        <div class="result-row">
          <div>
            <strong>موسیقی بی‌کلام</strong>
            <span>Instrumental stem</span>
          </div>
          <button class="download-button" @click="downloadResult('instrumental')">دانلود</button>
        </div>
      </div>
    </div>

    <p class="footer-note">مدل در اولین اجرا دانلود می‌شود و در مرورگر کش می‌ماند.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { SplitterClient, encodeWav, downloadBlob, baseName } from '@/lib/splitter/client'
import type { SplitterProgressState, SplitterResult } from '@/lib/splitter/client'

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const fileMeta = ref<{ name: string; size: string } | null>(null)
const isProcessing = ref(false)
const statusText = ref('آماده')
const statusDetail = ref('فایل انتخاب شد. برای شروع روی دکمهٔ زیر بزنید.')
const progressPercent = ref(0)
const result = ref<SplitterResult | null>(null)

let client: SplitterClient | null = null

const MODEL_SIZE_MB = 172

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'حجم نامشخص'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

function triggerFileInput() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) selectFile(file)
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) selectFile(file)
}

function selectFile(file: File) {
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
    statusText.value = 'فایل نامعتبر'
    statusDetail.value = 'لطفاً یک فایل صوتی قابل‌پخش انتخاب کنید.'
    progressPercent.value = 0
    return
  }
  selectedFile.value = file
  result.value = null
  fileMeta.value = { name: file.name, size: formatBytes(file.size) }
  statusText.value = 'آماده'
  statusDetail.value = 'فایل انتخاب شد. برای شروع روی دکمهٔ زیر بزنید.'
  progressPercent.value = 0
}

async function readAudio(file: File): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number; length: number }> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    const length = decoded.length
    const left = decoded.getChannelData(0).slice()
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice() : left.slice()
    return { left, right, sampleRate: decoded.sampleRate, length }
  } finally {
    await context.close()
  }
}

function resampleChannel(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const outputLength = Math.max(1, Math.round((input.length * toRate) / fromRate))
  const output = new Float32Array(outputLength)
  const ratio = fromRate / toRate
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = input[Math.min(index, input.length - 1)] || 0
    const b = input[Math.min(index + 1, input.length - 1)] || a
    output[i] = a + (b - a) * fraction
  }
  return output
}

function onProgress(state: SplitterProgressState) {
  if (state.type === 'model') {
    const loaded = state.loaded || 0
    const total = state.total || MODEL_SIZE_MB * 1024 * 1024
    statusText.value = 'در حال دانلود مدل'
    statusDetail.value = `${formatBytes(loaded)} از حدود ${formatBytes(total)} · این مرحله فقط بار اول انجام می‌شود.`
    progressPercent.value = (loaded / total) * 100
  } else if (state.type === 'process') {
    if (state.message) {
      statusText.value = 'در حال آماده‌سازی'
      statusDetail.value = state.message
      progressPercent.value = 100
    } else if (typeof state.progress === 'number') {
      statusText.value = 'در حال جداسازی'
      statusDetail.value = `قطعهٔ ${state.currentSegment ?? '?'} از ${state.totalSegments ?? '?'}`
      progressPercent.value = state.progress * 100
    }
  }
}

async function startSeparation() {
  if (!selectedFile.value || isProcessing.value) return
  isProcessing.value = true
  result.value = null
  statusText.value = 'در حال خواندن فایل'
  statusDetail.value = 'فایل صوتی فقط در همین مرورگر خوانده می‌شود…'
  progressPercent.value = 2
  try {
    const decoded = await readAudio(selectedFile.value)
    const left = resampleChannel(decoded.left, decoded.sampleRate, 44100)
    const right = resampleChannel(decoded.right, decoded.sampleRate, 44100)
    const duration = left.length / 44100
    statusText.value = 'در حال آماده‌سازی'
    statusDetail.value = `مدت زمان فایل: ${formatDuration(duration)} · مدل روی دستگاه شما اجرا می‌شود.`
    progressPercent.value = 5
    client = new SplitterClient(new URL('@/workers/splitter.worker.ts', import.meta.url).href)
    client.onProgress = onProgress
    await client.separate(left, right)
    result.value = client.getResult()
    isProcessing.value = false
    statusText.value = 'تمام شد'
    statusDetail.value = 'دو خروجی آمادهٔ دانلود هستند.'
    progressPercent.value = 100
  } catch (error) {
    isProcessing.value = false
    statusText.value = 'خطا در خواندن فایل'
    statusDetail.value = (error as Error).message || 'فرمت فایل پشتیبانی نمی‌شود.'
    progressPercent.value = 0
  }
}

function cancelSeparation() {
  if (!isProcessing.value) return
  isProcessing.value = false
  client?.cancel()
  client = null
  statusText.value = 'لغو شد'
  statusDetail.value = 'می‌توانید دوباره پردازش را شروع کنید.'
  progressPercent.value = 0
}

function downloadResult(kind: 'vocals' | 'instrumental') {
  if (!result.value || !selectedFile.value) return
  const name = baseName(selectedFile.value.name)
  if (kind === 'vocals') {
    downloadBlob(
      encodeWav(result.value.vocalsLeft, result.value.vocalsRight, result.value.sampleRate),
      `${name}_vocals.wav`,
    )
  } else {
    downloadBlob(
      encodeWav(result.value.instrumentalLeft, result.value.instrumentalRight, result.value.sampleRate),
      `${name}_instrumental.wav`,
    )
  }
}
</script>

<style scoped>
.splitter-panel {
  max-width: 520px;
  margin: 0 auto;
  padding: 20px 16px 24px;
}
.hero {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 18px;
}
.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  flex: 0 0 auto;
  color: #071d1a;
  background: linear-gradient(135deg, #63d6b3, #82a9ff);
  border-radius: 14px;
  box-shadow: 0 8px 22px rgba(69, 215, 173, 0.2);
  font-size: 25px;
  font-weight: 800;
}
.eyebrow {
  margin: 0 0 4px;
  color: #63d6b3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
h1, h2, p {
  margin-top: 0;
}
h1 {
  margin-bottom: 4px;
  font-size: 19px;
  letter-spacing: -0.02em;
}
.subtitle {
  margin-bottom: 0;
  color: #91a3bf;
  font-size: 11px;
}
.card {
  margin-bottom: 13px;
  padding: 15px;
  background: rgba(19, 29, 48, 0.88);
  border: 1px solid rgba(164, 188, 226, 0.16);
  border-radius: 16px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.14);
}
.file-drop {
  display: flex;
  min-height: 148px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-direction: column;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(99, 214, 179, 0.08), rgba(87, 121, 198, 0.08));
  border: 1px dashed rgba(99, 214, 179, 0.58);
  border-radius: 13px;
  transition: border-color 0.2s, background 0.2s, transform 0.2s;
}
.file-drop:hover, .file-drop.is-dragging {
  background: rgba(99, 214, 179, 0.14);
  border-color: #63d6b3;
  transform: translateY(-1px);
}
.file-drop:focus-visible {
  outline: 2px solid #63d6b3;
  outline-offset: 3px;
}
.upload-icon {
  color: #63d6b3;
  font-size: 25px;
  font-weight: 300;
}
.drop-title {
  font-size: 13px;
  font-weight: 750;
}
.drop-help {
  color: #91a3bf;
  font-size: 10px;
  line-height: 1.6;
}
.file-meta {
  margin-top: 11px;
  padding: 9px 11px;
  color: #91a3bf;
  background: #17243a;
  border-radius: 9px;
  font-size: 11px;
  word-break: break-word;
}
.file-meta strong {
  color: #e7eefc;
}
.status-row, .section-heading, .result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.status-row {
  margin-bottom: 10px;
  color: #91a3bf;
  font-size: 11px;
}
.status-row strong {
  color: #e7eefc;
  font-size: 11px;
}
.progress-track {
  height: 7px;
  overflow: hidden;
  background: #0b1322;
  border-radius: 99px;
}
.progress-bar {
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #1ea983, #7ea6ff);
  border-radius: inherit;
  transition: width 0.25s ease;
}
.status-detail {
  min-height: 31px;
  margin: 9px 0 13px;
  color: #91a3bf;
  font-size: 10px;
  line-height: 1.55;
}
.primary-button, .secondary-button {
  width: 100%;
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  border: 0;
  cursor: pointer;
  transition: filter 0.2s, transform 0.2s, opacity 0.2s;
}
.primary-button {
  color: #061a18;
  background: linear-gradient(100deg, #63d6b3, #86cbff);
}
.primary-button:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.secondary-button {
  margin-top: 8px;
  color: #ee8090;
  background: rgba(238, 128, 144, 0.1);
}
.results-card {
  border-color: rgba(99, 214, 179, 0.3);
}
.section-heading {
  margin-bottom: 13px;
}
.quality-pill {
  padding: 4px 7px;
  color: #63d6b3;
  background: rgba(99, 214, 179, 0.12);
  border-radius: 99px;
  font-size: 9px;
  font-weight: 800;
}
.result-list {
  display: grid;
  gap: 8px;
}
.result-row {
  padding: 10px 11px;
  background: #17243a;
  border-radius: 10px;
}
.result-row div {
  display: grid;
  gap: 3px;
}
.result-row strong {
  font-size: 11px;
}
.result-row span {
  color: #91a3bf;
  font-size: 9px;
}
.download-button {
  padding: 7px 10px;
  color: #071d1a;
  background: #63d6b3;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  border: 0;
  cursor: pointer;
}
.footer-note {
  padding: 2px 4px 0;
  color: #71839e;
  font-size: 9px;
  line-height: 1.7;
  text-align: center;
}
</style>
