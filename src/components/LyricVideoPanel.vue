<template>
  <div class="lyric-panel">
    <div class="card">
      <div class="section-heading">
        <strong>۱. بازهٔ ویدئو</strong>
        <span class="pill">{{ formatTime(duration) }} کل صدا</span>
      </div>

      <audio
        ref="audioEl"
        class="audio"
        :src="audioUrl"
        controls
        preload="metadata"
        @play="onAudioPlay"
        @pause="onAudioPause"
        @ended="onAudioPause"
        @seeked="onAudioSeeked"
      ></audio>

      <div class="option-grid">
        <label class="field">
          <span>شروع (ثانیه)</span>
          <input
            v-model.number="rangeStart"
            type="number"
            min="0"
            step="0.1"
            :disabled="isBusy"
            @change="normalizeRange"
          />
        </label>
        <label class="field">
          <span>پایان (ثانیه)</span>
          <input
            v-model.number="rangeEnd"
            type="number"
            min="0"
            step="0.1"
            :disabled="isBusy"
            @change="normalizeRange"
          />
        </label>
      </div>

      <div class="button-row">
        <button
          class="ghost-button"
          :disabled="isBusy"
          @click="setStartFromPlayer"
        >
          شروع = موقعیت پخش
        </button>
        <button
          class="ghost-button"
          :disabled="isBusy"
          @click="setEndFromPlayer"
        >
          پایان = موقعیت پخش
        </button>
      </div>

      <p class="note" :class="{ warn: clipDuration > RECOMMENDED_MAX_SECONDS }">
        طول ویدئو: {{ formatTime(clipDuration) }}.
        <template v-if="clipDuration > RECOMMENDED_MAX_SECONDS">
          برای ریلز، طول مجاز را در اکانت خودتان بررسی کنید؛ ویدئوی طولانی‌تر
          رندر و حجم بیشتری دارد.
        </template>
      </p>
    </div>

    <div class="card">
      <div class="section-heading">
        <strong>۲. متن آهنگ</strong>
        <span class="pill">{{ lines.length }} خط</span>
      </div>

      <div class="option-grid">
        <label class="field">
          <span>زبان خواننده</span>
          <select v-model="languageCode" :disabled="isBusy">
            <option
              v-for="item in LANGUAGES"
              :key="item.label"
              :value="item.code"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>مدل تشخیص</span>
          <select v-model="modelId" :disabled="isBusy">
            <option
              v-for="item in WHISPER_MODELS"
              :key="item.id"
              :value="item.id"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
      </div>

      <button
        class="primary-button"
        :disabled="isBusy || !rangeValid"
        @click="transcribe"
      >
        تشخیص متن از صدای خواننده
      </button>
      <button
        v-if="isTranscribing"
        class="secondary-button"
        @click="cancelTranscribe"
      >
        لغو
      </button>

      <div v-if="isTranscribing || transcribeStatus" class="status-block">
        <div v-if="isTranscribing" class="progress-track">
          <div
            class="progress-bar"
            :class="{ indeterminate: !downloadPercent }"
            :style="{ width: (downloadPercent || 100) + '%' }"
          ></div>
        </div>
        <p class="note">{{ transcribeStatus }}</p>
      </div>

      <label class="field lyrics-field">
        <span>متن (هر خط = یک خط در ویدئو؛ برای شکست خط Enter بزنید)</span>
        <textarea
          v-model="lyricsText"
          rows="8"
          dir="auto"
          spellcheck="false"
          :disabled="isBusy"
          placeholder="بعد از تشخیص، متن اینجا ظاهر می‌شود. می‌توانید خودتان هم متن را بنویسید."
          @input="onLyricsInput"
        ></textarea>
      </label>

      <div class="option-grid">
        <label class="field">
          <span>حداکثر کلمه در هر خط</span>
          <input
            v-model.number="maxWordsPerLine"
            type="number"
            min="1"
            max="12"
            :disabled="isBusy || words.length === 0"
          />
        </label>
        <div class="field align-end">
          <button
            class="ghost-button"
            :disabled="isBusy || words.length === 0"
            @click="rebuildLines"
          >
            خط‌بندی خودکار مجدد
          </button>
        </div>
      </div>

      <p v-if="rangeOutsideTranscription" class="note warn">
        متن فقط برای بازهٔ {{ formatTime(transcribedRange?.start ?? 0) }} تا
        {{ formatTime(transcribedRange?.end ?? 0) }} تشخیص داده شده؛ بخش‌های
        بیرون از آن متنی ندارند.
      </p>
      <p class="note">
        زمان‌بندی از روی صدای خواننده است و با ویرایش متن، کلمه‌های تغییرنکرده
        زمان خودشان را نگه می‌دارند. اگر بیشتر متن را عوض کنید، زمان‌ها تقریبی
        روی بازهٔ خوانده‌شده پخش می‌شوند.
      </p>
    </div>

    <div class="card">
      <div class="section-heading">
        <strong>۳. ظاهر ویدئو</strong>
      </div>

      <div class="option-grid">
        <label class="field">
          <span>اندازه</span>
          <select v-model="sizePresetId" :disabled="isBusy">
            <option
              v-for="item in SIZE_PRESETS"
              :key="item.id"
              :value="item.id"
            >
              {{ item.label }}
            </option>
            <option value="custom">دلخواه</option>
          </select>
        </label>
        <label class="field">
          <span>نرخ فریم (حداکثر {{ MAX_FPS }})</span>
          <select v-model.number="fps" :disabled="isBusy">
            <option v-for="item in FPS_OPTIONS" :key="item" :value="item">
              {{ item }} fps
            </option>
          </select>
        </label>
      </div>

      <div v-if="sizePresetId === 'custom'" class="option-grid">
        <label class="field">
          <span>عرض (پیکسل)</span>
          <input
            v-model.number="customWidth"
            type="number"
            :min="MIN_DIMENSION"
            :max="MAX_DIMENSION"
            step="2"
            :disabled="isBusy"
          />
        </label>
        <label class="field">
          <span>ارتفاع (پیکسل)</span>
          <input
            v-model.number="customHeight"
            type="number"
            :min="MIN_DIMENSION"
            :max="MAX_DIMENSION"
            step="2"
            :disabled="isBusy"
          />
        </label>
      </div>

      <div class="option-grid">
        <label class="field">
          <span>فونت</span>
          <select v-model="fontId" :disabled="isBusy">
            <option
              v-for="item in FONT_OPTIONS"
              :key="item.id"
              :value="item.id"
            >
              {{ item.label }}
            </option>
            <option v-if="customFontFamily" value="custom">
              فونت آپلودشده
            </option>
          </select>
        </label>
        <label class="field">
          <span>ضخامت</span>
          <select v-model.number="fontWeight" :disabled="isBusy">
            <option v-for="item in availableWeights" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
      </div>

      <div class="option-grid">
        <label class="field">
          <span>آپلود فونت (ttf / otf / woff2)</span>
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            :disabled="isBusy"
            @change="onFontFile"
          />
        </label>
        <label class="field">
          <span>اندازهٔ متن: {{ Math.round(fontScale * 1000) / 10 }}٪</span>
          <input
            v-model.number="fontScale"
            type="range"
            min="0.04"
            max="0.14"
            step="0.005"
            :disabled="isBusy"
          />
        </label>
      </div>

      <div class="option-grid">
        <label class="field">
          <span>انیمیشن نوشتن متن</span>
          <select v-model="animation" :disabled="isBusy">
            <option value="karaoke">کاراکه (رنگ‌شدن کلمه‌ها)</option>
            <option value="typewriter">تایپی (حرف‌به‌حرف)</option>
            <option value="fade">محو شدن</option>
            <option value="slide">لغزش از پایین</option>
            <option value="none">بدون انیمیشن</option>
          </select>
        </label>
        <div class="field">
          <span>رنگ‌ها</span>
          <div class="color-row">
            <input
              v-model="textColor"
              type="color"
              title="رنگ متن"
              :disabled="isBusy"
            />
            <input
              v-model="highlightColor"
              type="color"
              title="رنگ هایلایت"
              :disabled="isBusy"
            />
          </div>
        </div>
      </div>

      <label class="toggle-row">
        <input v-model="showContext" type="checkbox" :disabled="isBusy" />
        <span>نمایش خط قبلی و بعدی کم‌رنگ</span>
      </label>
      <label class="toggle-row">
        <input v-model="textShadow" type="checkbox" :disabled="isBusy" />
        <span>سایهٔ متن (خوانایی بیشتر)</span>
      </label>

      <div class="option-grid">
        <label class="field">
          <span>پس‌زمینه</span>
          <select v-model="backgroundKind" :disabled="isBusy">
            <option value="gradient">گرادیان</option>
            <option value="solid">رنگ ساده</option>
            <option value="image">تصویر</option>
          </select>
        </label>

        <div v-if="backgroundKind === 'solid'" class="field">
          <span>رنگ پس‌زمینه</span>
          <input v-model="backgroundColor" type="color" :disabled="isBusy" />
        </div>

        <div v-else-if="backgroundKind === 'gradient'" class="field">
          <span>رنگ‌های گرادیان</span>
          <div class="color-row">
            <input v-model="gradientFrom" type="color" :disabled="isBusy" />
            <input v-model="gradientTo" type="color" :disabled="isBusy" />
          </div>
        </div>

        <label v-else class="field">
          <span>تصویر پس‌زمینه</span>
          <input
            type="file"
            accept="image/*"
            :disabled="isBusy"
            @change="onBackgroundFile"
          />
        </label>
      </div>

      <label v-if="backgroundKind === 'gradient'" class="field">
        <span>زاویهٔ گرادیان: {{ gradientAngle }}°</span>
        <input
          v-model.number="gradientAngle"
          type="range"
          min="0"
          max="360"
          step="5"
          :disabled="isBusy"
        />
      </label>
      <label v-if="backgroundKind === 'image'" class="field">
        <span>تیرگی روی تصویر: {{ Math.round(imageDim * 100) }}٪</span>
        <input
          v-model.number="imageDim"
          type="range"
          min="0"
          max="0.9"
          step="0.05"
          :disabled="isBusy"
        />
      </label>
    </div>

    <div class="card">
      <div class="section-heading">
        <strong>۴. پیش‌نمایش</strong>
        <span class="pill" dir="ltr"
          >{{ videoSize.width }}×{{ videoSize.height }} · {{ fps }}fps</span
        >
      </div>

      <canvas
        ref="previewCanvas"
        class="preview"
        :width="previewSize.width"
        :height="previewSize.height"
      ></canvas>

      <input
        class="scrubber"
        type="range"
        min="0"
        :max="Math.max(clipDuration, 0.1)"
        step="0.05"
        :value="previewTime"
        :disabled="!rangeValid"
        @input="onScrub"
      />

      <button
        class="secondary-button"
        :disabled="!rangeValid"
        @click="togglePlayback"
      >
        {{ isPlaying ? "توقف پیش‌نمایش" : "پخش پیش‌نمایش با صدا" }}
      </button>
    </div>

    <div class="card">
      <div class="section-heading">
        <strong>۵. ساخت ویدئو</strong>
        <span v-if="resultInfo" class="pill" dir="ltr">{{ resultInfo }}</span>
      </div>

      <button
        class="primary-button"
        :disabled="isBusy || !canExport"
        @click="exportVideo"
      >
        ساخت ویدئو MP4
      </button>
      <button v-if="isExporting" class="secondary-button" @click="cancelExport">
        لغو
      </button>

      <div v-if="isExporting || exportStatus" class="status-block">
        <div v-if="isExporting" class="progress-track">
          <div
            class="progress-bar"
            :style="{ width: exportPercent + '%' }"
          ></div>
        </div>
        <p class="note" :class="{ warn: exportFailed }">{{ exportStatus }}</p>
      </div>

      <div v-if="resultUrl" class="result">
        <video
          class="result-video"
          :src="resultUrl"
          controls
          playsinline
        ></video>
        <button class="download-button" @click="downloadVideo">
          دانلود ویدئو
        </button>
      </div>

      <p v-if="!canExport && !isBusy" class="note">
        برای ساخت ویدئو، بازهٔ معتبر و حداقل یک خط متن لازم است.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { audioPrep } from "@/lib/video/audioPrep";
import { fontLoader } from "@/lib/video/fontLoader";
import { LyricFrameRenderer } from "@/lib/video/lyricRenderer";
import {
  ExportCancelledError,
  LyricVideoExporter,
  type VocalStem,
} from "@/lib/video/videoExporter";
import {
  DEFAULT_FPS,
  DEFAULT_STYLE,
  FONT_OPTIONS,
  FPS_OPTIONS,
  MAX_DIMENSION,
  MAX_FPS,
  MIN_DIMENSION,
  SIZE_PRESETS,
  clampFps,
  normalizeSize,
  type BackgroundKind,
  type TextAnimation,
  type VideoSize,
  type VideoStyle,
} from "@/lib/video/videoStyle";
import { DEFAULT_LINE_OPTIONS, LineBuilder } from "@/lib/lyrics/lineBuilder";
import { LyricsAligner } from "@/lib/lyrics/lyricsAligner";
import {
  TranscribeClient,
  type TranscribeProgress,
} from "@/lib/lyrics/transcribeClient";
import {
  LANGUAGES,
  WHISPER_MODELS,
  WHISPER_SAMPLE_RATE,
} from "@/lib/lyrics/transcribeProtocol";
import {
  linesToText,
  type LyricLine,
  type LyricWord,
  type TimeRange,
} from "@/lib/lyrics/types";
import { WordTimingRefiner } from "@/lib/lyrics/wordTimingRefiner";
import { baseName } from "@/lib/splitter/client";

const props = defineProps<{
  vocals: VocalStem;
  vocalsBlob: Blob;
  sourceName: string;
}>();

const RECOMMENDED_MAX_SECONDS = 90;
const DEFAULT_CLIP_SECONDS = 60;
const PREVIEW_LONG_SIDE = 640;
const ALIGN_DEBOUNCE_MS = 250;

const lineBuilder = new LineBuilder();
const aligner = new LyricsAligner();
const transcribeClient = new TranscribeClient();
let exporter: LyricVideoExporter | null = null;

const duration = props.vocals.left.length / props.vocals.sampleRate;
const audioUrl = URL.createObjectURL(props.vocalsBlob);

const audioEl = ref<HTMLAudioElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);

const rangeStart = ref(0);
const rangeEnd = ref(Math.min(duration, DEFAULT_CLIP_SECONDS));

const languageCode = ref<string | null>("persian");
const modelId = ref(WHISPER_MODELS[0].id);
const isTranscribing = ref(false);
const transcribeStatus = ref("");
const downloadPercent = ref(0);
const words = shallowRef<readonly LyricWord[]>([]);
const lines = shallowRef<readonly LyricLine[]>([]);
const lyricsText = ref("");
const maxWordsPerLine = ref(DEFAULT_LINE_OPTIONS.maxWordsPerLine);
const transcribedRange = ref<TimeRange | null>(null);

const sizePresetId = ref(SIZE_PRESETS[0].id);
const customWidth = ref(1080);
const customHeight = ref(1920);
const fps = ref(DEFAULT_FPS);
const fontId = ref(FONT_OPTIONS[0].id);
const fontWeight = ref(DEFAULT_STYLE.fontWeight);
const fontScale = ref(DEFAULT_STYLE.fontScale);
const customFontFamily = ref("");
const animation = ref<TextAnimation>(DEFAULT_STYLE.animation);
const textColor = ref(DEFAULT_STYLE.textColor);
const highlightColor = ref(DEFAULT_STYLE.highlightColor);
const showContext = ref(DEFAULT_STYLE.showContext);
const textShadow = ref(DEFAULT_STYLE.textShadow);
const backgroundKind = ref<BackgroundKind>(DEFAULT_STYLE.background);
const backgroundColor = ref(DEFAULT_STYLE.backgroundColor);
const gradientFrom = ref(DEFAULT_STYLE.gradientFrom);
const gradientTo = ref(DEFAULT_STYLE.gradientTo);
const gradientAngle = ref(DEFAULT_STYLE.gradientAngle);
const imageDim = ref(DEFAULT_STYLE.imageDim);
const backgroundBitmap = shallowRef<ImageBitmap | null>(null);

const previewTime = ref(0);
const isPlaying = ref(false);

const isExporting = ref(false);
const exportStatus = ref("");
const exportFailed = ref(false);
const exportPercent = ref(0);
const resultUrl = ref("");
const resultBlob = shallowRef<Blob | null>(null);
const resultInfo = ref("");

let alignTimer: ReturnType<typeof setTimeout> | null = null;
let rafId = 0;
let renderGeneration = 0;
let renderer: LyricFrameRenderer | null = null;

const isBusy = computed(() => isTranscribing.value || isExporting.value);
const clipDuration = computed(() =>
  Math.max(0, rangeEnd.value - rangeStart.value),
);
const rangeValid = computed(
  () =>
    Number.isFinite(rangeStart.value) &&
    Number.isFinite(rangeEnd.value) &&
    rangeStart.value >= 0 &&
    rangeEnd.value <= duration + 0.01 &&
    rangeEnd.value - rangeStart.value >= 0.5,
);
const canExport = computed(() => rangeValid.value && lines.value.length > 0);
const range = computed<TimeRange>(() => ({
  start: rangeStart.value,
  end: rangeEnd.value,
}));

const rangeOutsideTranscription = computed(() => {
  const done = transcribedRange.value;
  return (
    done !== null &&
    words.value.length > 0 &&
    (rangeStart.value < done.start - 0.5 || rangeEnd.value > done.end + 0.5)
  );
});

const videoSize = computed<VideoSize>(() => {
  const preset = SIZE_PRESETS.find((item) => item.id === sizePresetId.value);
  return normalizeSize(
    preset ?? { width: customWidth.value, height: customHeight.value },
  );
});

const previewSize = computed<VideoSize>(() => {
  const scale =
    PREVIEW_LONG_SIDE / Math.max(videoSize.value.width, videoSize.value.height);
  return {
    width: Math.max(2, Math.round(videoSize.value.width * scale)),
    height: Math.max(2, Math.round(videoSize.value.height * scale)),
  };
});

const activeFont = computed(
  () =>
    FONT_OPTIONS.find((item) => item.id === fontId.value) ?? FONT_OPTIONS[0],
);
const activeFamily = computed(() =>
  fontId.value === "custom" ? customFontFamily.value : activeFont.value.family,
);
const availableWeights = computed(() =>
  fontId.value === "custom" ? [400, 700] : activeFont.value.weights,
);

const style = computed<VideoStyle>(() => ({
  fontFamily: activeFamily.value,
  fontWeight: fontWeight.value,
  fontScale: fontScale.value,
  textColor: textColor.value,
  highlightColor: highlightColor.value,
  textShadow: textShadow.value,
  showContext: showContext.value,
  animation: animation.value,
  background: backgroundKind.value,
  backgroundColor: backgroundColor.value,
  gradientFrom: gradientFrom.value,
  gradientTo: gradientTo.value,
  gradientAngle: gradientAngle.value,
  backgroundImage: backgroundBitmap.value,
  imageDim: imageDim.value,
}));

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${mins}:${secs}`;
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function normalizeRange(): void {
  const start = Number.isFinite(rangeStart.value) ? rangeStart.value : 0;
  const end = Number.isFinite(rangeEnd.value) ? rangeEnd.value : duration;
  rangeStart.value = Math.min(Math.max(0, start), Math.max(0, duration - 0.5));
  rangeEnd.value = Math.min(duration, Math.max(end, rangeStart.value + 0.5));
}

function setStartFromPlayer(): void {
  if (!audioEl.value) return;
  rangeStart.value = Number(audioEl.value.currentTime.toFixed(2));
  normalizeRange();
}

function setEndFromPlayer(): void {
  if (!audioEl.value) return;
  rangeEnd.value = Number(audioEl.value.currentTime.toFixed(2));
  normalizeRange();
}

function onTranscribeProgress(progress: TranscribeProgress): void {
  if (progress.kind === "model") {
    downloadPercent.value =
      progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;
    transcribeStatus.value = `دانلود مدل: ${formatBytes(progress.loaded)} از ${formatBytes(progress.total)}`;
    return;
  }

  downloadPercent.value = 0;
  transcribeStatus.value = progress.message;
}

async function transcribe(): Promise<void> {
  if (isBusy.value || !rangeValid.value) return;

  isTranscribing.value = true;
  downloadPercent.value = 0;
  transcribeStatus.value = "آماده‌سازی صدا...";
  const selected: TimeRange = { start: rangeStart.value, end: rangeEnd.value };

  try {
    const mono = audioPrep.mixToMono(
      props.vocals.left,
      props.vocals.right,
      selected.start,
      selected.end,
      props.vocals.sampleRate,
    );
    const audio = await audioPrep.resample(
      mono,
      props.vocals.sampleRate,
      WHISPER_SAMPLE_RATE,
    );

    transcribeClient.onProgress = onTranscribeProgress;
    const result = await transcribeClient.transcribe({
      audio: audio.slice(),
      modelId: modelId.value,
      language: languageCode.value,
    });

    const absolute = result.words.map((word) => ({
      text: word.text,
      start: word.start + selected.start,
      end: word.end + selected.start,
    }));

    if (absolute.length === 0) {
      transcribeStatus.value = "متنی تشخیص داده نشد. بازه یا زبان را عوض کنید.";
      return;
    }

    const refiner = new WordTimingRefiner(
      audio,
      WHISPER_SAMPLE_RATE,
      selected.start,
    );
    words.value = refiner.refine(absolute);
    transcribedRange.value = selected;
    applyLines(
      lineBuilder.build(words.value, {
        ...DEFAULT_LINE_OPTIONS,
        maxWordsPerLine: maxWordsPerLine.value,
      }),
    );
    transcribeStatus.value = `${words.value.length} کلمه تشخیص داده شد (${result.device === "webgpu" ? "WebGPU" : "WASM"}). متن را بررسی و اصلاح کنید.`;
  } catch (error) {
    transcribeStatus.value = (error as Error).message;
  } finally {
    isTranscribing.value = false;
    downloadPercent.value = 0;
  }
}

function cancelTranscribe(): void {
  transcribeClient.cancel();
}

function applyLines(next: readonly LyricLine[]): void {
  lines.value = next;
  lyricsText.value = linesToText(next);
}

function rebuildLines(): void {
  const limit = Math.min(
    12,
    Math.max(
      1,
      Math.round(maxWordsPerLine.value || DEFAULT_LINE_OPTIONS.maxWordsPerLine),
    ),
  );
  applyLines(
    lineBuilder.build(words.value, {
      ...DEFAULT_LINE_OPTIONS,
      maxWordsPerLine: limit,
    }),
  );
}

function onLyricsInput(): void {
  if (alignTimer !== null) clearTimeout(alignTimer);

  alignTimer = setTimeout(() => {
    const span: TimeRange =
      words.value.length > 0
        ? (transcribedRange.value ?? range.value)
        : range.value;
    lines.value = aligner.align(words.value, lyricsText.value, span);
  }, ALIGN_DEBOUNCE_MS);
}

async function onFontFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    customFontFamily.value = await fontLoader.loadFromFile(file);
    fontId.value = "custom";
    fontWeight.value = 400;
  } catch {
    exportStatus.value =
      "بارگذاری فونت ناموفق بود. فایل ttf، otf یا woff2 معتبر انتخاب کنید.";
    exportFailed.value = true;
  }
}

async function onBackgroundFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const bitmap = await createImageBitmap(file);
    backgroundBitmap.value?.close();
    backgroundBitmap.value = bitmap;
  } catch {
    exportStatus.value = "خواندن تصویر ناموفق بود.";
    exportFailed.value = true;
  }
}

async function rebuildRenderer(): Promise<void> {
  const generation = ++renderGeneration;
  const canvas = previewCanvas.value;
  if (!canvas || !activeFamily.value) return;

  await fontLoader.ensure(activeFamily.value, fontWeight.value);
  if (generation !== renderGeneration) return;

  renderer = new LyricFrameRenderer(
    previewSize.value,
    style.value,
    lines.value,
  );
  drawPreview(currentAbsoluteTime());
}

function currentAbsoluteTime(): number {
  return rangeStart.value + previewTime.value;
}

function drawPreview(absoluteTime: number): void {
  const ctx = previewCanvas.value?.getContext("2d");
  if (!ctx || !renderer) return;
  renderer.render(ctx, absoluteTime);
}

function onScrub(event: Event): void {
  previewTime.value = Number((event.target as HTMLInputElement).value);
  if (audioEl.value) audioEl.value.currentTime = currentAbsoluteTime();
  drawPreview(currentAbsoluteTime());
}

function onAudioSeeked(): void {
  const audio = audioEl.value;
  if (!audio || isPlaying.value) return;
  const relative = audio.currentTime - rangeStart.value;
  if (relative >= 0 && relative <= clipDuration.value) {
    previewTime.value = relative;
    drawPreview(audio.currentTime);
  }
}

function togglePlayback(): void {
  const audio = audioEl.value;
  if (!audio) return;

  if (isPlaying.value) {
    audio.pause();
    return;
  }

  if (
    audio.currentTime < rangeStart.value ||
    audio.currentTime >= rangeEnd.value - 0.05
  ) {
    audio.currentTime = rangeStart.value;
  }
  void audio.play();
}

function onAudioPlay(): void {
  isPlaying.value = true;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tickPreview);
}

function onAudioPause(): void {
  isPlaying.value = false;
  cancelAnimationFrame(rafId);
}

function tickPreview(): void {
  const audio = audioEl.value;
  if (!audio || !isPlaying.value) return;

  if (audio.currentTime >= rangeEnd.value) {
    audio.pause();
    return;
  }

  previewTime.value = Math.max(0, audio.currentTime - rangeStart.value);
  drawPreview(audio.currentTime);
  rafId = requestAnimationFrame(tickPreview);
}

function onExportProgress(phase: string, fraction: number): void {
  if (phase === "prepare") {
    exportStatus.value = "بررسی انکودرهای مرورگر...";
  } else if (phase === "render") {
    exportStatus.value = `در حال رندر فریم‌ها... ${Math.round(fraction * 100)}٪ (تب را باز نگه دارید)`;
    exportPercent.value = fraction * 100;
  } else {
    exportStatus.value = "در حال نهایی‌سازی فایل...";
    exportPercent.value = 100;
  }
}

function clearResult(): void {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = "";
  resultBlob.value = null;
  resultInfo.value = "";
}

async function exportVideo(): Promise<void> {
  if (isBusy.value || !canExport.value) return;

  clearResult();
  isExporting.value = true;
  exportFailed.value = false;
  exportPercent.value = 0;
  exportStatus.value = "شروع...";
  exporter = new LyricVideoExporter();
  audioEl.value?.pause();

  try {
    const result = await exporter.export(
      {
        vocals: props.vocals,
        range: range.value,
        size: videoSize.value,
        fps: clampFps(fps.value),
        lines: lines.value,
        style: style.value,
      },
      (progress) => onExportProgress(progress.phase, progress.fraction),
    );

    resultBlob.value = result.blob;
    resultUrl.value = URL.createObjectURL(result.blob);
    resultInfo.value = `${result.videoCodec} + ${result.audioCodec} · ${formatBytes(result.blob.size)}`;
    exportStatus.value =
      result.videoCodec === "avc" && result.audioCodec === "aac"
        ? "ویدئو آماده است."
        : "ویدئو آماده است؛ ولی مرورگر شما H.264/AAC ندارد و ممکن است اینستاگرام آن را نپذیرد.";
  } catch (error) {
    exportFailed.value = !(error instanceof ExportCancelledError);
    exportStatus.value = (error as Error).message;
  } finally {
    isExporting.value = false;
    exporter = null;
  }
}

function cancelExport(): void {
  exporter?.cancel();
}

function downloadVideo(): void {
  if (!resultBlob.value) return;

  const link = document.createElement("a");
  link.href = resultUrl.value;
  link.download = `${baseName(props.sourceName)}-lyrics.mp4`;
  link.click();
}

watch([style, lines, previewSize], () => void rebuildRenderer(), {
  flush: "post",
});

watch([rangeStart, rangeEnd], () => {
  if (words.value.length === 0 && lyricsText.value.trim().length > 0) {
    onLyricsInput();
  }
});

watch(fontId, () => {
  if (!availableWeights.value.includes(fontWeight.value)) {
    fontWeight.value = availableWeights.value.includes(400)
      ? 400
      : availableWeights.value[0];
  }
});

watch(sizePresetId, (id) => {
  const preset = SIZE_PRESETS.find((item) => item.id === id);
  if (preset) {
    customWidth.value = preset.width;
    customHeight.value = preset.height;
  }
});

onMounted(async () => {
  await nextTick();
  await rebuildRenderer();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (alignTimer !== null) clearTimeout(alignTimer);
  transcribeClient.cancel();
  exporter?.cancel();
  URL.revokeObjectURL(audioUrl);
  clearResult();
  backgroundBitmap.value?.close();
});
</script>

<style scoped>
.lyric-panel {
  margin-top: 6px;
}

.card {
  margin-bottom: 13px;
  padding: 15px;
  background: rgba(19, 29, 48, 0.88);
  border: 1px solid rgba(164, 188, 226, 0.16);
  border-radius: 16px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.14);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-heading strong {
  color: #e7eefc;
  font-size: 12px;
}

.pill {
  padding: 3px 9px;
  color: #63d6b3;
  background: rgba(99, 214, 179, 0.12);
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
}

.audio {
  width: 100%;
  margin-bottom: 10px;
}

.option-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: #91a3bf;
  font-size: 11px;
}

.field.align-end {
  justify-content: flex-end;
}

.field select,
.field input[type="number"],
.field textarea {
  width: 100%;
  padding: 9px 10px;
  color: #e7eefc;
  background: #0b1322;
  border: 1px solid rgba(164, 188, 226, 0.2);
  border-radius: 9px;
  font: inherit;
  font-size: 12px;
}

.field input[type="file"] {
  color: #91a3bf;
  font-size: 10px;
}

.field input[type="range"],
.scrubber {
  width: 100%;
  accent-color: #63d6b3;
}

.field select:disabled,
.field input:disabled,
.field textarea:disabled {
  opacity: 0.5;
}

.lyrics-field {
  margin: 12px 0 10px;
}

.lyrics-field textarea {
  min-height: 150px;
  line-height: 1.9;
  resize: vertical;
}

.color-row {
  display: flex;
  gap: 8px;
}

.color-row input[type="color"] {
  width: 44px;
  height: 34px;
  padding: 2px;
  background: #0b1322;
  border: 1px solid rgba(164, 188, 226, 0.2);
  border-radius: 8px;
  cursor: pointer;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  color: #e7eefc;
  font-size: 12px;
  cursor: pointer;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: #63d6b3;
}

.button-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.primary-button,
.secondary-button,
.ghost-button,
.download-button {
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

.ghost-button {
  color: #e7eefc;
  background: #17243a;
}

.download-button {
  margin-top: 10px;
  color: #06241d;
  background: #63d6b3;
}

.primary-button:disabled,
.secondary-button:disabled,
.ghost-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.note {
  margin: 10px 0 0;
  color: #91a3bf;
  font-size: 10px;
  line-height: 1.8;
}

.note.warn {
  color: #f2c97d;
}

.status-block {
  margin-top: 12px;
}

.progress-track {
  height: 7px;
  overflow: hidden;
  background: #0b1322;
  border-radius: 99px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #1ea983, #7ea6ff);
  border-radius: inherit;
  transition: width 0.25s ease;
}

.progress-bar.indeterminate {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

.preview {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 55vh;
  margin: 0 auto 12px;
  background: #000;
  border-radius: 12px;
}

.result {
  margin-top: 14px;
}

.result-video {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: 60vh;
  margin: 0 auto;
  background: #000;
  border-radius: 12px;
}

@media (min-width: 480px) {
  .option-grid {
    grid-template-columns: 1fr 1fr;
  }

  .button-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
