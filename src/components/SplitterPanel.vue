<template>
  <div class="splitter-panel">
    <div class="hero">
      <div class="brand-mark">🎤</div>
      <div>
        <p class="eyebrow">Voice Splitter</p>
        <h1>جداسازی صدای خواننده از موسیقی</h1>
        <p class="subtitle">پردازش کاملا روی دستگاه شما، بدون آپلود فایل</p>
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
        <input
          ref="fileInput"
          type="file"
          accept="audio/*"
          @change="onFileChange"
          hidden
        />
      </div>
      <div v-if="fileMeta" class="file-meta">
        <strong>{{ fileMeta.name }}</strong> · {{ fileMeta.size }}
      </div>
    </div>

    <div class="card">
      <div class="section-heading">
        <strong>حذف بخش‌های خالی</strong>
        <span class="quality-pill">اختیاری</span>
      </div>

      <label class="toggle-row">
        <input v-model="trimVocals" type="checkbox" :disabled="isBusy" />
        <span>حذف سکوت از صدای خواننده</span>
      </label>
      <label class="toggle-row">
        <input v-model="trimInstrumental" type="checkbox" :disabled="isBusy" />
        <span>حذف سکوت از آهنگ</span>
      </label>

      <div class="option-grid">
        <label class="field">
          <span>حساسیت</span>
          <select v-model="sensitivity" :disabled="isBusy || !isTrimEnabled">
            <option value="gentle">ملایم (فقط سکوت کامل)</option>
            <option value="balanced">متوسط (پیشنهادی)</option>
            <option value="aggressive">تهاجمی (نشتی صدا هم حذف شود)</option>
          </select>
        </label>
        <label class="field">
          <span>حداقل طول سکوت برای حذف</span>
          <select
            v-model.number="minSilenceSeconds"
            :disabled="isBusy || !isTrimEnabled"
          >
            <option :value="0.5">۰٫۵ ثانیه</option>
            <option :value="1">۱ ثانیه (پیشنهادی)</option>
            <option :value="2">۲ ثانیه</option>
            <option :value="3">۳ ثانیه</option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="status-row">
        <strong>{{ statusText }}</strong>
      </div>
      <div class="progress-track">
        <div
          class="progress-bar"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
      <p class="status-detail">{{ statusDetail }}</p>
      <button
        class="primary-button"
        :disabled="!selectedFile || isBusy"
        @click="startSeparation"
      >
        شروع جداسازی
      </button>
      <button
        v-if="isProcessing"
        class="secondary-button"
        @click="cancelSeparation"
      >
        لغو
      </button>
    </div>

    <div v-if="exported" class="card results-card">
      <div class="section-heading">
        <strong>خروجی</strong>
        <span class="quality-pill">{{
          exported.ext === "wav" ? "WAV" : "MP3 " + MP3_KBPS + " kbps"
        }}</span>
      </div>

      <div class="result-list">
        <div class="result-row">
          <div>
            <strong>صدای خواننده</strong>
            <span>Vocal stem{{ trimNote(trimStats?.vocals) }}</span>
          </div>
          <button class="download-button" @click="downloadResult('vocals')">
            دانلود
          </button>
        </div>
        <div class="result-row">
          <div>
            <strong>آهنگ بی‌کلام</strong>
            <span
              >Instrumental stem{{ trimNote(trimStats?.instrumental) }}</span
            >
          </div>
          <button
            class="download-button"
            @click="downloadResult('instrumental')"
          >
            دانلود
          </button>
        </div>
      </div>

      <button
        class="secondary-button"
        :disabled="isBusy"
        @click="rebuildExports"
      >
        اعمال دوباره تنظیمات حذف سکوت (بدون جداسازی مجدد)
      </button>
    </div>

    <section id="lyric-video" class="video-section">
      <template v-if="exported && vocalStem">
        <div class="card video-intro">
          <div class="section-heading">
            <strong>ویدئوی متن آهنگ</strong>
            <span class="quality-pill">جدید</span>
          </div>
          <p class="option-note">
            از همین صدای خواننده، یک ویدئوی عمودی با متن همگام می‌سازید. ویدئو
            از صدای خروجی بالا (با تنظیمات حذف سکوت) ساخته می‌شود.
          </p>
          <button
            v-if="!showVideoTool"
            class="primary-button"
            @click="showVideoTool = true"
          >
            باز کردن ابزار ساخت ویدئو
          </button>
        </div>

        <LyricVideoPanel
          v-if="showVideoTool"
          :key="exportVersion"
          :vocals="vocalStem"
          :vocals-blob="exported.vocals"
          :source-name="selectedFile?.name ?? ''"
        />
      </template>

      <div v-else class="card video-lock" aria-disabled="true">
        <div class="section-heading">
          <strong>🔒 ویدئوی متن آهنگ</strong>
          <span class="quality-pill is-muted">غیرفعال</span>
        </div>

        <ol class="lock-steps">
          <li>جداسازی صدای خواننده از آهنگ</li>
          <li>استخراج متن و زمان‌بندی کلمه‌ها با</li>
          <li>ساخت ویدئو MP4 با متن همگام</li>
        </ol>

        <p class="option-note" role="status">{{ videoLockMessage }}</p>

        <button
          v-if="!selectedFile"
          class="primary-button"
          @click="triggerFileInput"
        >
          انتخاب آهنگ
        </button>
        <button class="secondary-button" disabled>
          باز کردن ابزار ساخت ویدئو
        </button>
      </div>
    </section>

    <p class="footer-note">
      مدل در اولین اجرا دانلود می‌شود و در مرورگر کش می‌ماند.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, shallowRef } from "vue";
import {
  SplitterClient,
  downloadBlob,
  baseName,
  encodeWav,
} from "@/lib/splitter/client";
import type {
  SplitterProgressState,
  SplitterResult,
} from "@/lib/splitter/client";
import { encodeMp3 } from "@/lib/audio/mp3Client";
import {
  DEFAULT_TRIM_OPTIONS,
  SENSITIVITY_DB,
  SilenceTrimmer,
  type SilenceTrimOptions,
  type TrimSensitivity,
} from "@/lib/audio/silenceTrimmer";
import { historyStore } from "@/lib/history/historyStore";
import { performanceLog } from "@/lib/system/performanceLog";
import type { VocalStem } from "@/lib/video/videoExporter";

const LyricVideoPanel = defineAsyncComponent(
  () => import("@/components/LyricVideoPanel.vue"),
);

interface Stem {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly removedSeconds: number;
}

interface TrimStats {
  readonly vocals: number;
  readonly instrumental: number;
}

const MODEL_SIZE_MB = 172;
const MP3_KBPS = 192;
const TARGET_SAMPLE_RATE = 44100;

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const fileMeta = ref<{ name: string; size: string } | null>(null);
const isProcessing = ref(false);
const isExporting = ref(false);
const statusText = ref("آماده");
const statusDetail = ref("یک فایل صوتی انتخاب کنید.");
const progressPercent = ref(0);
const result = ref<SplitterResult | null>(null);
const exported = ref<{
  vocals: Blob;
  instrumental: Blob;
  ext: "mp3" | "wav";
} | null>(null);
const trimStats = ref<TrimStats | null>(null);
const vocalStem = shallowRef<VocalStem | null>(null);
const showVideoTool = ref(false);
const exportVersion = ref(0);

const trimVocals = ref(true);
const trimInstrumental = ref(true);
const sensitivity = ref<TrimSensitivity>("balanced");
const minSilenceSeconds = ref(DEFAULT_TRIM_OPTIONS.minSilenceSeconds);

const isBusy = computed(() => isProcessing.value || isExporting.value);
const isTrimEnabled = computed(
  () => trimVocals.value || trimInstrumental.value,
);

const videoLockMessage = computed(() => {
  if (isProcessing.value) {
    return "جداسازی در حال انجام است. بعد از پایان، این بخش فعال می‌شود.";
  }
  if (isExporting.value) {
    return "خروجی در حال ساخت است. چند لحظه صبر کنید.";
  }
  return selectedFile.value
    ? "آهنگ انتخاب شده است. بعد از پایان جداسازی، این بخش فعال می‌شود."
    : "برای فعال شدن، ابتدا یک آهنگ انتخاب کنید و جداسازی را اجرا کنید.";
});

let client: SplitterClient | null = null;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function trimNote(removedSeconds: number | undefined): string {
  if (removedSeconds === undefined || removedSeconds <= 0) return "";
  return ` · ${formatDuration(removedSeconds)} سکوت حذف شد`;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function triggerFileInput(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) selectFile(file);
}

function onDrop(event: DragEvent): void {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) selectFile(file);
}

function resetOutputs(): void {
  result.value = null;
  exported.value = null;
  trimStats.value = null;
  vocalStem.value = null;
  showVideoTool.value = false;
}

function selectFile(file: File): void {
  if (
    !file.type.startsWith("audio/") &&
    !/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)
  ) {
    statusText.value = "فرمت پشتیبانی نمی‌شود";
    statusDetail.value = "یک فایل MP3، WAV، M4A، OGG یا FLAC انتخاب کنید.";
    progressPercent.value = 0;
    return;
  }

  selectedFile.value = file;
  resetOutputs();
  fileMeta.value = { name: file.name, size: formatBytes(file.size) };
  statusText.value = "آماده";
  statusDetail.value = "برای شروع، دکمه جداسازی را بزنید.";
  progressPercent.value = 0;
}

async function readAudio(file: File): Promise<{
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  length: number;
}> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const left = decoded.getChannelData(0).slice();
    const right =
      decoded.numberOfChannels > 1
        ? decoded.getChannelData(1).slice()
        : left.slice();
    return {
      left,
      right,
      sampleRate: decoded.sampleRate,
      length: decoded.length,
    };
  } finally {
    await context.close();
  }
}

function resampleChannel(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;

  const outputLength = Math.max(
    1,
    Math.round((input.length * toRate) / fromRate),
  );
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[Math.min(index, input.length - 1)] ?? 0;
    const b = input[Math.min(index + 1, input.length - 1)] ?? a;
    output[i] = a + (b - a) * fraction;
  }

  return output;
}

function onProgress(state: SplitterProgressState): void {
  if (state.type === "model") {
    const loaded = state.loaded ?? 0;
    const total = state.total || MODEL_SIZE_MB * 1024 * 1024;
    statusText.value = "در حال دانلود مدل";
    statusDetail.value = `${formatBytes(loaded)} از ${formatBytes(total)}`;
    progressPercent.value = (loaded / total) * 100;
  } else if (state.type === "process") {
    if (state.message) {
      statusText.value = "در حال آماده‌سازی";
      statusDetail.value = state.message;
      progressPercent.value = 100;
    } else if (typeof state.progress === "number") {
      statusText.value = "در حال جداسازی";
      statusDetail.value = `بخش ${state.currentSegment ?? 0} از ${state.totalSegments ?? 0}`;
      progressPercent.value = state.progress * 100;
    }
  }
}

function currentTrimOptions(): SilenceTrimOptions {
  return {
    ...DEFAULT_TRIM_OPTIONS,
    thresholdDb: SENSITIVITY_DB[sensitivity.value],
    minSilenceSeconds: minSilenceSeconds.value,
  };
}

function prepareStem(
  trimmer: SilenceTrimmer,
  left: Float32Array,
  right: Float32Array,
  enabled: boolean,
): Stem {
  if (!enabled) return { left, right, removedSeconds: 0 };

  const trimmed = trimmer.trim(left, right, currentTrimOptions());
  return {
    left: trimmed.left,
    right: trimmed.right,
    removedSeconds: trimmed.removedSeconds,
  };
}

async function buildExports(
  source: File,
  data: SplitterResult,
  recordHistory: boolean,
): Promise<void> {
  isExporting.value = true;

  try {
    if (isTrimEnabled.value) {
      statusText.value = "در حال حذف بخش‌های خالی";
      statusDetail.value = "تشخیص سکوت در استم‌ها...";
      progressPercent.value = 100;
      await yieldToUi();
    }

    const trimmer = new SilenceTrimmer(data.sampleRate);
    const vocals = prepareStem(
      trimmer,
      data.vocalsLeft,
      data.vocalsRight,
      trimVocals.value,
    );
    const instrumental = prepareStem(
      trimmer,
      data.instrumentalLeft,
      data.instrumentalRight,
      trimInstrumental.value,
    );

    statusText.value = "در حال ساخت خروجی";
    statusDetail.value = "کدگذاری MP3...";
    await yieldToUi();

    let vocalsBlob: Blob;
    let instrumentalBlob: Blob;
    let ext: "mp3" | "wav" = "mp3";

    try {
      [vocalsBlob, instrumentalBlob] = await Promise.all([
        encodeMp3([vocals.left, vocals.right], data.sampleRate, MP3_KBPS),
        encodeMp3(
          [instrumental.left, instrumental.right],
          data.sampleRate,
          MP3_KBPS,
        ),
      ]);
    } catch (error) {
      console.error("MP3 encoding failed, falling back to WAV", error);
      ext = "wav";
      vocalsBlob = encodeWav(vocals.left, vocals.right, data.sampleRate);
      instrumentalBlob = encodeWav(
        instrumental.left,
        instrumental.right,
        data.sampleRate,
      );
    }

    exported.value = {
      vocals: vocalsBlob,
      instrumental: instrumentalBlob,
      ext,
    };
    trimStats.value = {
      vocals: vocals.removedSeconds,
      instrumental: instrumental.removedSeconds,
    };
    vocalStem.value = {
      left: vocals.left,
      right: vocals.right,
      sampleRate: data.sampleRate,
    };
    exportVersion.value += 1;

    if (recordHistory) {
      const name = baseName(source.name);
      await historyStore.add({
        kind: "splitter",
        sourceName: source.name,
        outputs: [`${name}-vocals.${ext}`, `${name}-instrumental.${ext}`],
      });
    }
  } finally {
    isExporting.value = false;
  }
}

async function startSeparation(): Promise<void> {
  if (!selectedFile.value || isBusy.value) return;

  isProcessing.value = true;
  resetOutputs();
  statusText.value = "در حال خواندن فایل";
  statusDetail.value = "رمزگشایی صدا...";
  progressPercent.value = 2;

  try {
    const source = selectedFile.value;
    const decoded = await readAudio(source);
    const left = resampleChannel(
      decoded.left,
      decoded.sampleRate,
      TARGET_SAMPLE_RATE,
    );
    const right = resampleChannel(
      decoded.right,
      decoded.sampleRate,
      TARGET_SAMPLE_RATE,
    );
    const duration = left.length / TARGET_SAMPLE_RATE;

    statusText.value = "آماده جداسازی";
    statusDetail.value = `مدت فایل ${formatDuration(duration)}`;
    progressPercent.value = 5;

    client = new SplitterClient();
    client.onProgress = onProgress;

    const startedAt = performance.now();
    await client.separate(left, right);
    performanceLog.record("splitter", duration, performance.now() - startedAt);

    result.value = client.getResult();
    isProcessing.value = false;

    if (result.value) {
      await buildExports(source, result.value, true);
    }

    statusText.value = "انجام شد";
    statusDetail.value = "فایل‌ها آماده دانلود هستند.";
    progressPercent.value = 100;
  } catch (error) {
    isProcessing.value = false;
    statusText.value = "خطا";
    statusDetail.value = (error as Error).message;
    progressPercent.value = 0;
  }
}

async function rebuildExports(): Promise<void> {
  if (!selectedFile.value || !result.value || isBusy.value) return;

  try {
    await buildExports(selectedFile.value, result.value, false);
    statusText.value = "انجام شد";
    statusDetail.value = "خروجی با تنظیمات جدید ساخته شد.";
  } catch (error) {
    statusText.value = "خطا";
    statusDetail.value = (error as Error).message;
  }
}

function cancelSeparation(): void {
  if (!isProcessing.value) return;

  isProcessing.value = false;
  client?.cancel();
  client = null;
  statusText.value = "لغو شد";
  statusDetail.value = "جداسازی متوقف شد.";
  progressPercent.value = 0;
}

function downloadResult(kind: "vocals" | "instrumental"): void {
  if (!exported.value || !selectedFile.value) return;

  downloadBlob(
    exported.value[kind],
    `${baseName(selectedFile.value.name)}-${kind}.${exported.value.ext}`,
  );
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

h1,
h2,
p {
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
  background: linear-gradient(
    135deg,
    rgba(99, 214, 179, 0.08),
    rgba(87, 121, 198, 0.08)
  );
  border: 1px dashed rgba(99, 214, 179, 0.58);
  border-radius: 13px;
  transition:
    border-color 0.2s,
    background 0.2s,
    transform 0.2s;
}

.file-drop:hover,
.file-drop.is-dragging {
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

.status-row,
.section-heading,
.result-row {
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

.status-row strong,
.section-heading strong {
  color: #e7eefc;
  font-size: 12px;
}

.section-heading {
  margin-bottom: 12px;
}

.quality-pill {
  padding: 3px 9px;
  color: #63d6b3;
  background: rgba(99, 214, 179, 0.12);
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  color: #e7eefc;
  font-size: 12px;
  cursor: pointer;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: #63d6b3;
}

.option-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #91a3bf;
  font-size: 11px;
}

.field select {
  width: 100%;
  padding: 9px 10px;
  color: #e7eefc;
  background: #0b1322;
  border: 1px solid rgba(164, 188, 226, 0.2);
  border-radius: 9px;
  font: inherit;
  font-size: 12px;
}

.field select:disabled {
  opacity: 0.5;
}

.option-note {
  margin: 12px 0;
  color: #91a3bf;
  font-size: 10px;
  line-height: 1.7;
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

.primary-button,
.secondary-button {
  width: 100%;
  padding: 11px 14px;
  border: 0;
  border-radius: 11px;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: opacity 0.2s;
}

.primary-button {
  color: #06241d;
  background: linear-gradient(135deg, #63d6b3, #82a9ff);
}

.secondary-button {
  margin-top: 8px;
  color: #e7eefc;
  background: transparent;
  border: 1px solid rgba(164, 188, 226, 0.28);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}

.result-row {
  padding: 10px 12px;
  background: #17243a;
  border-radius: 11px;
}

.result-row div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.result-row strong {
  color: #e7eefc;
  font-size: 12px;
}

.result-row span {
  color: #91a3bf;
  font-size: 10px;
}

.download-button {
  flex: 0 0 auto;
  padding: 8px 14px;
  color: #06241d;
  background: #63d6b3;
  border: 0;
  border-radius: 9px;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.footer-note {
  margin: 4px 0 0;
  color: #91a3bf;
  font-size: 10px;
  line-height: 1.7;
  text-align: center;
}

@media (min-width: 480px) {
  .option-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.video-section {
  scroll-margin-top: 80px;
}

.video-lock {
  border-style: dashed;
}

.video-lock .section-heading strong {
  color: #91a3bf;
}

.quality-pill.is-muted {
  color: #91a3bf;
  background: rgba(145, 163, 191, 0.14);
}

.lock-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.lock-steps li {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  color: #91a3bf;
  background: #17243a;
  border-radius: 9px;
  font-size: 11px;
  opacity: 0.75;
  counter-increment: step;
}

.lock-steps li::before {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  content: counter(step);
  color: #63d6b3;
  background: rgba(99, 214, 179, 0.12);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
}
</style>
